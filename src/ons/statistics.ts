import { DATASETS, ONS_BASE } from "./datasets";
import { requestJson } from "./client";
import { normalizeObservations, upstreamAreaType } from "./normalize";
import { resolveArea, subdivisions } from "./geography";
import { type Area, type Topic, type Metric, ATTRIBUTION, CENSUS_DATE, LIMITATIONS, OnsError } from "./types";
export function percentage(count: number, denominator: number): number | null { return denominator ? Math.round(count / denominator * 10_000) / 100 : null; }
export function calculate(values: Record<string, number>, topic: Topic, detail: "summary" | "full" = "summary") {
  const denominator = topic === "welsh_speaking" ? values["0"] + values["1"] : Object.values(values).reduce((sum, value) => sum + value, 0);
  const measure = (count: number) => ({ count, percentage: percentage(count, denominator) });
  const sumAge = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => values[String(from + i)]).reduce((a, b) => a + b, 0);
  let measures: Record<string, { count: number; percentage: number | null }>;
  if (topic === "population") measures = { population: measure(denominator), ...(detail === "full" ? { household_residents: measure(values["1"]), communal_establishment_residents: measure(values["2"]) } : {}) };
  else if (topic === "age") measures = { aged_0_to_15: measure(sumAge(0, 15)), aged_16_to_64: measure(sumAge(16, 64)), aged_65_plus: measure(sumAge(65, 100)) };
  else if (topic === "sex") measures = { female: measure(values["1"]), male: measure(values["2"]) };
  else measures = { can_speak_welsh: measure(values["1"]), cannot_speak_welsh: measure(values["0"]) };
  const breakdown = topic === "age" && detail === "full" ? Array.from({ length: 21 }, (_, i) => ({ label: i === 20 ? "100+" : `${i * 5}–${i * 5 + 4}`, ...measure(sumAge(i * 5, Math.min(i * 5 + 4, 100))) })) : undefined;
  return { denominator, denominator_definition: DATASETS[topic].population_base, measures, breakdown, excluded_count: topic === "welsh_speaking" && detail === "full" ? values["-8"] : undefined, derivation: topic === "age" ? "Age bands aggregated from TS007 single-year categories, including 100+." : undefined };
}
export async function demographics(areas: Area[], topic: Topic, detail: "summary" | "full" = "summary") {
  if (!areas.length || areas.length > 64 || new Set(areas.map(a => a.code)).size !== areas.length) throw new OnsError("invalid_input", "Supply 1–64 distinct official areas.");
  if (new Set(areas.map(a => a.area_type)).size !== 1) throw new OnsError("invalid_input", "Comparisons must use the same geography type.");
  const dataset = DATASETS[topic];
  const url = new URL(`${ONS_BASE}/datasets/${dataset.id}/editions/2021/versions/${dataset.version}/json`);
  url.searchParams.set("area-type", `${upstreamAreaType[areas[0].area_type]},${areas.map(a => a.code).sort().join(",")}`);
  const { value, retrievedAt } = await requestJson(url.toString(), Date.now() + 20_000, raw => { normalizeObservations(raw, areas, topic); });
  const normalized = normalizeObservations(value, areas, topic);
  return {
    areas: areas.map(area => ({ area, ...calculate(normalized.get(area.code)!, topic, detail) })),
    topic, census_year: 2021, census_date: CENSUS_DATE, dataset_id: dataset.id, dataset_version: dataset.version,
    source_url: `https://www.ons.gov.uk/datasets/${dataset.id}/editions/2021/versions/${dataset.version}`,
    source_api_url: url.toString(), source_retrieved_at: retrievedAt, attribution: ATTRIBUTION, limitations: LIMITATIONS,
  };
}
export async function getDemographics(area: string, topic: Topic, detail: "summary" | "full") { const result = await demographics([resolveArea(area)], topic, detail); const { areas, ...metadata } = result; return { ...areas[0], ...metadata }; }
export async function compareDemographics(areas: string[], topic: Topic) { return demographics(areas.map(resolveArea), topic); }
export async function rankDemographics(parentName: string, areaType: "ward" | "msoa", metric: Metric, sort: "asc" | "desc", limit: number) {
  const parent = resolveArea(parentName);
  const areas = subdivisions(parent, areaType);
  const topic = metric === "population" ? "population" : metric === "aged_65_plus_percentage" ? "age" : "welsh_speaking";
  const result = await demographics(areas, topic);
  const measureName = topic === "population" ? "population" : topic === "age" ? "aged_65_plus" : "can_speak_welsh";
  const rows = result.areas.map(row => {
    const measure = row.measures[measureName];
    if (!row.denominator) throw new OnsError("unavailable", "An eligible area has no usable denominator; ranking is incomplete.");
    return { area: row.area, count: measure.count, denominator: row.denominator, denominator_definition: row.denominator_definition, value: metric === "population" ? measure.count : measure.percentage!, rawValue: metric === "population" ? measure.count : measure.count / row.denominator * 100 };
  }).sort((a, b) => (sort === "asc" ? 1 : -1) * (a.rawValue - b.rawValue) || a.area.code.localeCompare(b.area.code));
  const results = rows.slice(0, limit).map(({ rawValue, ...row }, index) => ({ ...row, rank: index + 1, tied: rows.some(other => other.area.code !== row.area.code && other.rawValue === rawValue) }));
  const { areas: ignoredAreas, ...metadata } = result;
  void ignoredAreas;
  return { ...metadata, parent_area: parent, area_type: areaType, metric, sort_order: sort, unit: metric === "population" ? "people" : "percent", results, areas_considered: rows.length, eligible_area_count: areas.length, complete: true };
}
