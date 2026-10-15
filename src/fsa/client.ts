import { z } from "zod";
import { TtlCache } from "@/lib/cache";
import {
  BUSINESS_TYPES,
  type FindBusinessesInput,
  type FindBusinessesResult,
  type FoodBusiness,
} from "./types";

export const CARDIFF_LOCAL_AUTHORITY_ID = 339;
export const CARDIFF_LOCAL_AUTHORITY_CODE = "556";
export const FSA_ATTRIBUTION =
  "Contains public sector information licensed under the Open Government Licence v3.0. Source: Food Standards Agency.";

const DEFAULT_BASE_URL = "https://api.ratings.food.gov.uk";
const TIMEOUT_MS = 8_000;
const SENTINEL_DATE = "1901-01-01";

const nullableString = z.string().nullable().optional();
const establishmentSchema = z.object({
  FHRSID: z.number().int().positive(),
  BusinessName: z.string(),
  BusinessType: z.string(),
  BusinessTypeID: z.number().int().optional(),
  AddressLine1: nullableString,
  AddressLine2: nullableString,
  AddressLine3: nullableString,
  AddressLine4: nullableString,
  PostCode: nullableString,
  RatingValue: z.string(),
  RatingDate: nullableString,
  NewRatingPending: z.boolean().default(false),
  LocalAuthorityName: nullableString,
  LocalAuthorityCode: nullableString,
});

const searchSchema = z.object({
  establishments: z.array(establishmentSchema),
  meta: z.object({
    extractDate: nullableString,
    totalCount: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    pageNumber: z.number().int().positive(),
  }),
});

type Establishment = z.infer<typeof establishmentSchema>;

export type FsaErrorCode = "invalid_input" | "timeout" | "throttled" | "upstream" | "malformed" | "not_found" | "outside_cardiff";

export class FsaError extends Error {
  constructor(public readonly code: FsaErrorCode, message: string, public readonly status?: number) {
    super(message);
    this.name = "FsaError";
  }
}

const cache = new TtlCache(5 * 60 * 1000);

function baseUrl(): string {
  return process.env.FSA_API_BASE_URL ?? DEFAULT_BASE_URL;
}

export function buildSearchUrl(input: FindBusinessesInput): URL {
  const url = new URL("/Establishments", baseUrl());
  url.searchParams.set("localAuthorityId", String(CARDIFF_LOCAL_AUTHORITY_ID));
  url.searchParams.set("schemeTypeKey", "FHRS");
  const sortKeys = {
    name: { asc: "alpha", desc: "desc_alpha" },
    // FSA names these keys counterintuitively; verified via /SortOptions.
    rating: { asc: "desc_rating", desc: "rating" },
  } as const;
  url.searchParams.set("sortOptionKey", sortKeys[input.sort_by ?? "name"][input.sort_order ?? "asc"]);
  url.searchParams.set("pageNumber", String(input.page));
  url.searchParams.set("pageSize", String(input.limit));
  if (input.name) url.searchParams.set("name", input.name.trim());
  if (input.business_type) url.searchParams.set("businessTypeId", String(BUSINESS_TYPES[input.business_type]));
  if (input.minimum_rating !== undefined) {
    url.searchParams.set("ratingKey", String(input.minimum_rating));
    url.searchParams.set("ratingOperatorKey", "GreaterThanOrEqual");
  }
  return url;
}

let active = 0;
let cooldown = 0;
const MAX_BYTES = 512 * 1024;
async function requestJson(url: URL): Promise<unknown> {
  const deadline = Date.now() + 20_000;
  while (true) {
    if (Date.now() >= deadline) throw new FsaError("timeout", "The Food Standards Agency operation timed out.");
    if (Date.now() < cooldown) throw new FsaError("throttled", "The Food Standards Agency is temporarily limiting requests. Please retry later.", 429);
    if (active < 2) break;
    await new Promise(resolve => setTimeout(resolve, Math.min(50, deadline - Date.now())));
  }
  active++;
  const signal = AbortSignal.timeout(Math.max(1, Math.min(TIMEOUT_MS, deadline - Date.now())));
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "x-api-version": "2", Accept: "application/json", "Accept-Language": "en-GB", "User-Agent": "mcp-wales/0.1 (+https://mcp.wales)" },
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429) {
        const header = response.headers.get("retry-after");
        const delay = header && /^\d+$/.test(header) ? Number(header) * 1000 : header ? Date.parse(header) - Date.now() : 10_000;
        cooldown = Math.max(cooldown, Date.now() + (Number.isFinite(delay) ? Math.max(1000, delay) : 10_000));
      }
      if (response.status === 404) throw new FsaError("not_found", "No FSA establishment was found with that ID.", 404);
      if ([403, 429].includes(response.status)) throw new FsaError("throttled", "The Food Standards Agency is temporarily limiting requests. Please retry later.", response.status);
      throw new FsaError("upstream", `The Food Standards Agency returned HTTP ${response.status}.`, response.status);
    }
    if (Number(response.headers.get("content-length")) > MAX_BYTES) {
      await response.body?.cancel();
      throw new FsaError("malformed", "The Food Standards Agency response exceeds the size limit.");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new FsaError("malformed", "The Food Standards Agency returned an empty response.");
    const abort = () => { void reader.cancel().catch(() => undefined); };
    signal.addEventListener("abort", abort, { once: true });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) {
          await reader.cancel();
          throw new FsaError("malformed", "The Food Standards Agency response exceeds the size limit.");
        }
        chunks.push(value);
      }
    } finally { signal.removeEventListener("abort", abort); reader.releaseLock(); }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new FsaError("malformed", "The Food Standards Agency returned invalid JSON."); }
  } catch (error) {
    if (error instanceof FsaError) throw error;
    if (signal.aborted || error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) throw new FsaError("timeout", "The Food Standards Agency request timed out.");
    throw new FsaError("upstream", "The Food Standards Agency service could not be reached.");
  } finally { active--; }
}

