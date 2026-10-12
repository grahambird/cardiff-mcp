import { z } from "zod";
import { findFoodBusinesses, FsaError, getFoodBusiness } from "@/fsa/client";
import { BUSINESS_TYPES } from "@/fsa/types";
import { logEvent } from "@/lib/logger";

export const findFoodBusinessesInput = z.object({
  name: z.string().trim().min(1).max(100).optional().describe("Terms to search within the business name."),
  business_type: z.enum(Object.keys(BUSINESS_TYPES) as [keyof typeof BUSINESS_TYPES, ...(keyof typeof BUSINESS_TYPES)[]]).optional(),
  minimum_rating: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
  sort_by: z.enum(["name", "rating"]).optional().describe("Server-side sort of all matches; defaults to name. Inspection-date sorting is unavailable."),
  sort_order: z.enum(["asc", "desc"]).optional().describe("Defaults to asc. Non-numeric rating placement and ties are controlled by FSA."),
  page: z.number().int().min(1).max(10).default(1),
  limit: z.number().int().min(1).max(20).default(10),
});

export const getFoodBusinessInput = z.object({
  establishment_id: z.number().int().positive().describe("The FSA FHRSID for a food establishment."),
});

const LIMITATIONS =
  "Ratings reflect hygiene standards found on the inspection date, not food quality. FSA data does not include menus, opening hours, bookings, or availability. Non-numeric and pending ratings must not be treated as numeric ratings.";

function success(value: unknown) {
  return {
    content: [{ type: "text" as const, text: `${JSON.stringify(value, null, 2)}\n\n${LIMITATIONS}` }],
    structuredContent: { result: value },
  };
}

function normalizeError(error: unknown): FsaError {
  if (error instanceof z.ZodError) return new FsaError("invalid_input", "Invalid food business parameters.");
  return error instanceof FsaError ? error : new FsaError("upstream", "An unexpected error occurred while reading FSA data.");
}

function failure(fsaError: FsaError) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ error: fsaError.code, message: fsaError.message }) }],
    structuredContent: { error: fsaError.code, message: fsaError.message },
  };
}

export async function runFindFoodBusinesses(input: z.infer<typeof findFoodBusinessesInput>) {
  const startedAt = performance.now();
  try {
    const result = await findFoodBusinesses(findFoodBusinessesInput.parse(input));
    logEvent("info", "mcp_tool_call", {
      tool: "find_food_businesses",
      outcome: "success",
      duration_ms: Math.round(performance.now() - startedAt),
      result_count: result.businesses.length,
      has_more: result.has_more,
    });
    return success(result);
  } catch (error) {
    const fsaError = normalizeError(error);
    logEvent(fsaError.code === "upstream" || fsaError.code === "malformed" ? "error" : "warn", "mcp_tool_call", {
      tool: "find_food_businesses",
      outcome: "error",
      error_code: fsaError.code,
      upstream_status: fsaError.status,
      duration_ms: Math.round(performance.now() - startedAt),
    });
    return failure(fsaError);
  }
}

export async function runGetFoodBusiness(input: z.infer<typeof getFoodBusinessInput>) {
  const startedAt = performance.now();
  try {
    const parsed = getFoodBusinessInput.parse(input);
    const result = await getFoodBusiness(parsed.establishment_id);
    logEvent("info", "mcp_tool_call", {
      tool: "get_food_business",
      outcome: "success",
      duration_ms: Math.round(performance.now() - startedAt),
    });
    return success(result);
  } catch (error) {
    const fsaError = normalizeError(error);
    logEvent(fsaError.code === "upstream" || fsaError.code === "malformed" ? "error" : "warn", "mcp_tool_call", {
      tool: "get_food_business",
      outcome: "error",
      error_code: fsaError.code,
      upstream_status: fsaError.status,
      duration_ms: Math.round(performance.now() - startedAt),
    });
    return failure(fsaError);
  }
}

export const toolLimitations = LIMITATIONS;
