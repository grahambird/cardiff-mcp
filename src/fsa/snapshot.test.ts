import { afterEach, expect, it, vi } from "vitest";

// Synthetic population deliberately larger than discovery's public page size.
vi.mock("./source.json", () => ({ default: {
  source_url: "https://ratings.food.gov.uk/api/open-data-files/FHRS556en-GB.xml",
  source_extract_time: "2026-01-01", source_retrieved_at: "2026-01-02T00:00:00Z", expected_count: 45,
  records: Array.from({ length: 45 }, (_, i) => ({
    FHRSID: String(i + 1), BusinessName: `Synthetic ${String(i + 1).padStart(2, "0")}`, BusinessType: "Restaurant/Cafe/Canteen",
    BusinessTypeID: "1", RatingValue: i < 30 ? String(i % 6) : "AwaitingInspection", RatingDate: "1901-01-01",
    NewRatingPending: i % 2 ? "True" : "False", LocalAuthorityCode: "556", PostCode: "CF10 1AA",
  })),
} }));
vi.mock("@/geography", async importOriginal => {
  const real = await importOriginal<typeof import("@/geography")>();
  return { ...real, getRecordGeography: (_source: string, id: string) => {
    const n = Number(id);
    const code = n <= 30 ? real.resolveArea("Grangetown").code : n <= 35 ? real.resolveArea("Llanishen").code : null;
    const match = { code, method: code ? n % 2 ? "coordinates" : "postcode" : "none", accuracy: code ? n % 2 ? "exact" : "approximate" : "unresolved", ...(code ? {} : { reason: "missing_postcode" }) };
    return { reference_version: real.REFERENCE.version, calculated_at: "2026-01-02T00:00:00Z", ward: match, lsoa: { code: null, method: "none", accuracy: "unresolved", reason: "missing_location" }, msoa: { code: null, method: "none", accuracy: "unresolved", reason: "missing_location" } };
  } };
});
import { findFoodBusinessesByWard, summarizeFoodBusinessesByWard } from "./snapshot";

afterEach(() => vi.useRealTimers());
it("summarises every eligible synthetic record, never a paginated discovery subset", () => {
  const summary = summarizeFoodBusinessesByWard({});
  expect(summary.authority_coverage).toEqual({ population: 45, exact: 18, approximate: 17, unresolved: 10 });
  const grangetown = summary.wards.find(w => w.area.name === "Grangetown")!;
  expect(grangetown).toMatchObject({ population: 30, exact: 15, approximate: 15, numeric_rating_denominator: 30, new_rating_pending_count: 15 });
  expect(grangetown.rating_counts).toMatchObject({ "0": 5, "1": 5, "2": 5, "3": 5, "4": 5, "5": 5 });
  expect(grangetown.numeric_rating_percentages["5"]).toBe(16.67);
  const pages = [1, 2].flatMap(page => findFoodBusinessesByWard({ ward: "Grangetown", page, limit: 20 }).businesses);
  expect(pages).toHaveLength(30);
  expect(new Set(pages.map(r => r.establishment_id)).size).toBe(30);
  expect(findFoodBusinessesByWard({ ward: "Grangetown", minimum_rating: 5, page: 1, limit: 20 }).total_count).toBe(5);
  expect(findFoodBusinessesByWard({ ward: "Grangetown", business_type: "pub_bar_nightclub", page: 1, limit: 20 }).total_count).toBe(0);
});
it("preserves non-numeric states, zero denominators, pending flags, missing dates and zero wards", () => {
  const summary = summarizeFoodBusinessesByWard({ wards: ["Llanishen", "Rhiwbina"] });
  expect(summary.wards[0]).toMatchObject({ population: 5, rating_counts: { AwaitingInspection: 5 }, numeric_rating_denominator: 0, numeric_rating_percentages: { "0": null, "5": null } });
  expect(summary.wards[1].population).toBe(0);
  expect(findFoodBusinessesByWard({ ward: "Llanishen", page: 1, limit: 10 }).businesses.every(r => r.inspection_date === null && r.rating === "AwaitingInspection")).toBe(true);
});
it("exposes snapshot age and the stale warning rather than claiming cached ratings are live", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
  expect(summarizeFoodBusinessesByWard({})).toMatchObject({ data_mode: "snapshot", snapshot_age_days: 59, freshness_warning: expect.stringContaining("more than 30 days") });
});