function isCardiff(record: Establishment): boolean {
  return record.LocalAuthorityCode === CARDIFF_LOCAL_AUTHORITY_CODE || record.LocalAuthorityName?.trim().toLowerCase() === "cardiff";
}

function mapRating(value: string): FoodBusiness["rating"] {
  if (/^[0-5]$/.test(value)) return Number(value);
  const normalized = value.replace(/[\s_-]/g, "").toLowerCase();
  if (normalized === "awaitinginspection") return "AwaitingInspection";
  if (normalized === "awaitingpublication") return "AwaitingPublication";
  if (normalized === "exempt") return "Exempt";
  return "Other";
}

function mapEstablishment(value: Establishment, retrievedAt: string): FoodBusiness {
  const address = [value.AddressLine1, value.AddressLine2, value.AddressLine3, value.AddressLine4, value.PostCode]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(", ");
  const inspectionDate = value.RatingDate?.slice(0, 10);
  return {
    establishment_id: value.FHRSID,
    business_name: value.BusinessName,
    address,
    business_type: value.BusinessType,
    rating: mapRating(value.RatingValue),
    rating_label: value.RatingValue,
    inspection_date: inspectionDate && inspectionDate !== SENTINEL_DATE ? inspectionDate : null,
    new_rating_pending: value.NewRatingPending,
    source_url: `https://ratings.food.gov.uk/business/${value.FHRSID}`,
    source_retrieved_at: retrievedAt,
  };
}

function parseEstablishment(value: unknown): Establishment {
  const parsed = establishmentSchema.safeParse(value);
  if (!parsed.success) throw new FsaError("malformed", "The Food Standards Agency returned an unexpected establishment record.");
  return parsed.data;
}

export async function findFoodBusinesses(input: FindBusinessesInput): Promise<FindBusinessesResult> {
  const url = buildSearchUrl(input);
  return cache.getOrLoad(url.toString(), async () => {
    const raw = await requestJson(url);
    const parsed = searchSchema.safeParse(raw);
    if (!parsed.success) throw new FsaError("malformed", "The Food Standards Agency returned an unexpected search response.");
    const { establishments, meta } = parsed.data;
    if (establishments.length > input.limit || meta.pageNumber !== input.page ||
        meta.totalPages !== Math.ceil(meta.totalCount / input.limit) || establishments.length > meta.totalCount ||
        (input.page > meta.totalPages && establishments.length > 0)) {
      throw new FsaError("malformed", "The Food Standards Agency returned inconsistent pagination.");
    }
    if (!establishments.every(isCardiff)) throw new FsaError("outside_cardiff", "The Food Standards Agency returned records outside Cardiff.");
    const retrievedAt = new Date().toISOString();
    return {
      businesses: parsed.data.establishments.map((item) => mapEstablishment(item, retrievedAt)),
      total_count: parsed.data.meta.totalCount,
      page: parsed.data.meta.pageNumber,
      has_more: parsed.data.meta.pageNumber < parsed.data.meta.totalPages,
      source_extract_time: parsed.data.meta.extractDate ?? null,
      source_retrieved_at: retrievedAt,
      note:
        input.business_type === "restaurant_cafe_canteen"
          ? "The FSA category Restaurant/Cafe/Canteen is broader than cafés alone."
          : undefined,
      attribution: FSA_ATTRIBUTION,
    };
  });
}

export async function getFoodBusiness(establishmentId: number): Promise<FoodBusiness & { attribution: string }> {
  const url = new URL(`/Establishments/${establishmentId}`, baseUrl());
  return cache.getOrLoad(url.toString(), async () => {
    const record = parseEstablishment(await requestJson(url));
    if (!isCardiff(record)) throw new FsaError("outside_cardiff", "That establishment exists but is not within Cardiff local authority.");
    const retrievedAt = new Date().toISOString();
    return { ...mapEstablishment(record, retrievedAt), attribution: FSA_ATTRIBUTION };
  });
}

export function clearFsaCacheForTests(): void {
  cache.clear();
  cooldown = 0;
}
