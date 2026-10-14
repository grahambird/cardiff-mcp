export const AREA_TYPES = ["local_authority", "ward", "msoa"] as const;
export type AreaType = typeof AREA_TYPES[number];
export const TOPICS = ["population", "age", "sex", "welsh_speaking"] as const;
export type Topic = typeof TOPICS[number];
export const METRICS = ["population", "aged_65_plus_percentage", "welsh_speaking_percentage"] as const;
export type Metric = typeof METRICS[number];
export type Area = { code: string; name: string; area_type: AreaType; parent_code: string; parent_name: string; boundary_date: string; aliases: string[] };
export type ErrorCode = "invalid_input" | "unsupported_scope" | "ambiguous_area" | "not_found" | "unavailable" | "timeout" | "throttled" | "upstream" | "malformed";
export class OnsError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly status?: number, public readonly candidates?: unknown[]) {
    super(message); this.name = "OnsError";
  }
}
export const ATTRIBUTION = "Source: Office for National Statistics licensed under the Open Government Licence v.3.0";
export const CENSUS_DATE = "2021-03-21";
export const LIMITATIONS = "Census Day, 21 March 2021, not today's population. Wards use May 2022 boundaries and are not necessarily neighbourhood boundaries. ONS disclosure control can cause small differences between topic totals; percentages use the selected table's denominator.";
