import { describe, expect, it } from "vitest";
import { boundariesIntersect, buildAssociations, geometryContains, locatePoint, lookupPostcode, matchLocation, normalizePostcode } from "./engine";
import type { Boundary, Geometry, Postcode } from "./types";

const square = (x: number, y = 0): Geometry => ({ type: "Polygon", coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]] });
const boundaries: Boundary[] = [
  { code: "ward-a", area_type: "ward", bbox: [0, 0, 1, 1], geometry: square(0) },
  { code: "ward-b", area_type: "ward", bbox: [1, 0, 2, 1], geometry: square(1) },
  { code: "lsoa-a", area_type: "lsoa", bbox: [0, 0, 1, 1], geometry: square(0) },
  { code: "msoa-a", area_type: "msoa", bbox: [0, 0, 1, 1], geometry: square(0) },
];
const postcode: Postcode = { postcode: "CF10 1AA", terminated: null, quality: 1, latitude: 0.5, longitude: 0.5, lsoa_code: "lsoa-a", msoa_code: "msoa-a" };
const postcodes = { "CF10 1AA": postcode };

describe("geographic matching", () => {
  it("matches coordinates independently, including zero coordinates, and refuses edges or overlapping polygons", () => {
    expect(locatePoint(boundaries, 0.5, 0.5).ward).toEqual({ code: "ward-a", method: "coordinates", accuracy: "exact" });
    expect(locatePoint(boundaries, 0.5, 1).ward).toMatchObject({ code: null, reason: "boundary_edge", candidates: ["ward-a", "ward-b"] });
    expect(locatePoint([...boundaries, { ...boundaries[0], code: "duplicate" }], 0.5, 0.5).ward.reason).toBe("overlapping_boundaries");
    expect(locatePoint(boundaries, NaN, 1).ward.reason).toBe("invalid_coordinates");
    expect(locatePoint(boundaries, 91, 1).ward.accuracy).toBe("unresolved");
  });
  it("respects holes and multipolygons and distinguishes touches from positive-area intersection", () => {
    const hole: Geometry = { type: "Polygon", coordinates: [...square(0).coordinates as [number, number][][], [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8], [0.2, 0.2]]] };
    expect(geometryContains([0.5, 0.5], hole)).toBe("outside");
    expect(geometryContains([0.2, 0.5], hole)).toBe("edge");
    const multi: Geometry = { type: "MultiPolygon", coordinates: [(square(0) as Extract<Geometry, { type: "Polygon" }>).coordinates, (square(3) as Extract<Geometry, { type: "Polygon" }>).coordinates] };
    expect(geometryContains([3.5, 0.5], multi)).toBe("inside");
    expect(boundariesIntersect(boundaries[0], boundaries[1])).toBe(false);
    expect(boundariesIntersect(boundaries[0], { ...boundaries[1], bbox: [0.5, 0, 1.5, 1], geometry: square(0.5) })).toBe(true);
  });
  it("normalises postcodes and distinguishes missing, invalid, unsupported, terminated and low-quality entries", () => {
    expect(normalizePostcode(" cf10  1aa ")).toBe("CF10 1AA");
    expect(normalizePostcode("not a postcode")).toBeNull();
    expect(lookupPostcode(postcodes, "cf101aa").record).toBe(postcode);
    expect(lookupPostcode(postcodes).reason).toBe("missing_postcode");
    expect(lookupPostcode(postcodes, "foo").reason).toBe("invalid_postcode");
    expect(lookupPostcode(postcodes, "CF10 2AA").reason).toBe("unsupported_postcode");
    expect(lookupPostcode({ "CF10 1AA": { ...postcode, terminated: "202001" } }, "CF101AA").reason).toBe("terminated_postcode");
    expect(lookupPostcode({ "CF10 1AA": { ...postcode, quality: 6 } }, "CF101AA").reason).toBe("unreliable_postcode_location");
  });
  it("uses postcode approximations only when valid coordinates are unavailable, allowing partial resolution", () => {
    expect(matchLocation(boundaries, postcodes, { postcode: "CF101AA" }).ward).toMatchObject({ code: "ward-a", method: "postcode", accuracy: "approximate" });
    expect(matchLocation(boundaries, postcodes, { latitude: NaN, longitude: 0, postcode: "CF101AA" }).ward.code).toBe("ward-a");
    expect(matchLocation(boundaries, postcodes, { latitude: 20, longitude: 20, postcode: "CF101AA" }).ward.code).toBeNull();
    const partial = matchLocation(boundaries.filter(b => b.area_type !== "ward"), postcodes, { latitude: 0.5, longitude: 0.5 });
    expect(partial.ward.code).toBeNull(); expect(partial.lsoa.code).toBe("lsoa-a");
  });
});

describe("independent association refresh", () => {
  const input = { source: "schools" as const, records: [{ id: "1", location: { address: "One", postcode: "CF101AA" } }], sourceSha256: "source-1", referenceVersion: "reference-1", locationSource: "https://example.gov", boundaries, postcodes, calculatedAt: "2026-01-01T00:00:00Z" };
  it("reuses unchanged locations across source-only changes and recalculates new or relocated records", () => {
    const previous = buildAssociations(input).snapshot;
    const unchanged = buildAssociations({ ...input, sourceSha256: "source-2", previous, calculatedAt: "2026-02-01T00:00:00Z" });
    expect(unchanged.report).toMatchObject({ reused: 1, recalculated: 0 });
    expect(unchanged.snapshot.associations["1"].calculated_at).toBe(input.calculatedAt);
    const changed = buildAssociations({ ...input, previous, records: [{ id: "1", location: { address: "Relocated within postcode", postcode: "CF101AA" } }, { id: "2", location: {} }] });
    expect(changed.report).toMatchObject({ reused: 0, recalculated: 2, unresolved: 1 });
    expect(previous.associations["1"].location_fingerprint).not.toBe(changed.snapshot.associations["1"].location_fingerprint);
  });
  it("supports reference-only and matcher invalidation, removals and explicit full rebuilds", () => {
    const previous = buildAssociations(input).snapshot;
    expect(buildAssociations({ ...input, previous, referenceVersion: "reference-2" }).report.recalculated).toBe(1);
    expect(buildAssociations({ ...input, previous: { ...previous, associations: { "1": { ...previous.associations["1"], matcher_version: "old" } } } }).report.recalculated).toBe(1);
    expect(buildAssociations({ ...input, previous, full: true }).snapshot).toEqual(previous);
    expect(buildAssociations({ ...input, previous, records: [] }).report.removed).toEqual(["1"]);
  });
  it("rejects invalid populations without mutating the previous snapshot", () => {
    const previous = buildAssociations(input).snapshot;
    const before = structuredClone(previous);
    expect(() => buildAssociations({ ...input, previous, records: [...input.records, ...input.records] })).toThrow("duplicate");
    expect(previous).toEqual(before);
  });
});
