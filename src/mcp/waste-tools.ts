import { z } from "zod";
import { findWasteCollectionAddresses, getWasteCollections, WasteError } from "@/waste/client";
import { logEvent } from "@/lib/logger";

export const findWasteCollectionAddressesInput = z.object({
  postcode: z.string().trim().min(5).max(10).describe("A Cardiff postcode. The postcode is used only for this lookup and is not logged."),
  house_number: z.string().trim().min(1).max(20).optional().describe("Optional house number or short property identifier used to narrow the matches."),
  limit: z.number().int().min(1).max(20).default(10),
});

export const getWasteCollectionsInput = z.object({
  property_id: z.string().regex(/^\d{1,20}$/).describe("The UPRN string from find_waste_collection_addresses. Ask the user to select an address; never choose one silently."),
});

export const wasteToolLimitations =
  "Dates are scheduled collections, not confirmation that collection occurred. Do not infer later dates from a pattern. A missing schedule is not proof that no service exists. Only describe a collection as rescheduled when the source explicitly marks it as Moved. The data may not reflect every short-notice disruption.";

function success(value: unknown) {
  return { content: [{ type: "text" as const, text: `${JSON.stringify(value, null, 2)}\n\n${wasteToolLimitations}` }], structuredContent: { result: value } };
}

function failure(error: WasteError) {
  return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: error.code, message: error.message }) }], structuredContent: { error: error.code, message: error.message } };
}

function normalizeError(error: unknown): WasteError {
  if (error instanceof WasteError) return error;
  if (error instanceof z.ZodError) return new WasteError("malformed", "The waste-tool input was invalid.");
  return new WasteError("upstream", "An unexpected error occurred while reading Cardiff Council waste data.");
}

export async function runFindWasteCollectionAddresses(input: z.infer<typeof findWasteCollectionAddressesInput>) {
  const startedAt = performance.now();
  try {
    const parsed = findWasteCollectionAddressesInput.parse(input);
    const result = await findWasteCollectionAddresses(parsed);
    logEvent("info", "mcp_tool_call", { tool: "find_waste_collection_addresses", outcome: "success", duration_ms: Math.round(performance.now() - startedAt), result_count: result.matches.length, truncated: result.truncated });
    return success(result);
  } catch (error) {
    const wasteError = normalizeError(error);
    logEvent(wasteError.code === "malformed" || wasteError.code === "upstream" ? "error" : "warn", "mcp_tool_call", { tool: "find_waste_collection_addresses", outcome: "error", error_code: wasteError.code, upstream_status: wasteError.status, duration_ms: Math.round(performance.now() - startedAt) });
    return failure(wasteError);
  }
}

export async function runGetWasteCollections(input: z.infer<typeof getWasteCollectionsInput>) {
  const startedAt = performance.now();
  try {
    const parsed = getWasteCollectionsInput.parse(input);
    const result = await getWasteCollections(parsed.property_id);
    logEvent("info", "mcp_tool_call", { tool: "get_waste_collections", outcome: "success", duration_ms: Math.round(performance.now() - startedAt), result_count: result.collections.length });
    return success(result);
  } catch (error) {
    const wasteError = normalizeError(error);
    logEvent(wasteError.code === "malformed" || wasteError.code === "upstream" ? "error" : "warn", "mcp_tool_call", { tool: "get_waste_collections", outcome: "error", error_code: wasteError.code, upstream_status: wasteError.status, duration_ms: Math.round(performance.now() - startedAt) });
    return failure(wasteError);
  }
}
