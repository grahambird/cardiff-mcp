import spatialRelations from "./data/W06000015/spatial-relations.json";
import catalogue from "./data/W06000015/catalogue.json";
import schoolSnapshot from "./data/W06000015/schools-associations.json";
import foodSnapshot from "./data/W06000015/fsa-associations.json";
import { GeographyError, type Area, type AreaType, type AssociationSnapshot, type Location } from "./types";
import { LEVELS, locationFingerprint, MATCHER_VERSION, unresolvedMatches } from "./engine";

export { GeographyError } from "./types";
export const CARDIFF = "W06000015";
export const AREAS = catalogue.areas as Area[];
export const REFERENCE = catalogue.reference;
export const GEOGRAPHY_NOTE = "Locations use May 2022 wards and 2021 LSOAs/MSOAs. Exact means containment of supplied coordinates, not independent verification of the premises. Postcode allocations are approximate. Wards are not necessarily neighbourhoods. School locations are not catchments, admissions eligibility or pupil residences. Census 2021 describes a different reporting period from establishment snapshots.";
const associations = { schools: schoolSnapshot, fsa: foodSnapshot } as Record<"schools" | "fsa", AssociationSnapshot>;
const byCode = new Map(AREAS.map(a => [a.code, a]));
export function normalizeName(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/\(cardiff\)|,\s*cardiff$/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
export function findAreas(query: string, options: { type?: AreaType; localAuthority?: string; limit?: number; censusOnly?: boolean } = {}) {
  const name = normalizeName(query);
  const matches = AREAS.filter(a => (!options.type || a.area_type === options.type) &&
    (!options.localAuthority || a.local_authority_code === options.localAuthority) && (!options.censusOnly || a.area_type !== "lsoa"))
    .flatMap(a => {
      const exact = a.code.toLowerCase() === query.trim().toLowerCase() ? "code" : normalizeName(a.name) === name ? "exact_name" : a.aliases.some(alias => normalizeName(alias) === name) ? "alias" : null;
      const partial = name && (normalizeName(a.name).includes(name) || a.aliases.some(alias => normalizeName(alias).includes(name)));
      return exact || partial ? [{ ...a, match_type: exact ?? "partial", requires_selection: !exact,
        note: a.area_type === "ward" ? "Electoral ward as at May 2022; this may differ from the neighbourhood boundary." : undefined }] : [];
    }).sort((a, b) => Number(a.requires_selection) - Number(b.requires_selection) || a.name.localeCompare(b.name, "en") || a.code.localeCompare(b.code));
  return { areas: matches.slice(0, options.limit ?? 10), total_count: matches.length, has_more: matches.length > (options.limit ?? 10),
    note: matches.length ? undefined : "No supported official area matches this name. Neighbourhoods such as Roath do not have a single equivalent ward; select a supported official area rather than assuming equivalent boundaries." };
}
export function resolveArea(query: string, options: { type?: AreaType; localAuthority?: string; censusOnly?: boolean } = {}): Area {
  const found = findAreas(query, { ...options, limit: 20 });
  const exact = found.areas.filter(a => !a.requires_selection);
  if (exact.length === 1) return exact[0];
  if (found.total_count) throw new GeographyError("ambiguous_area", "Select an official area code from these candidates before retrieving data.", found.areas);
  throw new GeographyError(/^\w\d{8}$/i.test(query) ? "unsupported_scope" : "not_found", found.note!);
}
export function getArea(code: string): Area {
  const area = byCode.get(code.toUpperCase());
  if (!area) throw new GeographyError("unsupported_scope", "This geographic code is outside supported coverage.");
  return area;
}
export function selectedWards(wards?: string[]): Area[] {
  if (!wards) return AREAS.filter(a => a.area_type === "ward" && a.local_authority_code === CARDIFF).sort((a, b) => a.name.localeCompare(b.name, "en") || a.code.localeCompare(b.code));
  const result = wards.map(w => resolveArea(w, { type: "ward", localAuthority: CARDIFF }));
  if (new Set(result.map(a => a.code)).size !== result.length) throw new GeographyError("invalid_input", "Select distinct wards.");
  return result;
}
export function getRelatedAreas(code: string, targetType: AreaType, relationship: "exact" | "best_fit" | "spatial_intersection" = "exact") {
  const area = getArea(code);
  code = area.code;
  if (relationship === "spatial_intersection") {
    if (!(area.area_type === "ward" && ["lsoa", "msoa"].includes(targetType) || ["lsoa", "msoa"].includes(area.area_type) && targetType === "ward")) throw new GeographyError("unsupported_scope", "Spatial relationships support ward/statistical-area intersections only.");
    const intersections = spatialRelations.intersections as Record<string, string[]>;
    const codes = area.area_type === "ward" ? intersections[code] ?? [] : Object.entries(intersections).filter(([, members]) => members.includes(code)).map(([ward]) => ward);
    return { relationship, accuracy: "exact" as const, areas: codes.map(getArea).filter(a => a.area_type === targetType), note: "Positive-area boundary intersections, not constituent membership or statistical allocation weights." };
  }
  if (relationship === "best_fit") {
    if (area.area_type !== "ward" || targetType !== "lsoa") throw new GeographyError("unsupported_scope", "Published best-fit membership supports ward to LSOA only; it is not exact containment or a statistical aggregation method.");
    return { relationship, accuracy: "approximate" as const, areas: Object.entries(catalogue.best_fit).filter(([, ward]) => ward === code).map(([lsoa]) => getArea(lsoa)) };
  }
  if (area.area_type === "ward" && ["lsoa", "msoa"].includes(targetType) || ["lsoa", "msoa"].includes(area.area_type) && targetType === "ward") throw new GeographyError("unsupported_scope", "Wards and statistical areas do not form an exact hierarchy. Select the explicitly approximate best-fit LSOA relationship or spatial intersections; do not use them to reconstruct ward statistics.");
  if (targetType === "local_authority") return { relationship, accuracy: "exact" as const, areas: [getArea(area.local_authority_code ?? area.parent_code)] };
  return { relationship, accuracy: "exact" as const, areas: AREAS.filter(a => a.area_type === targetType && (a.parent_code === code || (area.area_type === "local_authority" && a.local_authority_code === code) || area.parent_code === a.code)) };
}
export function getRecordGeography(source: "schools" | "fsa", recordId: string, location?: Location) {
  const association = associations[source].associations[recordId];
  const valid = association && association.reference_version === REFERENCE.version && association.matcher_version === MATCHER_VERSION && (!location || association.location_fingerprint === locationFingerprint(location));
  const matches = valid ? association : unresolvedMatches("association_pending_refresh");
  const named = (level: typeof LEVELS[number]) => ({ ...matches[level], name: matches[level].code ? byCode.get(matches[level].code!)?.name : undefined });
  return { reference_version: REFERENCE.version, calculated_at: valid ? association.calculated_at : null,
    ward: named("ward"), lsoa: named("lsoa"), msoa: named("msoa") };
}
export type RecordGeography = ReturnType<typeof getRecordGeography>;
export function coverage(records: { geography: RecordGeography }[]) {
  return { population: records.length, exact: records.filter(r => r.geography.ward.accuracy === "exact").length,
    approximate: records.filter(r => r.geography.ward.accuracy === "approximate").length,
    unresolved: records.filter(r => !r.geography.ward.code).length };
}
export const geographyMetadata = () => ({ reference_version: REFERENCE.version, boundary_dates: REFERENCE.boundary_dates,
  source_urls: REFERENCE.sources.map(s => s.source_url), attribution: REFERENCE.attribution, limitations: GEOGRAPHY_NOTE });
