import { describe, expect, it } from "vitest";
import { findFoodBusinessesInput, getFoodBusinessInput } from "./tools";

describe("MCP input validation", () => {
  it("applies conservative paging defaults", () => {
    expect(findFoodBusinessesInput.parse({})).toMatchObject({ page: 1, limit: 10 });
  });

  it.each([
    { page: 0 },
    { page: 11 },
    { limit: 0 },
    { limit: 21 },
    { minimum_rating: 6 },
    { name: "x".repeat(101) },
    { business_type: "cafe" },
  ])("rejects invalid search input %#", (input) => {
    expect(findFoodBusinessesInput.safeParse(input).success).toBe(false);
  });

  it("requires a positive integer establishment ID", () => {
    expect(getFoodBusinessInput.safeParse({ establishment_id: 1 }).success).toBe(true);
    expect(getFoodBusinessInput.safeParse({ establishment_id: -1 }).success).toBe(false);
    expect(getFoodBusinessInput.safeParse({ establishment_id: 1.2 }).success).toBe(false);
  });
});
