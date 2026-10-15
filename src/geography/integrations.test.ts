import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyRelease } from "../../scripts/verify-geography.mts";
import { AREAS, coverage, getRecordGeography, getRelatedAreas, resolveArea } from "./index";
import { lookupPostcode } from "./engine";
import type { Postcode } from "./types";
import { findSchools, summarizeSchoolsByWard } from "@/schools/directory";
import { findFoodBusinessesByWard, SNAPSHOT, summarizeFoodBusinessesByWard } from "@/fsa/snapshot";
import { getFoodBusiness, clearFsaCacheForTests } from "@/fsa/client";
import { runSummarizeFood, runSummarizeSchools } from "@/mcp/geography-tools";
import { runFindSchools } from "@/mcp/school-tools";
import { runFindFoodBusinesses } from "@/mcp/tools";
import { outputSchemas } from "@/mcp/output-schemas";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); clearFsaCacheForTests(); });
it("resolves official codes and Welsh names while refusing neighbourhood and partial-name assumptions", () => {
  expect(resolveArea("Caerdydd").code).toBe("W06000015");
  expect(resolveArea("Grangetown", { type: "ward" }).code).toMatch(/^W05/);
  expect(() => resolveArea("Whitchurch")).toThrow("Select an official area code");
  expect(() => resolveArea("Roath")).toThrow("Neighbourhoods");
  expect(() => resolveArea("Cardiff", { type: "ward" })).toThrow();
});
it("keeps exact statistical hierarchy, best-fit allocation and spatial intersection distinct", () => {
  const ward = resolveArea("Grangetown");
  expect(() => getRelatedAreas(ward.code, "lsoa")).toThrow("do not form an exact hierarchy");
  const bestFit = getRelatedAreas(ward.code, "lsoa", "best_fit");
  expect(bestFit).toMatchObject({ relationship: "best_fit", accuracy: "approximate" });
  expect(bestFit.areas.length).toBeGreaterThan(0);
  const intersecting = getRelatedAreas(ward.code, "lsoa", "spatial_intersection");
  expect(intersecting.areas.length).toBeGreaterThanOrEqual(bestFit.areas.length);
  const lsoa = bestFit.areas[0];
  expect(getRelatedAreas(lsoa.code, "msoa").areas[0].code).toBe(lsoa.parent_code);
  expect(AREAS.filter(a => a.area_type === "msoa").every(a => a.parent_code === "W06000015")).toBe(true);
});
it.each([
  ["6812311", "Grangetown"], ["6812092", "Rhiwbina"], ["6814051", "Llanishen"],
])("matches dated public school %s by postcode with explicit approximation", async (id, ward) => {
  const geography = getRecordGeography("schools", id);
  expect(geography.ward).toMatchObject({ code: resolveArea(ward).code, accuracy: "approximate", method: "postcode" });
  expect(findSchools({ ward, page: 1, limit: 20 }).schools.some(s => s.school_id === id)).toBe(true);
  // Postcodes are offline reference inputs, not a deployed lookup service.
  const postcodes = JSON.parse(readFileSync("src/geography/data/W06000015/postcodes.json", "utf8")).postcodes as Record<string, Postcode>;
  const result = lookupPostcode(postcodes, " cf14  6hl ");
  expect(result.record?.postcode).toBe("CF14 6HL");
});
it.each([
  ["968668", "Grangetown"], ["968433", "Rhiwbina"], ["969048", "Llanishen"],
])("matches dated FSA public coordinate fixture %s to its ward", (id, ward) => {
  expect(getRecordGeography("fsa", id).ward).toMatchObject({ code: resolveArea(ward).code, method: "coordinates", accuracy: "exact" });
});
it("computes all ward populations before pagination, including zero wards and unresolved coverage", () => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network expected"); }));
  const food = summarizeFoodBusinessesByWard({});
  expect(food.wards).toHaveLength(28);
  expect(food.authority_coverage.population).toBe(SNAPSHOT.records.length);
  expect(food.wards.reduce((sum, w) => sum + w.population, 0) + food.authority_coverage.unresolved).toBe(food.authority_coverage.population);
  for (const row of food.wards) {
    expect(Object.values(row.rating_counts).reduce((a, b) => a + b, 0)).toBe(row.population);
    expect(row.exact + row.approximate).toBe(row.population);
    expect(row.new_rating_pending_count).toBeLessThanOrEqual(row.population);
  }
  const ward = food.wards.find(w => w.population > 20)!;
  const page = findFoodBusinessesByWard({ ward: ward.area.code, page: 1, limit: 1 });
  expect(page.businesses).toHaveLength(1);
  expect(page.total_count).toBe(ward.population);
  expect(page.has_more).toBe(true);
  expect(page.data_mode).toBe("snapshot");
  const schools = summarizeSchoolsByWard({ phase: "secondary" });
  expect(schools.wards.some(w => w.population === 0)).toBe(true);
  expect(schools.wards.reduce((sum, w) => sum + w.population, 0) + schools.authority_coverage.unresolved).toBe(schools.authority_coverage.population);
});
it("sorts snapshot matches across adjacent pages in both directions, with numeric ratings before other states", () => {
  for (const sort_by of ["name", "rating"] as const) for (const sort_order of ["asc", "desc"] as const) {
    const input = { ward: "Grangetown", sort_by, sort_order, limit: 5 };
    const pages = [1, 2].flatMap(page => findFoodBusinessesByWard({ ...input, page }).businesses);
    expect(pages).toEqual(findFoodBusinessesByWard({ ...input, page: 1, limit: 10 }).businesses);
    expect(new Set(pages.map(r => r.establishment_id)).size).toBe(pages.length);
  }
  expect(findFoodBusinessesByWard({ ward: "Grangetown", minimum_rating: 5, page: 1, limit: 20 }).businesses.every(r => r.rating === 5)).toBe(true);
});
it("keeps detail retrieval live and refuses stale location joins", async () => {
  const raw = SNAPSHOT.records.find(r => r.FHRSID === "968668")!;
  const live = { ...raw, FHRSID: Number(raw.FHRSID), BusinessTypeID: Number(raw.BusinessTypeID), NewRatingPending: false, Geocode: undefined, geocode: { latitude: (raw.Geocode as { Latitude: string }).Latitude, longitude: (raw.Geocode as { Longitude: string }).Longitude } };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(live)));
  expect(await getFoodBusiness(968668)).toMatchObject({ geography: { ward: { name: "Grangetown" } } });
  clearFsaCacheForTests();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...live, AddressLine1: "Relocated premises" })));
  expect(await getFoodBusiness(968668)).toMatchObject({ geography: { ward: { code: null, reason: "association_pending_refresh" } } });
});
it("provides compatible bounded MCP results, geography errors and declared output contracts", async () => {
  vi.spyOn(console, "info").mockImplementation(() => undefined); vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const results = [
    ["summarize_schools_by_ward", await runSummarizeSchools({ wards: ["Rhiwbina", "Llanishen"], phase: "secondary" })],
    ["summarize_food_businesses_by_ward", await runSummarizeFood({ wards: ["Grangetown"] })],
    ["find_schools", await runFindSchools({ ward: "Grangetown", page: 1, limit: 3 })],
    ["find_food_businesses", await runFindFoodBusinesses({ ward: "Grangetown", page: 1, limit: 3 })],
  ] as const;
  for (const [name, result] of results) {
    expect(result).not.toHaveProperty("isError", true);
    expect(outputSchemas[name].safeParse(result.structuredContent), name).toMatchObject({ success: true });
  }
  expect(await runSummarizeFood({ wards: ["Grangetown", resolveArea("Grangetown").code] })).toMatchObject({ isError: true, structuredContent: { error: "invalid_input" } });
  expect(await runFindSchools({ ward: "Whitchurch", page: 1, limit: 1 })).toMatchObject({ isError: true, structuredContent: { error: "ambiguous_area", candidates: expect.any(Array) } });
  expect(await runFindFoodBusinesses({ ward: "Roath", page: 1, limit: 1 })).toMatchObject({ isError: true, structuredContent: { error: "not_found" } });
});
it("verifies independent release checksums and rejects partially promoted files without altering the active snapshot", () => {
  const original = verifyRelease();
  expect(original).toMatchObject({ schools: 126, establishments: SNAPSHOT.records.length });
  const directory = mkdtempSync(join(tmpdir(), "geography-release-"));
  try {
    const base = "src/geography/data/W06000015";
    const release = JSON.parse(readFileSync(join(base, "release.json"), "utf8"));
    for (const name of Object.keys(release.files)) copyFileSync(name === "fsa-source.json" ? "src/fsa/source.json" : join(base, name), join(directory, name));
    copyFileSync(join(base, "release.json"), join(directory, "release.json"));
    const associationPath = join(directory, "schools-associations.json");
    writeFileSync(associationPath, "{}");
    expect(() => verifyRelease(directory, "src/schools/directory.json", join(directory, "fsa-source.json"))).toThrow("checksum mismatch");
    expect(verifyRelease()).toEqual(original);
    expect(coverage([])).toEqual({ population: 0, exact: 0, approximate: 0, unresolved: 0 });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
