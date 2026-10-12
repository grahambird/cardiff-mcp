import { describe, expect, it, vi } from "vitest";

vi.mock("./directory.json", () => ({ default: {
  source_url: "https://www.gov.wales/addresses-and-phone-numbers-schools-and-pupil-referral-units",
  source_published_at: "2026-04-23", snapshot_imported_at: "2026-10-11T12:00:00Z",
  schools: [
    ...[12, 3, 8, 1, 10, 5, 2, 11, 4, 9, 6, 7].map((n) => ({
      school_id: `6811${String(n).padStart(3, "0")}`,
      name: `Ordered ${String(n).padStart(2, "0")}`,
      local_authority_code: "681", sector: "Special", language_category: "Not applicable",
    })),
    { school_id: "6811014", name: "Ordered 06", local_authority_code: "681", sector: "Special", language_category: "Not applicable" },
    { school_id: "6810001", name: "Zulu School", local_authority_code: "681", sector: "Secondary", language_category: "English medium school / provision" },
    { school_id: "6810002", name: "Alpha School", local_authority_code: "681", sector: "Secondary", language_category: "Welsh medium school / provision (including transitional)" },
    { school_id: "6810003", name: "Beta School", local_authority_code: "681", sector: "Primary", language_category: "Dual language school / provision (Welsh and English) (including transitional)" },
    { school_id: "6800001", name: "Outside School", local_authority_code: "680", sector: "Secondary", language_category: "English medium school / provision" },
  ],
} }));

vi.mock("./statswales/characteristics.json", () => ({ default: {
  source: { source_url: "https://stats.gov.wales/en-GB/test", provider: "Welsh Government",
    reporting_period: "2025/26", census_date: "2026-01-20", attribution: "OGL v3.0" },
  schools: Object.fromEntries([
    ...Array.from({ length: 10 }, (_, i) => [`6811${String(i + 1).padStart(3, "0")}`,
      { total: { value: i * 100, status: "reported" } }]),
    ["6811011", { total: { value: null, status: "suppressed", note: "Confidential" } }],
    ["6811014", { total: { value: 500, status: "reported" } }],
    ["6810001", { total: { value: 2000, status: "reported" } }],
    ["6810002", { total: { value: 1000, status: "reported" } }],
    ["6800001", { total: { value: 9999, status: "reported" } }],
  ]),
} }));

import { findSchools, languageGroup, SCHOOL_ATTRIBUTION } from "./directory";
const defaults = { page: 1, limit: 10 };

describe("school directory search", () => {
  it("restricts results to Cardiff and orders names alphabetically", () => {
    const result = findSchools({ ...defaults, name: "School" });
    expect(result.schools.map((s) => s.name)).toEqual(["Alpha School", "Beta School", "Zulu School"]);
    expect(result.schools[0].school_id).toBe("6810002");
    expect(result).toMatchObject({ attribution: SCHOOL_ATTRIBUTION, source_published_at: "2026-04-23" });
  });
  it("sorts the complete filtered set before returning five and keeps tied IDs ascending", () => {
    const input = { page: 1, limit: 5, phase: "special" as const, sort_by: "name" as const };
    expect(findSchools(input).schools.map((s) => s.name)).toEqual(["Ordered 01", "Ordered 02", "Ordered 03", "Ordered 04", "Ordered 05"]);
    expect(findSchools({ ...input, sort_order: "desc" }).schools.map((s) => s.name)).toEqual(["Ordered 12", "Ordered 11", "Ordered 10", "Ordered 09", "Ordered 08"]);
    for (const sort_order of ["asc", "desc"] as const) {
      const pages = [1, 2, 3].flatMap((page) => findSchools({ ...input, sort_order, page }).schools);
      expect(pages).toEqual(findSchools({ ...input, sort_order, limit: 20 }).schools);
      expect(new Set(pages.map((s) => s.school_id)).size).toBe(13);
      expect(pages.filter((s) => s.name === "Ordered 06").map((s) => s.school_id)).toEqual(["6811006", "6811014"]);
      expect(findSchools({ ...input, sort_order, page: 2 }).schools).toEqual(pages.slice(5, 10));
    }
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
    expect(findSchools({ name: "School", page: 1, limit: 2 })).toMatchObject({ total_count: 3, has_more: true });
    expect(findSchools({ name: "School", page: 2, limit: 2 })).toMatchObject({ total_count: 3, has_more: false });
    expect(findSchools({ name: "School", page: 3, limit: 2 })).toMatchObject({ schools: [], total_count: 3, has_more: false });
    expect(findSchools({ ...defaults, name: "missing" })).toMatchObject({ schools: [], total_count: 0 });
  });
});

