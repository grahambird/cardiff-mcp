import { getRecordGeography, geographyMetadata } from "@/geography";
import register from "./directory.json";
import characteristics from "./statswales/characteristics.json";
import yearGroups from "./statswales/year_groups.json";
import fsm from "./statswales/fsm.json";
import { languageGroup, SCHOOL_ATTRIBUTION } from "./directory";

export interface Measure {
  value: number | null;
  status: "reported" | "suppressed" | "unavailable" | "not_applicable";
  note?: string;
}
interface Source {
  provider: string;
  source_url: string;
  publication_date: string;
  snapshot_imported_at: string;
  reporting_period: string;
  census_date: string;
  attribution: string;
  [key: string]: unknown;
}
interface CharacteristicRecord {
  school_id: string;
  source_name: string;
  total: Measure;
  characteristics: Record<string, string>;
}
interface YearRecord {
  school_id: string;
  source_name: string;
  sector: string;
  values: Record<string, Measure>;
}
interface FsmRecord {
  school_id: string;
  source_name: string;
  eligible?: { count?: Measure; percentage?: Measure };
  eligible_or_transitionally_protected?: { count?: Measure; percentage?: Measure };
  all_pupils?: Measure;
}
export interface Statistics {
  characteristics: { source: Source; schools: Record<string, CharacteristicRecord> };
  year_groups: { source: Source; schools: Record<string, YearRecord> };
  fsm: { source: Source; schools: Record<string, FsmRecord> };
}
const bundled: Statistics = {
  characteristics: characteristics as Statistics["characteristics"],
  year_groups: yearGroups as Statistics["year_groups"],
  fsm: fsm as Statistics["fsm"],
};
const unavailable = (): Measure => ({ value: null, status: "unavailable" });
const normalized = (value: string) => value.toLocaleLowerCase("en-GB").replace(/ schools$/, "");

// Source-specific composition, with injectable snapshots for deterministic tests.
export function getSchool(schoolId: string, stats: Statistics = bundled) {
  const school = register.schools.find((s) => s.school_id === schoolId && s.local_authority_code === "681");
  if (!school) return null;
  const c = stats.characteristics.schools[schoolId];
  const y = stats.year_groups.schools[schoolId];
  const f = stats.fsm.schools[schoolId];
  const differences: Array<{ field: string; register: string; value: string; source: string }> = [];
  if (c) {
    for (const [field, value] of Object.entries(c.characteristics)) {
      const existing = school[field as keyof typeof school];
      if (existing !== undefined && normalized(existing) !== normalized(value))
        differences.push({ field, register: existing, value, source: "characteristics" });
    }
  }
  for (const [source, record] of [["year_groups", y], ["fsm", f]] as const) {
    if (record && normalized(record.source_name) !== normalized(school.name))
      differences.push({ field: "name", register: school.name, value: record.source_name, source });
  }
  if (y && normalized(y.sector) !== normalized(school.sector))
    differences.push({ field: "sector", register: school.sector, value: y.sector, source: "year_groups" });
  const notes = [
    "Manually refreshed snapshots; publication and import dates are not live enrolment dates. Pupil characteristics do not measure school quality.",
    stats.fsm.source.definition as string,
  ];
  if (!c) notes.push("Pupil total unavailable: no matching characteristics record.");
  if (!y) notes.push("Year-group breakdown unavailable: no matching record.");
  if (!f) notes.push("FSM statistics unavailable: no matching record.");
  const periods = new Set(Object.values(stats).map((s) => s.source.reporting_period));
  if (periods.size > 1) notes.push("Sources cover different reporting periods; do not combine their figures.");
  const values = Object.values(y?.values ?? {});
  if (c && c.total.status === "reported" && c.total.value !== null && y && values.length > 0 &&
      stats.characteristics.source.reporting_period === stats.year_groups.source.reporting_period &&
      values.every((v) => v.status === "reported" && v.value !== null) &&
      values.reduce((sum, v) => sum + v.value!, 0) !== c.total.value)
    notes.push("Published year-group sum differs from the published pupil total; both are preserved.");
  // File hashes support refresh audits but need not consume tokens in each profile.
  const publicSource = (source: Source) => {
    const { input_sha256, metadata_sha256, ...publicFields } = source;
    void input_sha256; void metadata_sha256;
    return publicFields;
  };
  return {
    ...school, geography: getRecordGeography("schools", school.school_id, school), geography_reference: geographyMetadata(), language_group: languageGroup(school.language_category), identity_source: "register",
    pupils: { source: "characteristics", reporting_period: stats.characteristics.source.reporting_period, total: c?.total ?? unavailable() },
    year_groups: { source: "year_groups", reporting_period: stats.year_groups.source.reporting_period,
      status: y ? "reported" : "unavailable", values: y?.values ?? {} },
    fsm: {
      source: "fsm", reporting_period: stats.fsm.source.reporting_period,
      eligible: { count: f?.eligible?.count ?? unavailable(), percentage: f?.eligible?.percentage ?? unavailable() },
      eligible_or_transitionally_protected: {
        count: f?.eligible_or_transitionally_protected?.count ?? unavailable(),
        percentage: f?.eligible_or_transitionally_protected?.percentage ?? unavailable(),
      },
      all_pupils: f?.all_pupils ?? unavailable(), count_rounding: "nearest_5",
    },
    sources: {
      register: { provider: "Welsh Government", dataset: "School register",
        source_url: register.source_url, publication_date: register.source_published_at,
        snapshot_imported_at: register.snapshot_imported_at, attribution: SCHOOL_ATTRIBUTION },
      characteristics: publicSource(stats.characteristics.source),
      year_groups: publicSource(stats.year_groups.source),
      fsm: publicSource(stats.fsm.source),
    },
    ...(differences.length ? { source_differences: differences } : {}),
    notes,
  };
}
