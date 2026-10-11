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

interface FindSchoolsInput {
  name?: string;
  phase?: typeof PHASES[number];
  language_group?: typeof LANGUAGE_GROUPS[number];
  page: number;
  limit: number;
}

export function findSchools(input: FindSchoolsInput) {
  const schools = snapshot.schools
    .filter((school) => school.local_authority_code === "681")
    .map((school) => ({ ...school, language_group: languageGroup(school.language_category) }))
    .filter((school) =>
      (!input.name || school.name.toLocaleLowerCase("en-GB").includes(input.name.trim().toLocaleLowerCase("en-GB"))) &&
      (!input.phase || school.sector.toLowerCase() === input.phase) &&
      (!input.language_group || school.language_group === input.language_group))
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB") || a.school_id.localeCompare(b.school_id));
  const start = (input.page - 1) * input.limit;
  return {
    schools: schools.slice(start, start + input.limit),
    total_count: schools.length,
    page: input.page,
    has_more: start + input.limit < schools.length,
    source_url: snapshot.source_url,
    source_published_at: snapshot.source_published_at,
    snapshot_imported_at: snapshot.snapshot_imported_at,
    attribution: SCHOOL_ATTRIBUTION,
    note: SCHOOL_LIMITATIONS,
  };
}
