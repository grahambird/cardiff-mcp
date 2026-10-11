import { describe, expect, it } from "vitest";
import snapshot from "./directory.json";

describe("bundled school snapshot", () => {
  it("contains unique Cardiff school IDs and required directory fields without statistics", () => {
    expect(snapshot.schools.length).toBeGreaterThan(0);
    expect(new Set(snapshot.schools.map((s) => s.school_id)).size).toBe(snapshot.schools.length);
    for (const school of snapshot.schools) {
      expect(school.school_id).toMatch(/^681\d{4}$/);
      expect(school.local_authority_code).toBe("681");
      expect(school.local_authority).toBe("Cardiff");
      for (const key of ["name", "sector", "school_type", "governance", "language_category", "address", "postcode", "telephone"] as const) {
        expect(school[key].trim().length).toBeGreaterThan(0);
      }
      expect(school).not.toHaveProperty("pupils");
    }
    expect(snapshot.source_published_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(snapshot.snapshot_imported_at))).toBe(false);
    expect(snapshot.source_sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
