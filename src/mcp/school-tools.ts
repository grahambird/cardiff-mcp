import { getSchool } from "@/schools/profile";
import { z } from "zod";
import { findSchools, LANGUAGE_GROUPS, PHASES, SCHOOL_LIMITATIONS } from "@/schools/directory";
import { logEvent } from "@/lib/logger";

export const findSchoolsInput = z.object({
  name: z.string().trim().min(1).max(100).optional().describe("Case-insensitive text within the school name."),
  phase: z.enum(PHASES).optional(),
  language_group: z.enum(LANGUAGE_GROUPS).optional().describe("Published provision group; Welsh-medium and dual-language include transitional provision."),
  sort_by: z.literal("name").optional().describe("Sort the complete matching directory by name; defaults to name."),
  sort_order: z.enum(["asc", "desc"]).optional().describe("Defaults to asc; applies before pagination."),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(20).default(10),
});

export async function runFindSchools(input: z.infer<typeof findSchoolsInput>) {
  const startedAt = performance.now();
  try {
    const result = findSchools(findSchoolsInput.parse(input));
    logEvent("info", "mcp_tool_call", {
      tool: "find_schools", outcome: "success", duration_ms: Math.round(performance.now() - startedAt),
      result_count: result.schools.length, has_more: result.has_more,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: { result },
    };
  } catch (error) {
    const code = error instanceof z.ZodError ? "invalid_input" : "malformed";
    const message = code === "invalid_input" ? "Invalid school search parameters." : "The school directory could not be read.";
    logEvent("warn", "mcp_tool_call", {
      tool: "find_schools", outcome: "error", error_code: code,
      duration_ms: Math.round(performance.now() - startedAt),
    });
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({ error: code, message }) }],
      structuredContent: { error: code, message },
    };
  }
}

export const schoolToolLimitations = SCHOOL_LIMITATIONS;

export const getSchoolInput = z.object({
  school_id: z.string().regex(/^\d{7}$/).describe("Seven-digit school ID from find_schools; preserve as a string."),
});

export async function runGetSchool(input: z.infer<typeof getSchoolInput>) {
  const startedAt = performance.now();
  try {
    const { school_id } = getSchoolInput.parse(input);
    const result = getSchool(school_id);
    if (!result) throw new Error("not_found");
    logEvent("info", "mcp_tool_call", {
      tool: "get_school", outcome: "success", duration_ms: Math.round(performance.now() - startedAt),
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
      structuredContent: { result },
    };
  } catch (error) {
    const code = error instanceof z.ZodError ? "invalid_input" :
      error instanceof Error && error.message === "not_found" ? "not_found" : "malformed";
    const message = code === "invalid_input" ? "Supply a seven-digit school_id string." :
      code === "not_found" ? "School not found in the Cardiff maintained-school register." : "The school profile could not be read.";
    logEvent("warn", "mcp_tool_call", {
      tool: "get_school", outcome: "error", error_code: code,
      duration_ms: Math.round(performance.now() - startedAt),
    });
    return {
      isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: code, message }) }],
      structuredContent: { error: code, message },
    };
  }
}
