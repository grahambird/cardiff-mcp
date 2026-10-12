import { describe, expect, it } from "vitest";
import register from "../directory.json";
import characteristics from "./characteristics.json";
import yearGroups from "./year_groups.json";
import fsm from "./fsm.json";

describe("bundled StatsWales snapshots", () => {
  it("retains independent source provenance and valid Cardiff identifiers", () => {
    for (const snapshot of [characteristics, yearGroups, fsm]) {
      expect(snapshot.source.provider).toBe("Welsh Government");
      expect(snapshot.source.publishing_service).toBe("StatsWales");
      expect(snapshot.source.revision_id).toMatch(/^[\da-f-]{36}$/);
      expect(snapshot.source.input_sha256).toMatch(/^[\da-f]{64}$/);
      expect(snapshot.source.metadata_sha256).toMatch(/^[\da-f]{64}$/);
      expect(snapshot.source.reporting_period).toMatch(/^\d{4}\/\d{2}$/);
      expect(Number.isNaN(Date.parse(snapshot.source.snapshot_imported_at))).toBe(false);
      expect(Object.keys(snapshot.schools).length).toBeGreaterThan(0);
      for (const [id, school] of Object.entries(snapshot.schools)) {
        expect(id).toMatch(/^681\d{4}$/);
        expect(school.school_id).toBe(id);
        expect(school.source_name.length).toBeGreaterThan(0);
      }
    }
  });
  it("validates measure states and rounding without requiring fixed live values", () => {
    const walk = (value: unknown): void => {
      if (value && typeof value === "object") {
        const object = value as Record<string, unknown>;
        if ("status" in object) {
          expect(["reported", "suppressed", "unavailable", "not_applicable"]).toContain(object.status);
          if (object.status === "reported") {
            expect(typeof object.value).toBe("number");
            expect(object.value as number).toBeGreaterThanOrEqual(0);
          } else expect(object.value).toBeNull();
        }
        Object.values(object).forEach(walk);
      }
    };
    [characteristics.schools, yearGroups.schools, fsm.schools].forEach(walk);
    const totalIds = new Set(Object.keys(characteristics.schools));
    // Snapshot joins are reported by the importer; unmatched future records are allowed.
    expect(register.schools.some((s) => totalIds.has(s.school_id))).toBe(true);
    for (const record of Object.values(fsm.schools)) {
      for (const measure of [record.all_pupils, record.eligible.count, record.eligible_or_transitionally_protected.count]) {
        if (measure.status === "reported") expect(measure.value! % 5).toBe(0);
      }
      for (const measure of [record.eligible.percentage, record.eligible_or_transitionally_protected.percentage])
        if (measure.status === "reported") expect(measure.value).toBeLessThanOrEqual(100);
    }
  });
});
