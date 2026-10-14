import catalogue from "./geographies.json";
import { type Area, type AreaType, OnsError } from "./types";
export const AREAS = catalogue.areas as Area[];
export const GEOGRAPHY_SOURCE = { source_urls: catalogue.sources, retrieved_at: catalogue.retrieved_at, attribution: catalogue.attribution };
export function normalizeName(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/\(cardiff\)|,\s*cardiff$/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
export function findAreas(query: string, areaType?: AreaType, limit = 10) {
  const name = normalizeName(query);
  const matches = AREAS.filter(a => !areaType || a.area_type === areaType).flatMap(a => {
    const exact = a.code.toLowerCase() === query.trim().toLowerCase() ? "code" : normalizeName(a.name) === name ? "exact_name" : a.aliases.some(alias => normalizeName(alias) === name) ? "alias" : null;
    const partial = normalizeName(a.name).includes(name) || a.aliases.some(alias => normalizeName(alias).includes(name));
    return exact || partial ? [{ ...a, match_type: exact ?? "partial", requires_selection: !exact, note: a.area_type === "ward" ? "Electoral ward as at May 2022; this may differ from the neighbourhood boundary." : undefined }] : [];
  }).sort((a, b) => Number(a.requires_selection) - Number(b.requires_selection) || a.name.localeCompare(b.name, "en") || a.code.localeCompare(b.code));
  return { areas: matches.slice(0, limit), total_count: matches.length, has_more: matches.length > limit, note: matches.length ? undefined : "No supported official area matches this name. Neighbourhoods such as Roath do not have a single equivalent ward; select a supported official area rather than assuming equivalent boundaries.", geography_source: GEOGRAPHY_SOURCE };
}
export function resolveArea(query: string): Area {
  const matches = findAreas(query, undefined, 20);
  const exact = matches.areas.filter(a => !a.requires_selection);
  if (exact.length === 1) return exact[0];
  if (matches.total_count) throw new OnsError("ambiguous_area", "Select an official area code from these candidates before retrieving demographics.", undefined, matches.areas);
  throw new OnsError(/^\w\d{8}$/i.test(query) ? "unsupported_scope" : "not_found", matches.note!);
}
export function subdivisions(parent: Area, areaType: "ward" | "msoa"): Area[] {
  if (parent.code !== "W06000015" || parent.area_type !== "local_authority") throw new OnsError("unsupported_scope", "Subdivision rankings currently cover Cardiff only.");
  return AREAS.filter(a => a.parent_code === parent.code && a.area_type === areaType);
}
