import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AREAS, findAreas, resolveArea } from "./geography";
import { DATASETS } from "./datasets";
import { clearOnsCacheForTests, requestJson } from "./client";
import { normalizeObservations, upstreamAreaType } from "./normalize";
import { calculate, compareDemographics, demographics, getDemographics, rankDemographics } from "./statistics";
import { type Area, type Topic } from "./types";
import { runFindCensusAreas, runGetAreaDemographics, runCompareAreaDemographics, runRankAreasByDemographic } from "@/mcp/census-tools";
const cardiff = resolveArea("Cardiff");
const wards = AREAS.filter(a => a.area_type === "ward");
const fixture = (areas: Area[], topic: Topic, reversed = false) => {
  const category = { dimension_name: DATASETS[topic].dimension, options: [...DATASETS[topic].categories].reverse().map(id => ({ id, label: id })) };
  const geography = { dimension_name: upstreamAreaType[areas[0].area_type], options: [...areas].reverse().map(a => ({ id: a.code, label: a.name })) };
  const dimensions = reversed ? [category, geography] : [geography, category];
  const observations = dimensions[0].options.flatMap((_, i) => dimensions[1].options.map((_, j) => {
    const categoryId = category.options[reversed ? i : j].id;
    const areaId = geography.options[reversed ? j : i].id;
    const areaIndex = areas.findIndex(a => a.code === areaId);
    return topic === "welsh_speaking" ? categoryId === "-8" ? 50 : categoryId === "0" ? 80 : 20 + areaIndex : topic === "age" ? Number(categoryId) >= 65 ? 2 : 1 : 100 + areaIndex;
  }));
  const versionUrl = `https://api.beta.ons.gov.uk/v1/datasets/${DATASETS[topic].id}/editions/2021/versions/${DATASETS[topic].version}`;
  return { links: { version: { href: versionUrl }, dataset_metadata: { href: `${versionUrl}/metadata` } }, dimensions, observations, total_observations: observations.length, blocked_areas: 0, total_areas: areas.length, areas_returned: areas.length };
};
const fetchMock = vi.fn();
beforeEach(() => { clearOnsCacheForTests(); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function responseFor(areas: Area[], topic: Topic, reversed = false) { fetchMock.mockResolvedValue(new Response(JSON.stringify(fixture(areas, topic, reversed)))); }

describe("official geography catalogue and resolution", () => {
  it("contains complete, unique scoped identifiers with provenance", () => {
    expect(new Set(AREAS.map(a => a.code)).size).toBe(98);
    expect(wards).toHaveLength(28);
    expect(AREAS.filter(a => a.area_type === "msoa")).toHaveLength(48);
    expect(AREAS.filter(a => a.area_type === "local_authority")).toHaveLength(22);
    expect(wards.every(a => a.parent_code === cardiff.code && a.boundary_date === "2022-05")).toBe(true);
  });
  it("resolves codes, names, Cardiff qualification and published Welsh aliases", () => {
    expect(resolveArea("Llanishen, Cardiff").code).toBe("W05001284");
    expect(resolveArea("w05001279").name).toBe("Grangetown");
    expect(resolveArea("Caerdydd").code).toBe(cardiff.code);
    expect(resolveArea("Abertawe").name).toBe("Swansea");
  });
  it("requires explicit selection for Whitchurch, partial matches and ambiguous names", () => {
    expect(findAreas("Whitchurch").areas[0]).toMatchObject({ code: "W05001297", requires_selection: true, match_type: "partial" });
    expect(() => resolveArea("Whitchurch")).toThrow("Select an official area code");
    expect(findAreas("Llandaff").total_count).toBe(2);
    expect(resolveArea("Llandaff").code).toBe("W05001282");
    expect(findAreas("Cardiff", "msoa", 3)).toMatchObject({ total_count: 48, has_more: true });
    expect(findAreas("Roath")).toMatchObject({ areas: [], total_count: 0 });
    expect(() => resolveArea("W01001717")).toThrow();
  });
});

describe("normalization and deterministic statistics", () => {
  it.each([false, true])("decodes returned area/category order and dimension order (%s)", reversed => {
    const result = normalizeObservations(fixture(wards.slice(0, 2), "welsh_speaking", reversed), wards.slice(0, 2), "welsh_speaking");
    expect(result.get(wards[0].code)).toEqual({ "-8": 50, "0": 80, "1": 20 });
    expect(result.get(wards[1].code)?.["1"]).toBe(21);
  });
  it("uses eligible residents for Welsh percentages, excluding does-not-apply", () => {
    expect(calculate({ "-8": 50, "0": 80, "1": 20 }, "welsh_speaking", "full")).toMatchObject({ denominator: 100, excluded_count: 50, measures: { can_speak_welsh: { count: 20, percentage: 20 } } });
    expect(calculate({ "-8": 50, "0": 0, "1": 0 }, "welsh_speaking").measures.can_speak_welsh.percentage).toBeNull();
  });
  it("includes age 65 and 100+ and produces complete derived five-year bands", () => {
    const values = Object.fromEntries(DATASETS.age.categories.map(id => [id, Number(id) === 65 || Number(id) === 100 ? 10 : 0]));
    const result = calculate(values, "age", "full");
    expect(result.measures.aged_65_plus).toEqual({ count: 20, percentage: 100 });
    expect(result.breakdown).toHaveLength(21);
    expect(result.breakdown?.reduce((sum, m) => sum + m.count, 0)).toBe(result.denominator);
  });
  it.each(["blocked", "missing", "foreign", "duplicate", "truncated", "negative", "dimension", "extra_category", "wrong_version"])("rejects %s responses", problem => {
    const d = fixture(wards.slice(0, 2), "sex");
    if (problem === "wrong_version") d.links.version.href = d.links.version.href.replace("versions/4", "versions/1");
    if (problem === "blocked") d.blocked_areas = 1;
    if (problem === "missing") d.areas_returned = 1;
    if (problem === "foreign") d.dimensions[0].options[0].id = "E05000001";
    if (problem === "duplicate") d.dimensions[0].options[0].id = d.dimensions[0].options[1].id;
    if (problem === "truncated") d.observations.pop();
    if (problem === "negative") d.observations[0] = -1;
    if (problem === "dimension") d.dimensions[1].dimension_name = "unexpected";
    if (problem === "extra_category") d.dimensions[1].options.push({ id: "3", label: "Unexpected" });
    expect(() => normalizeObservations(d, wards.slice(0, 2), "sex")).toThrow();
  });
});

describe("bounded census queries and rankings", () => {
  it.each(["population", "age", "sex", "welsh_speaking"] as Topic[])("retrieves %s with provenance and census date", async topic => {
    responseFor([cardiff], topic);
    const result = await getDemographics("Cardiff", topic, "full");
    expect(result).toMatchObject({ area: { code: cardiff.code }, census_date: "2021-03-21", dataset_id: DATASETS[topic].id, dataset_version: DATASETS[topic].version });
    expect(result.limitations).toContain("not today's population");
    expect(result.source_url).toContain("www.ons.gov.uk/datasets/");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("compares two wards and Cardiff/Swansea in one request each", async () => {
    responseFor([resolveArea("Llanishen"), resolveArea("Grangetown")], "age", true);
    expect((await compareDemographics(["Llanishen", "Grangetown"], "age")).areas).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    responseFor([cardiff, resolveArea("Swansea")], "population");
    expect((await compareDemographics(["Cardiff", "Swansea"], "population")).areas).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("rejects duplicate codes, incompatible geographies and approximate names before fetching", async () => {
    await expect(compareDemographics(["Cardiff", "Caerdydd"], "population")).rejects.toMatchObject({ code: "invalid_input" });
    await expect(compareDemographics(["Cardiff", "Llanishen"], "age")).rejects.toMatchObject({ code: "invalid_input" });
    await expect(getDemographics("Whitchurch", "age", "summary")).rejects.toMatchObject({ code: "ambiguous_area" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("ranks the complete set before limiting, with accurate eligible denominators", async () => {
    responseFor(wards, "welsh_speaking");
    const result = await rankDemographics("Cardiff", "ward", "welsh_speaking_percentage", "desc", 3);
    expect(result).toMatchObject({ complete: true, areas_considered: 28, eligible_area_count: 28, unit: "percent" });
    expect(result.results.map(r => r.area.code)).toEqual(wards.slice(-3).reverse().map(a => a.code));
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("area-type")?.split(",")).toHaveLength(29);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("uses stable code tie ordering and marks ties", async () => {
    const d = fixture(wards, "population"); d.observations.fill(50);
    fetchMock.mockResolvedValue(new Response(JSON.stringify(d)));
    const result = await rankDemographics("Cardiff", "ward", "population", "desc", 2);
    expect(result.results.map(r => r.area.code)).toEqual(wards.slice(0, 2).map(a => a.code));
    expect(result.results.every(r => r.tied)).toBe(true);
  });
  it("supports MSOA rankings but rejects non-Cardiff rankings", async () => {
    const msoas = AREAS.filter(a => a.area_type === "msoa"); responseFor(msoas, "age");
    expect((await rankDemographics("Cardiff", "msoa", "aged_65_plus_percentage", "asc", 1)).areas_considered).toBe(48);
    await expect(rankDemographics("Swansea", "ward", "population", "desc", 1)).rejects.toMatchObject({ code: "unsupported_scope" });
  });
  it("fails on incomplete rankings and does not cache invalid observations", async () => {
    const d = fixture(wards, "population"); d.areas_returned = 27;
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(d))));
    for (let i = 0; i < 2; i++) await expect(rankDemographics("Cardiff", "ward", "population", "desc", 2)).rejects.toMatchObject({ code: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("transport and tool failures", () => {
  it("deduplicates simultaneous loads and caches successful responses", async () => {
    responseFor([cardiff], "sex");
    await Promise.all([demographics([cardiff], "sex"), demographics([cardiff], "sex")]);
    await demographics([cardiff], "sex"); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("expires cached observations after five minutes", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(fixture([cardiff], "sex")))));
    await demographics([cardiff], "sex");
    vi.mocked(Date.now).mockReturnValue(now + 300001);
    await demographics([cardiff], "sex");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("bounds concurrency to two requests", async () => {
    let active = 0, maximum = 0;
    fetchMock.mockImplementation(async () => {
      active++; maximum = Math.max(active, maximum);
      await new Promise(resolve => setTimeout(resolve, 10));
      active--;
      return new Response("{}");
    });
    await Promise.all([requestJson("https://test/one"), requestJson("https://test/two"), requestJson("https://test/three")]);
    expect(maximum).toBe(2);
  });
  it("retries a transient 503 once", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Unavailable", { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify(fixture([cardiff], "sex"))));
    await demographics([cardiff], "sex"); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("honours a 429 cooldown without retrying early", async () => {
    fetchMock.mockResolvedValue(new Response("Rate limited", { status: 429, headers: { "Retry-After": "60" } }));
    await expect(demographics([cardiff], "sex")).rejects.toMatchObject({ code: "throttled" });
    await expect(demographics([cardiff], "age")).rejects.toMatchObject({ code: "throttled" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([[403, "upstream"], [404, "unavailable"], [400, "upstream"]])("maps HTTP %s without retries", async (status, code) => {
    fetchMock.mockResolvedValue(new Response("error", { status: status as number }));
    await expect(demographics([cardiff], "sex")).rejects.toMatchObject({ code }); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed JSON and oversized streaming bodies", async () => {
    fetchMock.mockResolvedValue(new Response("not json"));
    await expect(requestJson("https://test/json")).rejects.toMatchObject({ code: "malformed" });
    fetchMock.mockResolvedValue(new Response(" ".repeat(128 * 1024 + 1)));
    await expect(requestJson("https://test/large")).rejects.toMatchObject({ code: "malformed" });
  });
  it("returns timeout for aborts", async () => {
    fetchMock.mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    await expect(demographics([cardiff], "sex")).rejects.toMatchObject({ code: "timeout" });
  });
  it("returns structured candidates and bounds all tool inputs", async () => {
    const result = await runGetAreaDemographics({ area: "Whitchurch", topic: "age", detail_level: "summary" });
    expect(result.structuredContent).toMatchObject({ error: "ambiguous_area", candidates: [{ code: "W05001297" }] });
    expect((await runFindCensusAreas({ query: "Cardiff", limit: 21 })).structuredContent).toMatchObject({ error: "invalid_input" });
    expect((await runCompareAreaDemographics({ areas: ["Cardiff"], topic: "population" })).structuredContent).toMatchObject({ error: "invalid_input" });
    expect((await runRankAreasByDemographic({ parent_area: "Cardiff", area_type: "ward", metric: "population", sort_order: "desc", limit: 0 })).structuredContent).toMatchObject({ error: "invalid_input" });
  });
});
