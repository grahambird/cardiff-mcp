import { describe, expect, it, vi } from "vitest";
import { findFoodBusinessesInput, getFoodBusinessInput, runFindFoodBusinesses } from "./tools";

describe("MCP input validation", () => {
  it("applies conservative paging defaults", () => {
    expect(findFoodBusinessesInput.parse({})).toMatchObject({ page: 1, limit: 10 });
  });

  it.each([
    { sort_by: "inspection_date" },
    { sort_order: "sideways" },
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

  it("returns invalid_input without an upstream request", async () => {
    const logger = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const result = await runFindFoodBusinesses({ page: 0, limit: 5 });
      expect(result).toMatchObject({ isError: true, structuredContent: { error: "invalid_input" } });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      logger.mockRestore();
      fetchSpy.mockRestore();
    }
  });

  it("requires a positive integer establishment ID", () => {
    expect(getFoodBusinessInput.safeParse({ establishment_id: 1 }).success).toBe(true);
    expect(getFoodBusinessInput.safeParse({ establishment_id: -1 }).success).toBe(false);
    expect(getFoodBusinessInput.safeParse({ establishment_id: 1.2 }).success).toBe(false);
  });
});
