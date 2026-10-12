import { createHash } from "node:crypto";
import { z } from "zod";
import { logEvent } from "@/lib/logger";
import type { FindWasteAddressesResult, WasteCollection, WasteCollectionsResult } from "./types";

export const WASTE_LOOKUP_URL = "https://www.cardiff.gov.uk/article/2115/When-are-my-bins-collected";
export const WASTE_UPDATES_URL = "https://www.cardiff.gov.uk/collectionupdates";

const DEFAULT_AUTH_URL = "https://authwebservice.cardiff.gov.uk/AuthenticationWebService.asmx?op=GetJWT";
const DEFAULT_API_URL = "https://api.cardiff.gov.uk";
const TIMEOUT_MS = 8_000;
const ADDRESS_TTL_MS = 5 * 60 * 1000;
const COLLECTION_TTL_MS = 15 * 60 * 1000;
const MAX_CONCURRENCY = 2;
const SOAP_BODY = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetJWT xmlns="http://tempuri.org/" /></soap:Body></soap:Envelope>`;

const addressSchema = z.object({ uprn: z.union([z.string(), z.number()]), fullAddress: z.string().min(1) });
const binSchema = z.object({ type: z.string().min(1), collectionType: z.string().nullish() });
const weekSchema = z.object({ date: z.string().min(10), bins: z.array(binSchema) });
const collectionsSchema = z.object({ collectionWeeks: z.array(weekSchema), hasGlassBin: z.boolean().optional() });

export type WasteErrorCode =
  | "timeout"
  | "throttled"
  | "access_denied"
  | "upstream"
  | "malformed"
  | "not_found";

export class WasteError extends Error {
  constructor(public readonly code: WasteErrorCode, message: string, public readonly status?: number) {
    super(message);
    this.name = "WasteError";
  }
}

type CacheEntry<T> = { value: T; storedAt: number; expiresAt: number };
const addressCache = new Map<string, CacheEntry<Omit<FindWasteAddressesResult, "cache_status">>>();
const collectionCache = new Map<string, CacheEntry<Omit<WasteCollectionsResult, "cache_status" | "data_age_seconds">>>();
const inFlight = new Map<string, Promise<unknown>>();
let activeRequests = 0;
const waiters: Array<() => void> = [];
let tokenCache: { token: string; expiresAt: number } | undefined;

function apiUrl(): string {
  return process.env.CARDIFF_WASTE_API_BASE_URL ?? DEFAULT_API_URL;
}

function authUrl(): string {
  return process.env.CARDIFF_WASTE_AUTH_URL ?? DEFAULT_AUTH_URL;
}

function privateKey(prefix: string, value: string): string {
  return `${prefix}:${createHash("sha256").update(value).digest("hex")}`;
}

async function withConcurrency<T>(operation: () => Promise<T>): Promise<T> {
  if (activeRequests >= MAX_CONCURRENCY) await new Promise<void>((resolve) => waiters.push(resolve));
  activeRequests += 1;
  try {
    return await operation();
  } finally {
    activeRequests -= 1;
    waiters.shift()?.();
  }
}

function retryDelay(response?: Response): number {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter && /^\d+$/.test(retryAfter)) return Math.min(Number(retryAfter) * 1000, 5_000);
  return 200 + Math.floor(Math.random() * 151);
}

async function upstreamRequest(operation: string, url: string, init: RequestInit): Promise<Response> {
  let lastResponse: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const startedAt = performance.now();
    try {
      const response = await withConcurrency(() => fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }));
      lastResponse = response;
      const retryable = response.status === 429 || response.status >= 500;
      logEvent(response.ok ? "info" : retryable ? "warn" : "error", "upstream_request", {
        provider: "cardiff_council_waste",
        operation,
        outcome: response.ok ? "success" : "http_error",
        status_category: `${Math.floor(response.status / 100)}xx`,
        duration_ms: Math.round(performance.now() - startedAt),
        retry_count: attempt,
      });
      if (!retryable || attempt === 1) return response;
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response)));
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      logEvent(attempt === 1 ? "error" : "warn", "upstream_request", {
        provider: "cardiff_council_waste",
        operation,
        outcome: timedOut ? "timeout" : "network_error",
        duration_ms: Math.round(performance.now() - startedAt),
        retry_count: attempt,
      });
      if (attempt === 1) throw new WasteError(timedOut ? "timeout" : "upstream", timedOut ? "The Cardiff Council request timed out." : "The Cardiff Council service could not be reached.");
      await new Promise((resolve) => setTimeout(resolve, retryDelay()));
    }
  }
  return lastResponse!;
}

function decodeXml(value: string): string {
  return value.replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}

function jwtExpiry(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { exp?: number };
    if (typeof payload.exp === "number") return payload.exp * 1000 - 60_000;
  } catch {
    // Some providers may issue an opaque token; use a short conservative TTL.
  }
  return Date.now() + 4 * 60 * 1000;
}

async function getToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  return singleFlight("token", async () => {
    if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;
    const response = await upstreamRequest("token", authUrl(), {
      method: "POST",
      headers: commonHeaders({ "Content-Type": "text/xml; charset=UTF-8" }),
      body: SOAP_BODY,
    });
    handleStatus(response);
    const xml = await response.text();
    const match = xml.match(/<GetJWTResult>([\s\S]*?)<\/GetJWTResult>/);
    if (!match) throw new WasteError("malformed", "Cardiff Council returned an unexpected token response.");
    try {
      const parsed = JSON.parse(decodeXml(match[1])) as { access_token?: unknown };
      if (typeof parsed.access_token !== "string" || !parsed.access_token) throw new Error();
      tokenCache = { token: parsed.access_token, expiresAt: jwtExpiry(parsed.access_token) };
      return parsed.access_token;
    } catch {
      throw new WasteError("malformed", "Cardiff Council returned an invalid access token.");
    }
  });
}

function commonHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { Origin: "https://www.cardiff.gov.uk", Referer: "https://www.cardiff.gov.uk/", "User-Agent": "mcp-wales/0.1", ...extra };
}

function handleStatus(response: Response): void {
  if (response.status === 401 || response.status === 403) throw new WasteError("access_denied", "Cardiff Council denied access to the waste service.", response.status);
  if (response.status === 429) throw new WasteError("throttled", "Cardiff Council is temporarily limiting requests.", 429);
  if (response.status === 404) throw new WasteError("not_found", "The property or waste service was not found.", 404);
  if (!response.ok) throw new WasteError("upstream", `Cardiff Council returned HTTP ${response.status}.`, response.status);
}

async function singleFlight<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = loader().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

function cacheLog(operation: string, cacheStatus: "hit" | "miss"): void {
  logEvent("info", "upstream_cache", { provider: "cardiff_council_waste", operation, cache_status: cacheStatus });
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new WasteError("malformed", "Cardiff Council returned invalid JSON.");
  }
}

export function normalizePostcode(value: string): string {
  const compact = value.toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact)) throw new WasteError("malformed", "Enter a valid UK postcode.");
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

export async function findWasteCollectionAddresses(input: { postcode: string; house_number?: string; limit: number }): Promise<FindWasteAddressesResult> {
  const postcode = normalizePostcode(input.postcode);
  const searchTerm = `${input.house_number?.trim() ? `${input.house_number.trim()} ` : ""}${postcode}`;
  const key = privateKey("address", searchTerm.toLowerCase());
  const cached = addressCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    cacheLog("address_search", "hit");
    return { ...cached.value, cache_status: "hit" };
  }
  cacheLog("address_search", "miss");
  return singleFlight(key, async () => {
    const token = await getToken();
    const response = await upstreamRequest("address_search", `${apiUrl()}/Location/api/AddressSearch/AddressSearchResidential`, {
      method: "POST",
      headers: commonHeaders({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }),
      body: JSON.stringify({ searchRequired: "simple", searchTerm, isWelsh: false, Purpose: "WasteCalendar" }),
    });
    const retrievedAt = new Date().toISOString();
    if (response.status === 204) {
      const value = { matches: [], match_count: 0, truncated: false, status: "no_matches" as const, source_url: WASTE_LOOKUP_URL, retrieved_at: retrievedAt };
      addressCache.set(key, { value, storedAt: Date.now(), expiresAt: Date.now() + ADDRESS_TTL_MS });
      return { ...value, cache_status: "miss" as const };
    }
    handleStatus(response);
    const parsed = z.array(addressSchema).safeParse(await readJson(response));
    if (!parsed.success) throw new WasteError("malformed", "Cardiff Council returned an unexpected address response.");
    const matches = parsed.data.slice(0, input.limit).map((item) => ({ property_id: String(item.uprn), display_address: item.fullAddress, source: "Cardiff Council" as const, retrieved_at: retrievedAt }));
    const value = { matches, match_count: parsed.data.length, truncated: parsed.data.length > input.limit, status: (parsed.data.length ? "ok" : "no_matches") as "ok" | "no_matches", source_url: WASTE_LOOKUP_URL, retrieved_at: retrievedAt };
    addressCache.set(key, { value, storedAt: Date.now(), expiresAt: Date.now() + ADDRESS_TTL_MS });
    return { ...value, cache_status: "miss" as const };
  });
}

function normalizeCollection(date: string, type: string, rawStatus: string | null | undefined): WasteCollection {
  const normalized = rawStatus?.trim().toLowerCase();
  return { date: date.slice(0, 10), waste_type: type, schedule_status_raw: rawStatus ?? null, schedule_status: normalized === "standard" ? "scheduled" : normalized === "moved" ? "rescheduled" : "unknown" };
}

export async function getWasteCollections(propertyId: string): Promise<WasteCollectionsResult> {
  const key = privateKey("collections", propertyId);
  const cached = collectionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    cacheLog("collections", "hit");
    return { ...cached.value, cache_status: "hit", data_age_seconds: Math.floor((Date.now() - cached.storedAt) / 1000) };
  }
  cacheLog("collections", "miss");
  return singleFlight(key, async () => {
    const token = await getToken();
    const response = await upstreamRequest("collections", `${apiUrl()}/WasteManagement/api/WasteCollection`, {
      method: "POST",
      headers: commonHeaders({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }),
      body: JSON.stringify({ systemReference: "web", language: "eng", uprn: propertyId }),
    });
    if (response.status === 204) throw new WasteError("not_found", "Cardiff Council has no waste schedule for that property identifier.", 204);
    handleStatus(response);
    const parsed = collectionsSchema.safeParse(await readJson(response));
    if (!parsed.success) throw new WasteError("malformed", "Cardiff Council returned an unexpected collection response.");
    const collections = parsed.data.collectionWeeks.flatMap((week) => week.bins.map((bin) => normalizeCollection(week.date, bin.type, bin.collectionType)));
    const dates = collections.map((item) => item.date).sort();
    const retrievedAt = new Date().toISOString();
    const value = {
      property_id: propertyId,
      collections,
      status: (collections.length ? "ok" : "no_collections") as "ok" | "no_collections",
      schedule_window_start: dates[0] ?? null,
      schedule_window_end: dates.at(-1) ?? null,
      source_url: WASTE_LOOKUP_URL,
      collection_updates_url: WASTE_UPDATES_URL,
      retrieved_at: retrievedAt,
      notice: "These are scheduled dates, not confirmation that a collection occurred. No future dates have been inferred. Check the official links for short-notice changes.",
    };
    collectionCache.set(key, { value, storedAt: Date.now(), expiresAt: Date.now() + COLLECTION_TTL_MS });
    return { ...value, cache_status: "miss" as const, data_age_seconds: 0 };
  });
}

export function clearWasteStateForTests(): void {
  addressCache.clear();
  collectionCache.clear();
  inFlight.clear();
  tokenCache = undefined;
  activeRequests = 0;
  waiters.length = 0;
}
