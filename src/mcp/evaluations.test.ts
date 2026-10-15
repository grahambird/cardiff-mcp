import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import prompts from "../../scripts/fixtures/census-prompts.json";
import { outputSchemas } from "./output-schemas";
import * as geography from "./geography-tools";
import * as census from "./census-tools";
import * as food from "./tools";
import * as schools from "./school-tools";
import { DATASETS } from "@/ons/datasets";
import { AREAS } from "@/ons/geography";
import { clearOnsCacheForTests } from "@/ons/client";
import { clearFsaCacheForTests } from "@/fsa/client";
import { POST } from "@/app/mcp/route";

const contracts = {
  summarize_schools_by_ward: { input: geography.summarizeSchoolsInput, run: geography.runSummarizeSchools },
  summarize_food_businesses_by_ward: { input: geography.summarizeFoodInput, run: geography.runSummarizeFood },
  find_census_areas: { input: census.findCensusAreasInput, run: census.runFindCensusAreas },
  get_area_demographics: { input: census.getAreaDemographicsInput, run: census.runGetAreaDemographics },
  compare_area_demographics: { input: census.compareAreaDemographicsInput, run: census.runCompareAreaDemographics },
  rank_areas_by_demographic: { input: census.rankAreasByDemographicInput, run: census.runRankAreasByDemographic },
  find_food_businesses: { input: food.findFoodBusinessesInput, run: food.runFindFoodBusinesses },
  get_food_business: { input: food.getFoodBusinessInput, run: food.runGetFoodBusiness },
  find_schools: { input: schools.findSchoolsInput, run: schools.runFindSchools },
  get_school: { input: schools.getSchoolInput, run: schools.runGetSchool },
};
const fixtureSchema = z.object({ prompt: z.string().min(1), tool: z.enum(Object.keys(contracts) as [keyof typeof contracts, ...(keyof typeof contracts)[]]).optional(), arguments: z.record(z.string(), z.unknown()).optional(), max_calls: z.number().int().min(0).max(3), checks: z.array(z.string().min(1)).min(1), baseline: z.string().min(1), expected_error: z.string().optional(), synthetic: z.boolean().optional() });
const establishment = { FHRSID: 123, BusinessName: "Synthetic Costa", BusinessType: "Restaurant/Cafe/Canteen", RatingValue: "5", RatingDate: "2026-01-01", LocalAuthorityCode: "556", LocalAuthorityName: "Cardiff" };
function mockSources() {
  clearOnsCacheForTests(); clearFsaCacheForTests();
  vi.stubGlobal("fetch", vi.fn(async (input: URL | string | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/Establishments")) return Response.json(url.searchParams.has("pageSize") ? { establishments: [establishment], meta: { totalCount: 1, totalPages: 1, pageNumber: 1 } } : establishment);
    const dataset = Object.values(DATASETS).find(d => url.pathname.includes(d.id))!;
    if (!dataset) throw new Error("Unexpected mocked URL");
    const [type, ...codes] = url.searchParams.get("area-type")!.split(",");
    const base = url.origin + url.pathname.replace(/\/json$/, "");
    return Response.json({ links: { version: { href: base }, dataset_metadata: { href: `${base}/metadata` } }, dimensions: [
      { dimension_name: type, options: codes.map(id => ({ id, label: AREAS.find(a => a.code === id)!.name })) },
      { dimension_name: dataset.dimension, options: dataset.categories.map(id => ({ id, label: id })) },
    ], observations: codes.flatMap(() => dataset.categories.map(() => 10)), total_observations: codes.length * dataset.categories.length, blocked_areas: 0, total_areas: codes.length, areas_returned: codes.length });
  }));
}
beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => undefined); vi.spyOn(console, "warn").mockImplementation(() => undefined); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("validates reusable prompts and executes all expected tools against mocked source contracts", async () => {
  mockSources();
  const exercised = new Set<string>();
  for (const raw of prompts) {
    const fixture = fixtureSchema.parse(raw);
    if (!fixture.tool) { expect(fixture.max_calls).toBe(0); continue; }
    expect(fixture.max_calls).toBeGreaterThan(0);
    const contract = contracts[fixture.tool];
    // Heterogeneous tool signatures are validated by the selected input schema.
    const args = contract.input.parse(fixture.arguments);
    const result = await (contract.run as (input: typeof args) => Promise<unknown>)(args);
    expect(outputSchemas[fixture.tool].safeParse((result as { structuredContent: unknown }).structuredContent), fixture.prompt).toMatchObject({ success: true });
    if (fixture.expected_error) expect(result).toMatchObject({ isError: true, structuredContent: { error: fixture.expected_error } });
    else expect(result).not.toHaveProperty("isError", true);
    exercised.add(fixture.tool);
  }
  expect([...exercised].sort()).toEqual(Object.keys(contracts).sort());
});

