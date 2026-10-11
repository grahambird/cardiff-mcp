import { describe, expect, it, vi } from "vitest";

vi.mock("./directory.json", () => ({ default: {
  source_url: "https://www.gov.wales/addresses-and-phone-numbers-schools-and-pupil-referral-units",
  source_published_at: "2026-04-23", snapshot_imported_at: "2026-10-11T12:00:00Z",
  schools: [
    { school_id: "6810001", name: "Zulu School", local_authority_code: "681", sector: "Secondary", language_category: "English medium school / provision" },
    { school_id: "6810002", name: "Alpha School", local_authority_code: "681", sector: "Secondary", language_category: "Welsh medium school / provision (including transitional)" },
    { school_id: "6810003", name: "Beta School", local_authority_code: "681", sector: "Primary", language_category: "Dual language school / provision (Welsh and English) (including transitional)" },
    { school_id: "6800001", name: "Outside School", local_authority_code: "680", sector: "Secondary", language_category: "English medium school / provision" },
  ],
} }));

import { findSchools, languageGroup, SCHOOL_ATTRIBUTION } from "./directory";
const defaults = { page: 1, limit: 10 };

describe("school directory search", () => {
  it("restricts results to Cardiff and orders names alphabetically", () => {
    const result = findSchools(defaults);
    expect(result.schools.map((s) => s.name)).toEqual(["Alpha School", "Beta School", "Zulu School"]);
    expect(result.schools[0].school_id).toBe("6810002");
    expect(result).toMatchObject({ attribution: SCHOOL_ATTRIBUTION, source_published_at: "2026-04-23" });
  });
  it("matches name text case-insensitively", () => {
    expect(findSchools({ ...defaults, name: "ALPHA" }).schools.map((s) => s.school_id)).toEqual(["6810002"]);
  });
  it("combines phase, language and name filters with AND", () => {
    expect(findSchools({ ...defaults, phase: "secondary", language_group: "welsh_medium", name: "school" }).total_count).toBe(1);
    expect(findSchools({ ...defaults, phase: "primary", language_group: "welsh_medium" }).total_count).toBe(0);
    expect(findSchools({ ...defaults, phase: "primary" }).schools[0].name).toBe("Beta School");
  });
  it("preserves transitional labels and groups dual-language provision explicitly", () => {
    const result = findSchools({ ...defaults, language_group: "dual_language" });
    expect(result.schools[0].language_category).toContain("including transitional");
    expect(languageGroup("Not applicable")).toBe("not_applicable");
    expect(languageGroup("New category")).toBe("unknown");
  });
  it("paginates and treats an empty or out-of-range page as success", () => {
    expect(findSchools({ page: 1, limit: 2 })).toMatchObject({ total_count: 3, has_more: true });
    expect(findSchools({ page: 2, limit: 2 })).toMatchObject({ total_count: 3, has_more: false });
    expect(findSchools({ page: 3, limit: 2 })).toMatchObject({ schools: [], total_count: 3, has_more: false });
    expect(findSchools({ ...defaults, name: "missing" })).toMatchObject({ schools: [], total_count: 0 });
  });
});
