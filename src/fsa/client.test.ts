import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSearchUrl,
  clearFsaCacheForTests,
  findFoodBusinesses,
  FsaError,
  getFoodBusiness,
} from "./client";

const record = {
  FHRSID: 1837642,
  BusinessName: "A-Head of the Game Nutrition",
  BusinessType: "Restaurant/Cafe/Canteen",
  BusinessTypeID: 1,
  AddressLine1: "8 Park Road",
  AddressLine2: "Whitchurch",
  AddressLine3: "Cardiff",
  AddressLine4: "",
  PostCode: "CF14 7BQ",
  RatingValue: "5",
  RatingDate: "2025-07-18T00:00:00",
  NewRatingPending: false,
  LocalAuthorityName: "Cardiff",
  LocalAuthorityCode: "556",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("FSA client", () => {
  beforeEach(() => {
    clearFsaCacheForTests();
    vi.stubEnv("FSA_API_BASE_URL", "https://fsa.test");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("builds a bounded Cardiff search using supported upstream filters", () => {
    const url = buildSearchUrl({
      name: "  coffee  ",
      business_type: "restaurant_cafe_canteen",
      minimum_rating: 5,
      page: 2,
      limit: 20,
    });
    expect(Object.fromEntries(url.searchParams)).toEqual({
      localAuthorityId: "339",
      schemeTypeKey: "FHRS",
      sortOptionKey: "alpha",
      pageNumber: "2",
      pageSize: "20",
      name: "coffee",
      businessTypeId: "1",
      ratingKey: "5",
      ratingOperatorKey: "GreaterThanOrEqual",
    });
  });

  it("maps search records and distinguishes empty results", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        establishments: [record],
        meta: { extractDate: "2026-10-11T12:00:00", totalCount: 21, totalPages: 3, pageNumber: 1 },
      }),
    ).mockResolvedValueOnce(
      jsonResponse({
        establishments: [],
        meta: { extractDate: "2026-10-11T12:00:00", totalCount: 0, totalPages: 0, pageNumber: 1 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const found = await findFoodBusinesses({ business_type: "restaurant_cafe_canteen", page: 1, limit: 10 });
    expect(found.businesses[0]).toMatchObject({
      establishment_id: 1837642,
      rating: 5,
      inspection_date: "2025-07-18",
      source_url: "https://ratings.food.gov.uk/business/1837642",
    });
    expect(found.has_more).toBe(true);
    expect(found.note).toContain("broader than cafés");

    const empty = await findFoodBusinesses({ name: "no-such-place", page: 1, limit: 10 });
    expect(empty.businesses).toEqual([]);
    expect(empty.total_count).toBe(0);
  });

  it("maps unusual and pending ratings without inventing a date", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      establishments: [{ ...record, FHRSID: 1, RatingValue: "AwaitingInspection", RatingDate: "1901-01-01T00:00:00", NewRatingPending: true }],
      meta: { extractDate: null, totalCount: 1, totalPages: 1, pageNumber: 1 },
    })));
    const result = await findFoodBusinesses({ page: 1, limit: 10 });
    expect(result.businesses[0]).toMatchObject({ rating: "AwaitingInspection", inspection_date: null, new_rating_pending: true });
  });

  it.each([
    [403, "throttled"],
    [429, "throttled"],
    [502, "upstream"],
  ])("maps HTTP %i to %s", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("failure", { status })));
    await expect(findFoodBusinesses({ page: 1, limit: 10 })).rejects.toMatchObject({ code });
  });

  it("distinguishes malformed data from upstream errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ unexpected: true })));
    await expect(findFoodBusinesses({ page: 1, limit: 10 })).rejects.toMatchObject({ code: "malformed" });
  });

  it("maps a request timeout", async () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));
    await expect(findFoodBusinesses({ page: 1, limit: 10 })).rejects.toMatchObject({ code: "timeout" });
  });

  it("returns not found distinctly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    await expect(getFoodBusiness(999999999)).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects a real establishment outside Cardiff", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ...record, LocalAuthorityName: "Swansea", LocalAuthorityCode: "568" })));
    await expect(getFoodBusiness(1837642)).rejects.toMatchObject({ code: "outside_cardiff" });
  });

  it("does not cache failures but does cache successful detail responses", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 502 }))
      .mockResolvedValue(jsonResponse(record));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getFoodBusiness(1837642)).rejects.toBeInstanceOf(FsaError);
    await getFoodBusiness(1837642);
    await getFoodBusiness(1837642);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