it.each(["2025-03-26", "2026-07-28"])("executes all ten tools over HTTP with %s", async version => {
  mockSources();
  const args = {
    summarize_schools_by_ward: { wards: ["Grangetown"] }, summarize_food_businesses_by_ward: { wards: ["Grangetown"] },
    find_census_areas: { query: "Cardiff" }, get_area_demographics: { area: "Cardiff", topic: "age", detail_level: "full" },
    compare_area_demographics: { areas: ["Cardiff", "Swansea"], topic: "sex" }, rank_areas_by_demographic: { metric: "population", limit: 1 },
    find_food_businesses: { name: "Costa", limit: 5 }, get_food_business: { establishment_id: 123 },
    find_schools: { sort_by: "pupil_total", limit: 1 }, get_school: { school_id: "6812003" },
  };
  for (const [name, parameters] of Object.entries(args)) {
    const params = { name, arguments: parameters, ...(version === "2026-07-28" ? { _meta: { "io.modelcontextprotocol/protocolVersion": version, "io.modelcontextprotocol/clientCapabilities": {} } } : {}) };
    const response = await POST(new Request("http://localhost:3000/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": version, ...(version === "2026-07-28" ? { "Mcp-Method": "tools/call", "Mcp-Name": name } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params }) }));
    const body = await response.text();
    const data = body.startsWith("event:") || body.startsWith("data:") ? body.split("\n").find(l => l.startsWith("data: "))!.slice(6) : body;
    const rpc = JSON.parse(data);
    expect(response.status, body).toBe(200);
    expect(rpc.error, body).toBeUndefined();
    expect(rpc.result?.isError, body).not.toBe(true);
    expect(outputSchemas[name as keyof typeof outputSchemas].safeParse(rpc.result.structuredContent), body).toMatchObject({ success: true });
  }
});

it.each(["2025-03-26", "2026-07-28"])("keeps discovery and tool execution errors compatible with %s", async version => {
  for (const method of ["tools/list", "tools/call"]) {
    const modern = version === "2026-07-28";
    const params = { ...(method === "tools/call" ? { name: "get_school", arguments: { school_id: "9999999" } } : {}), ...(modern ? { _meta: { "io.modelcontextprotocol/protocolVersion": version, "io.modelcontextprotocol/clientCapabilities": {} } } : {}) };
    const response = await POST(new Request("https://mcp.wales/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": version, ...(modern ? { "mcp-method": method, ...(method === "tools/call" ? { "mcp-name": "get_school" } : {}) } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }));
    const body = await response.text();
    const json = JSON.parse(body.includes("data: ") ? body.split("\n").find(l => l.startsWith("data: "))!.slice(6) : body);
    expect(response.status, body).toBe(200);
    if (method === "tools/list") expect(json.result.tools).toHaveLength(10);
    else {
      expect(json.result).toMatchObject({ isError: true, structuredContent: { error: "not_found" } });
      expect(outputSchemas.get_school.safeParse(json.result.structuredContent).success).toBe(true);
    }
  }
});

it("requires attribution, dates, limitations and nested fields in output contracts", async () => {
  mockSources();
  const response = await census.runGetAreaDemographics({ area: "Cardiff", topic: "population", detail_level: "summary" });
  const structured = outputSchemas.get_area_demographics.parse(response.structuredContent);
  expect(outputSchemas.get_area_demographics.safeParse(structured).success).toBe(true);
  if (!("result" in structured)) throw new Error("Expected result");
  for (const field of ["attribution", "census_date", "source_retrieved_at", "limitations", "denominator"]) {
    const broken = { ...structured.result } as Record<string, unknown>;
    delete broken[field];
    expect(outputSchemas.get_area_demographics.safeParse({ result: broken }).success, field).toBe(false);
  }
});
