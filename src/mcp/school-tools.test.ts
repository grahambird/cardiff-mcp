import { afterEach, describe, expect, it, vi } from "vitest";
import { findSchoolsInput, runFindSchools, getSchoolInput, runGetSchool } from "./school-tools";

afterEach(() => vi.restoreAllMocks());

describe("school MCP tool", () => {
  it("applies paging defaults and trims names", () => {
    expect(findSchoolsInput.parse({ name: " High " })).toEqual({ name: "High", page: 1, limit: 10 });
  });
  it.each([{ sort_by: "rating" }, { sort_order: "sideways" }, { name: " " }, { name: "x".repeat(101) }, { page: 0 }, { page: 1.5 }, { limit: 21 }, { limit: 0 }, { phase: "college" }, { language_group: "Welsh" }])("rejects invalid input %#", (input) => {
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

describe("get_school MCP tool", () => {
  it.each([{ school_id: "123" }, { school_id: 6814039 }, { school_id: "Cardiff High" }])("rejects invalid identifiers %#", (input) => {
    expect(getSchoolInput.safeParse(input).success).toBe(false);
  });
  it("returns a combined profile without network requests or logging the ID", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const logger = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await runGetSchool({ school_id: "6814039" });
    expect(result.structuredContent).toHaveProperty("result.pupils.total.value", 1795);
    expect(JSON.parse(result.content[0].text)).toHaveProperty("sources.fsm.attribution");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logger.mock.calls[0][0]).not.toContain("6814039");
  });
  it("returns not_found and invalid_input distinctly", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await runGetSchool({ school_id: "6819999" })).toMatchObject({ isError: true, structuredContent: { error: "not_found" } });
    expect(await runGetSchool({ school_id: "bad" })).toMatchObject({ isError: true, structuredContent: { error: "invalid_input" } });
  });
});
