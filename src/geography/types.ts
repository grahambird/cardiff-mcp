export const AREA_TYPES = ["local_authority", "ward", "lsoa", "msoa"] as const;
export type AreaType = typeof AREA_TYPES[number];
export type Area = {
  code: string; name: string; name_cy?: string; area_type: AreaType;
  parent_code: string; parent_name: string; boundary_date: string; aliases: string[];
  local_authority_code?: string;
};
export type Level = "ward" | "lsoa" | "msoa";
export type Match = {
  code: string | null;
  method: "coordinates" | "postcode" | "none";
  accuracy: "exact" | "approximate" | "unresolved";
  reason?: string; candidates?: string[];
};
export type Matches = Record<Level, Match>;
export type Position = [number, number];
export type Geometry = { type: "Polygon"; coordinates: Position[][] } | { type: "MultiPolygon"; coordinates: Position[][][] };
export type Boundary = { code: string; area_type: Level; bbox: [number, number, number, number]; geometry: Geometry };
export type Postcode = {
  postcode: string; terminated: string | null; quality: number;
  latitude: number | null; longitude: number | null; lsoa_code: string | null; msoa_code: string | null;
  ward?: Match;
};
export type Location = { address?: string | null; postcode?: string | null; latitude?: number | null; longitude?: number | null };
export type Association = Matches & {
  source: "schools" | "fsa"; record_id: string; location_fingerprint: string;
  reference_version: string; matcher_version: string; calculated_at: string; location_source: string;
};
export type AssociationSnapshot = {
  source: "schools" | "fsa"; reference_version: string; matcher_version: string;
  source_sha256: string; associations: Record<string, Association>;
};
export class GeographyError extends Error {
  code: "ambiguous_area" | "not_found" | "unsupported_scope" | "invalid_input" | "unavailable";
  candidates?: Area[];
  constructor(code: GeographyError["code"], message: string, candidates?: Area[]) {
    super(message); this.name = "GeographyError"; this.code = code; this.candidates = candidates;
  }
}
