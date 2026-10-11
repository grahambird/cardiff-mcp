import { afterEach, describe, expect, it, vi } from "vitest";
import { findSchoolsInput, runFindSchools } from "./school-tools";

afterEach(() => vi.restoreAllMocks());

describe("school MCP tool", () => {
  it("applies paging defaults and trims names", () => {
    expect(findSchoolsInput.parse({ name: " High " })).toEqual({ name: "High", page: 1, limit: 10 });
  });
  it.each([{ name: " " }, { name: "x".repeat(101) }, { page: 0 }, { page: 1.5 }, { limit: 21 }, { limit: 0 }, { phase: "college" }, { language_group: "Welsh" }])("rejects invalid input %#", (input) => {
    expect(findSchoolsInput.safeParse(input).success).toBe(false);
  });
  it("returns the standard envelope without logging search arguments or making requests", async () => {
    const logger = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await runFindSchools({ name: "private search phrase", page: 1, limit: 10 });
    expect(result.structuredContent).toHaveProperty("result.schools", []);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ schools: [], total_count: 0 });
    expect(logger.mock.calls[0][0]).not.toContain("private search phrase");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("returns explicit validation errors", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await runFindSchools({ page: 0, limit: 10 });
    expect(result).toMatchObject({ isError: true, structuredContent: { error: "invalid_input" } });
  });
});
