// Compatibility adapter: Census retains its supported types, shape and errors.
import catalogue from "../geography/data/W06000015/catalogue.json";
import * as shared from "@/geography";
import { type Area, type AreaType, OnsError } from "./types";
export const AREAS = shared.AREAS.filter(a => a.area_type !== "lsoa") as Area[];
export const GEOGRAPHY_SOURCE = { source_urls: catalogue.legacy_source.sources, retrieved_at: catalogue.legacy_source.retrieved_at, attribution: catalogue.legacy_source.attribution, reference_version: shared.REFERENCE.version, boundary_dates: shared.REFERENCE.boundary_dates };
export const normalizeName = shared.normalizeName;
export function findAreas(query: string, areaType?: AreaType, limit = 10) {
  return { ...shared.findAreas(query, { type: areaType, limit, censusOnly: true }), geography_source: GEOGRAPHY_SOURCE };
}
export function resolveArea(query: string): Area {
  try { return shared.resolveArea(query, { censusOnly: true }) as Area; }
  catch (error) {
    if (error instanceof shared.GeographyError) throw new OnsError(error.code, error.message, undefined, error.candidates);
    throw error;
  }
}
export function subdivisions(parent: Area, areaType: "ward" | "msoa"): Area[] {
  if (parent.code !== "W06000015" || parent.area_type !== "local_authority") throw new OnsError("unsupported_scope", "Subdivision rankings currently cover Cardiff only.");
  return AREAS.filter(a => a.parent_code === parent.code && a.area_type === areaType);
}