describe("school pupil-total discovery", () => {
  const input = { page: 1, limit: 5, sort_by: "pupil_total" as const, phase: "special" as const };
  it("finds the largest and smallest in one bounded result and preserves default shape", () => {
    expect(findSchools({ page: 1, limit: 1, sort_by: "pupil_total", sort_order: "desc" }).schools[0].school_id).toBe("6810001");
    expect(findSchools({ ...input, limit: 1 }).schools[0]).toMatchObject({ school_id: "6811001", pupil_total: { value: 0, status: "reported" } });
    expect(findSchools(defaults)).not.toHaveProperty("pupil_statistics");
    expect(findSchools(defaults).schools.every((s) => !("pupil_total" in s))).toBe(true);
  });
  it("sorts first five across the full filtered set in either direction", () => {
    expect(findSchools(input).schools.map((s) => s.school_id)).toEqual(["6811001", "6811002", "6811003", "6811004", "6811005"]);
    expect(findSchools({ ...input, sort_order: "desc" }).schools.map((s) => s.school_id)).toEqual(["6811010", "6811009", "6811008", "6811007", "6811006"]);
    expect(findSchools({ ...input, phase: "secondary", language_group: "welsh_medium", name: "alpha" }).schools.map((s) => s.school_id)).toEqual(["6810002"]);
  });
  it.each(["asc", "desc"] as const)("keeps ties stable and missing/suppressed values last for %s", (sort_order) => {
    const all = findSchools({ ...input, sort_order, limit: 20 });
    expect(all.pupil_statistics).toMatchObject({ reported_count: 11, unavailable_count: 2, source: { reporting_period: "2025/26", census_date: "2026-01-20" } });
    expect(all.schools.filter((s) => "pupil_total" in s && s.pupil_total.value === 500).map((s) => s.school_id)).toEqual(["6811006", "6811014"]);
    expect(all.schools.slice(-2)).toMatchObject([
      { school_id: "6811011", pupil_total: { value: null, status: "suppressed", note: "Confidential" } },
      { school_id: "6811012", pupil_total: { value: null, status: "unavailable" } },
    ]);
    const pages = [1, 2, 3].flatMap((page) => findSchools({ ...input, sort_order, page }).schools);
    expect(pages).toEqual(all.schools);
    expect(new Set(pages.map((s) => s.school_id)).size).toBe(13);
    expect(findSchools({ ...input, sort_order, page: 2 }).schools).toEqual(pages.slice(5, 10));
  });
  it("reports zero coverage for empty matches and unchanged full coverage on out-of-range pages", () => {
    expect(findSchools({ ...input, name: "missing" })).toMatchObject({ schools: [], pupil_statistics: { reported_count: 0, unavailable_count: 0 } });
    expect(findSchools({ ...input, page: 100 })).toMatchObject({ schools: [], total_count: 13, has_more: false, pupil_statistics: { reported_count: 11, unavailable_count: 2 } });
    expect(findSchools({ ...input, name: "Ordered 12" })).toMatchObject({ pupil_statistics: { reported_count: 0, unavailable_count: 1 } });
  });
});
