import { CARDIFF, resolveArea, getRecordGeography, coverage, geographyMetadata, selectedWards } from "@/geography";
import characteristics from "./statswales/characteristics.json";
import snapshot from "./directory.json";

export const SCHOOL_ATTRIBUTION =
  "Contains public sector information licensed under the Open Government Licence v3.0. Source: Welsh Government.";
export const SCHOOL_LIMITATIONS =
  "Published directory details for Cardiff maintained schools only; independent schools and pupil referral units are excluded. This is a manually refreshed snapshot, not live data. Welsh-medium and dual-language groups include transitional provision. No pupil statistics, distances, catchments, inspections or performance results are supplied.";

export const PHASES = ["nursery", "primary", "middle", "secondary", "special"] as const;
export const LANGUAGE_GROUPS = ["english_medium", "welsh_medium", "dual_language", "not_applicable", "unknown"] as const;

export function languageGroup(category: string): typeof LANGUAGE_GROUPS[number] {
  switch (category) {
    case "English medium school / provision": return "english_medium";
    case "Welsh medium school / provision (including transitional)": return "welsh_medium";
    case "Dual language school / provision (Welsh and English) (including transitional)": return "dual_language";
    case "Not applicable": return "not_applicable";
    default: return "unknown";
  }
}

export interface FindSchoolsInput {
  ward?: string;
  name?: string;
  phase?: typeof PHASES[number];
  language_group?: typeof LANGUAGE_GROUPS[number];
  sort_by?: "name" | "pupil_total";
  sort_order?: "asc" | "desc";
  page: number;
  limit: number;
}

export function findSchools(input: FindSchoolsInput) {
  const ward = input.ward ? resolveArea(input.ward, { type: "ward", localAuthority: CARDIFF }).code : undefined;
  const pupilSort = input.sort_by === "pupil_total";
  const totals = characteristics.schools as Record<string, { total: { value: number | null; status: string; note?: string } }>;
  const totalFor = (id: string) => totals[id]?.total ?? { value: null, status: "unavailable" };
  const reported = (id: string) => {
    const total = totalFor(id);
    return total.status === "reported" && total.value !== null;
  };
  const population = snapshot.schools
    .filter((school) => school.local_authority_code === "681")
    .map((school) => ({ ...school, language_group: languageGroup(school.language_category), geography: getRecordGeography("schools", school.school_id, school) }))
    .filter((school) =>
      (!input.name || school.name.toLocaleLowerCase("en-GB").includes(input.name.trim().toLocaleLowerCase("en-GB"))) &&
      (!input.phase || school.sector.toLowerCase() === input.phase) &&
      (!input.language_group || school.language_group === input.language_group));
  const schools = population.filter(school => !ward || school.geography.ward.code === ward)
    .sort((a, b) => {
      if (pupilSort) {
        const aReported = reported(a.school_id), bReported = reported(b.school_id);
        if (aReported !== bReported) return aReported ? -1 : 1;
        const difference = aReported ? (totalFor(a.school_id).value! - totalFor(b.school_id).value!) : 0;
        return (input.sort_order === "desc" ? -1 : 1) * difference || a.school_id.localeCompare(b.school_id);
      }
      return (input.sort_order === "desc" ? -1 : 1) * a.name.localeCompare(b.name, "en-GB") || a.school_id.localeCompare(b.school_id);
    });
  const start = (input.page - 1) * input.limit;
  return {
    schools: schools.slice(start, start + input.limit).map((school) =>
      pupilSort ? { ...school, pupil_total: totalFor(school.school_id) } : school),
    ...(pupilSort ? {
      pupil_statistics: {
        source: characteristics.source,
        reported_count: schools.filter((school) => reported(school.school_id)).length,
        unavailable_count: schools.filter((school) => !reported(school.school_id)).length,
      },
    } : {}),
    geography: { ...geographyMetadata(), coverage: coverage(schools) },
    authority_coverage: coverage(population),
    total_count: schools.length,
    page: input.page,
    has_more: start + input.limit < schools.length,
    source_url: snapshot.source_url,
    source_published_at: snapshot.source_published_at,
    snapshot_imported_at: snapshot.snapshot_imported_at,
    attribution: SCHOOL_ATTRIBUTION,
    note: pupilSort
      ? "Cardiff maintained schools ordered by published pupil headcount, not school quality or live enrolment. Non-reported totals sort last; coverage counts apply to all matching schools. No distances, catchments, inspections or performance results are supplied."
      : SCHOOL_LIMITATIONS,
  };
}

export function summarizeSchoolsByWard(input: Pick<FindSchoolsInput, "phase" | "language_group"> & { wards?: string[] }) {
  // The register is bounded; no discovery pagination participates in population selection.
  const schools = snapshot.schools.filter(s => s.local_authority_code === "681" &&
    (!input.phase || s.sector.toLowerCase() === input.phase) &&
    (!input.language_group || languageGroup(s.language_category) === input.language_group))
    .map(s => ({ ...s, geography: getRecordGeography("schools", s.school_id, s) }));
  return { wards: selectedWards(input.wards).map(area => ({ area, ...coverage(schools.filter(s => s.geography.ward.code === area.code)) })),
    authority_coverage: coverage(schools), geography: geographyMetadata(), source_url: snapshot.source_url,
    source_published_at: snapshot.source_published_at, snapshot_imported_at: snapshot.snapshot_imported_at,
    attribution: SCHOOL_ATTRIBUTION, limitations: "Maintained school locations only, not catchments, admissions eligibility or pupils’ residences. Postcode allocations are approximate; unresolved schools are not assigned to wards." };
}
