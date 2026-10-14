import { z } from "zod";
import { logEvent } from "@/lib/logger";
import { findAreas } from "@/ons/geography";
import { getDemographics, compareDemographics, rankDemographics } from "@/ons/statistics";
import { AREA_TYPES, TOPICS, METRICS, LIMITATIONS, OnsError } from "@/ons/types";
const area = z.string().trim().min(1).max(100).describe("Supported official code or exact official area name. Approximate/ambiguous names require selecting a code with find_census_areas.");
const topic = z.enum(TOPICS);
export const findCensusAreasInput = z.object({ query: area, area_type: z.enum(AREA_TYPES).optional(), limit: z.number().int().min(1).max(20).default(10) });
export const getAreaDemographicsInput = z.object({ area, topic, detail_level: z.enum(["summary", "full"]).default("summary") });
export const compareAreaDemographicsInput = z.object({ areas: z.array(area).min(2).max(5), topic });
export const rankAreasByDemographicInput = z.object({ parent_area: area.default("Cardiff"), area_type: z.enum(["ward", "msoa"]).default("ward"), metric: z.enum(METRICS), sort_order: z.enum(["asc", "desc"]).default("desc"), limit: z.number().int().min(1).max(20).default(10) });
async function run(tool: string, operation: () => unknown | Promise<unknown>) {
  const started = performance.now();
  try {
    const result = await operation();
    logEvent("info", "mcp_tool_call", { tool, outcome: "success", duration_ms: Math.round(performance.now() - started) });
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: { result } };
  } catch (error) {
    const e = error instanceof OnsError ? error : error instanceof z.ZodError ? new OnsError("invalid_input", "Invalid census tool parameters.") : new OnsError("upstream", "Census data could not be retrieved.");
    logEvent("warn", "mcp_tool_call", { tool, outcome: "error", error_code: e.code, upstream_status: e.status, duration_ms: Math.round(performance.now() - started) });
    const result = { error: e.code, message: e.message, candidates: e.candidates };
    return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result };
  }
}
export const runFindCensusAreas = (input: z.infer<typeof findCensusAreasInput>) => run("find_census_areas", () => { const p = findCensusAreasInput.parse(input); return findAreas(p.query, p.area_type, p.limit); });
export const runGetAreaDemographics = (input: z.infer<typeof getAreaDemographicsInput>) => run("get_area_demographics", () => { const p = getAreaDemographicsInput.parse(input); return getDemographics(p.area, p.topic, p.detail_level); });
export const runCompareAreaDemographics = (input: z.infer<typeof compareAreaDemographicsInput>) => run("compare_area_demographics", () => { const p = compareAreaDemographicsInput.parse(input); return compareDemographics(p.areas, p.topic); });
export const runRankAreasByDemographic = (input: z.infer<typeof rankAreasByDemographicInput>) => run("rank_areas_by_demographic", () => { const p = rankAreasByDemographicInput.parse(input); return rankDemographics(p.parent_area, p.area_type, p.metric, p.sort_order, p.limit); });
export const censusDescriptions = {
  find: `Resolve Cardiff neighbourhood names to official Census 2021 areas: Cardiff wards and MSOAs, plus all Welsh local authorities. Return codes, names and boundary notes. For Whitchurch or ambiguous/partial matches, select a candidate code explicitly before retrieving data. Roath has no single equivalent ward. ${LIMITATIONS}`,
  get: `Get official ONS Census 2021 population, age profiles, sex or Welsh-speaking ability for a supported area. Useful for Cardiff and its neighbourhoods, or Welsh local authorities. Summary age includes 65 or over; full age returns derived five-year bands. Welsh-speaking percentages use residents aged 3+. ${LIMITATIONS}`,
  compare: `Compare official Census 2021 demographic measures across 2–5 equivalent areas in one request, including Cardiff ward-level age profiles, Welsh-speaking ability and Cardiff versus Swansea. Use one geography type and preserve each denominator. ${LIMITATIONS}`,
  rank: `Rank Cardiff wards or MSOAs by official Census 2021 population, proportion aged 65 or over, or Welsh-speaking ability. Useful for neighbourhood demographic rankings; all eligible areas are considered before returning bounded results. ${LIMITATIONS}`,
};
