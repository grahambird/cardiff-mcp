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

async function requestJson(url: URL): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "x-api-version": "2",
        Accept: "application/json",
        "Accept-Language": "en-GB",
        "User-Agent": "mcp-wales/0.1 (+https://github.com/)",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new FsaError("timeout", "The Food Standards Agency request timed out.");
    }
    throw new FsaError("upstream", "The Food Standards Agency service could not be reached.");
  }

  if (response.status === 404) throw new FsaError("not_found", "No FSA establishment was found with that ID.", 404);
  if (response.status === 403 || response.status === 429) {
    throw new FsaError("throttled", "The Food Standards Agency is temporarily limiting requests. Please retry later.", response.status);
  }
  if (!response.ok) throw new FsaError("upstream", `The Food Standards Agency returned HTTP ${response.status}.`, response.status);

  try {
    return await response.json();
  } catch {
    throw new FsaError("malformed", "The Food Standards Agency returned invalid JSON.");
  }
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
    const isCardiff =
      record.LocalAuthorityCode === CARDIFF_LOCAL_AUTHORITY_CODE ||
      record.LocalAuthorityName?.trim().toLowerCase() === "cardiff";
    if (!isCardiff) throw new FsaError("outside_cardiff", "That establishment exists but is not within Cardiff local authority.");
    const retrievedAt = new Date().toISOString();
    return { ...mapEstablishment(record, retrievedAt), attribution: FSA_ATTRIBUTION };
  });
}

export function clearFsaCacheForTests(): void {
  cache.clear();
}
