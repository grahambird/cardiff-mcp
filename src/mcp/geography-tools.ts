import { z } from "zod";
import { GeographyError } from "@/geography";
import { logEvent } from "@/lib/logger";
import { summarizeSchoolsByWard, LANGUAGE_GROUPS, PHASES } from "@/schools/directory";
import { summarizeFoodBusinessesByWard } from "@/fsa/snapshot";
import { BUSINESS_TYPES } from "@/fsa/types";

export const wardInput = z.string().trim().min(1).max(100).describe("Official May 2022 Cardiff ward code or unambiguous official English/Welsh ward name. Neighbourhoods are not assumed to be wards.");
const wards = z.array(wardInput).min(1).max(28).optional().describe("Distinct Cardiff wards; omit for all 28. All eligible source records are considered before returning summaries.");
export const summarizeSchoolsInput = z.object({ wards, phase: z.enum(PHASES).optional(), language_group: z.enum(LANGUAGE_GROUPS).optional() });
export const summarizeFoodInput = z.object({ wards, business_type: z.enum(Object.keys(BUSINESS_TYPES) as [keyof typeof BUSINESS_TYPES, ...(keyof typeof BUSINESS_TYPES)[]]).optional() });
export async function runGeographyTool(tool: string, operation: () => unknown) {
  const started = performance.now();
  try {
    const result = operation();
    logEvent("info", "mcp_tool_call", { tool, outcome: "success", duration_ms: Math.round(performance.now() - started) });
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: { result } };
  } catch (error) {
    const code = error instanceof GeographyError ? error.code : error instanceof z.ZodError ? "invalid_input" : "unavailable";
    const result = { error: code, message: error instanceof GeographyError ? error.message : code === "invalid_input" ? "Invalid ward summary parameters." : "The geographic snapshot is unavailable.",
      ...(error instanceof GeographyError && error.candidates ? { candidates: error.candidates } : {}) };
    logEvent("warn", "mcp_tool_call", { tool, outcome: "error", error_code: code, duration_ms: Math.round(performance.now() - started) });
    return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result };
  }
}
export const runSummarizeSchools = (input: z.infer<typeof summarizeSchoolsInput>) => runGeographyTool("summarize_schools_by_ward", () => summarizeSchoolsByWard(summarizeSchoolsInput.parse(input)));
export const runSummarizeFood = (input: z.infer<typeof summarizeFoodInput>) => runGeographyTool("summarize_food_businesses_by_ward", () => summarizeFoodBusinessesByWard(summarizeFoodInput.parse(input)));
