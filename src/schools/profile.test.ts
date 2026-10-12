import { describe, expect, it } from "vitest";
import { getSchool, type Statistics } from "./profile";
import characteristics from "./statswales/characteristics.json";
import yearGroups from "./statswales/year_groups.json";
import fsm from "./statswales/fsm.json";
import register from "./directory.json";

const snapshots = () => structuredClone({
  characteristics, year_groups: yearGroups, fsm,
}) as Statistics;

describe("combined school profiles", () => {
  it.each(["6814039", "6812003", "6814071"])("joins representative Cardiff school %s by ID with source provenance", (id) => {
    const profile = getSchool(id)!;
    expect(profile.school_id).toBe(id);
    expect(profile.name).toBe(register.schools.find((s) => s.school_id === id)!.name);
    expect(profile.pupils.total.status).toBe("reported");
    expect(Object.values(profile.year_groups.values).reduce((sum, v) => sum + v.value!, 0)).toBe(profile.pupils.total.value);
    for (const source of [profile.sources.characteristics, profile.sources.year_groups, profile.sources.fsm]) {
      expect(source).toMatchObject({ provider: "Welsh Government", publishing_service: "StatsWales" });
      expect(source.source_url).toMatch(/^https:\/\/stats.gov.wales\//);
      expect(source.attribution).toContain("Open Government Licence v3.0");
      expect(source.census_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
  it("preserves rounded FSM totals and published percentages", () => {
    const p = getSchool("6814071")!;
    expect(p.pupils.total.value).toBe(1528);
    expect(p.fsm.all_pupils.value).toBe(1530);
    expect(p.fsm.eligible.percentage.value).toBe(5.1);
    expect(p.fsm.count_rounding).toBe("nearest_5");
  });
  it("returns missing datasets and partial measures explicitly without replacing identity", () => {
    const stats = snapshots();
    delete stats.characteristics.schools["6814039"];
    delete stats.year_groups.schools["6814039"];
    delete stats.fsm.schools["6814039"].eligible;
    const p = getSchool("6814039", stats)!;
    expect(p.pupils.total).toEqual({ value: null, status: "unavailable" });
    expect(p.year_groups).toMatchObject({ status: "unavailable", values: {} });
    expect(p.fsm.eligible.percentage).toEqual({ value: null, status: "unavailable" });
    expect(p.fsm.all_pupils.status).toBe("reported");
    delete stats.fsm.schools["6814039"];
    expect(getSchool("6814039", stats)!.fsm.all_pupils.status).toBe("unavailable");
  });
  it("preserves suppression, non-applicability and real zeros without deriving missing values", () => {
    const stats = snapshots();
    stats.fsm.schools["6814039"].eligible = {
      count: { value: null, status: "suppressed", note: "Confidential" },
      percentage: { value: null, status: "not_applicable", note: "Not applicable" },
    };
    stats.year_groups.schools["6814039"].values["Year Group 7"] = { value: 0, status: "reported" };
    const p = getSchool("6814039", stats)!;
    expect(p.fsm.eligible).toEqual(stats.fsm.schools["6814039"].eligible);
    expect(p.year_groups.values["Year Group 7"].value).toBe(0);
    expect(p.notes.join(" ")).toContain("sum differs");
  });
  it("retains conflicting source values", () => {
    const stats = snapshots();
    stats.characteristics.schools["6814039"].characteristics.governance = "Foundation";
    const p = getSchool("6814039", stats)!;
    expect(p.governance).toBe("Community");
    expect(p.source_differences).toContainEqual({ field: "governance", register: "Community", value: "Foundation", source: "characteristics" });
  });
  it("allows independent updates without changing unrelated source data or combining periods", () => {
    const stats = snapshots();
    const before = getSchool("6814039", stats)!;
    stats.characteristics.source.reporting_period = "2026/27";
    stats.characteristics.schools["6814039"].total.value = 1800;
    const after = getSchool("6814039", stats)!;
    expect(after.fsm).toEqual(before.fsm);
    expect(after.year_groups).toEqual(before.year_groups);
    expect(after.sources.register).toEqual(before.sources.register);
    expect(after.pupils.reporting_period).toBe("2026/27");
    expect(after.notes.join(" ")).toContain("different reporting periods");
    expect(after.notes.join(" ")).not.toContain("sum differs");
  });
  it("does not resolve unknown IDs or names into another school", () => {
    expect(getSchool("6819999")).toBeNull();
    expect(getSchool("6602130")).toBeNull();
    expect(getSchool("Cardiff High")).toBeNull();
  });
});
