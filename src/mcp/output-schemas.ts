import { z } from "zod";

const text = z.string();
const integer = z.number().int().nonnegative();
const area = z.object({ code: text, name: text, area_type: z.enum(["local_authority", "ward", "msoa"]), parent_code: text, parent_name: text, boundary_date: text, aliases: z.array(text), match_type: text.optional(), requires_selection: z.boolean().optional(), note: text.optional() });
const failure = z.object({ error: text, message: text, candidates: z.array(area).optional() });
const output = <T extends z.ZodType>(result: T) => z.union([z.object({ result }), failure]);
const food = z.object({ establishment_id: integer, business_name: text, address: text, business_type: text, rating: z.union([z.number().int().min(0).max(5), z.enum(["AwaitingInspection", "AwaitingPublication", "Exempt", "Other"])]), rating_label: text, inspection_date: text.nullable(), new_rating_pending: z.boolean(), source_url: text, source_retrieved_at: text });
const paging = { total_count: integer, page: z.number().int().positive(), has_more: z.boolean() };
const measure = z.object({ value: z.number().nullable(), status: z.enum(["reported", "suppressed", "unavailable", "not_applicable"]), note: text.optional() });
const source = z.object({ provider: text, source_url: text, publication_date: text, snapshot_imported_at: text, reporting_period: text, census_date: text, attribution: text }).passthrough();
const school = z.object({ school_id: text, name: text, local_authority_code: text, local_authority: text, sector: text, school_type: text, governance: text, language_category: text, address: text, postcode: text, telephone: text, language_group: text });
const eligibility = z.object({ count: measure, percentage: measure });
const censusMetadata = { topic: z.enum(["population", "age", "sex", "welsh_speaking"]), census_year: integer, census_date: text, dataset_id: text, dataset_version: z.number().int(), source_url: text, source_api_url: text, source_retrieved_at: text, attribution: text, limitations: text };
const censusMeasure = z.object({ count: integer, percentage: z.number().nullable() });
const demographics = z.object({ area, denominator: integer, denominator_definition: text, measures: z.record(text, censusMeasure), breakdown: z.array(censusMeasure.extend({ label: text })).optional(), excluded_count: integer.optional(), derivation: text.optional() });

export const outputSchemas = {
  find_food_businesses: output(z.object({ businesses: z.array(food), ...paging, source_extract_time: text.nullable(), source_retrieved_at: text, note: text.optional(), attribution: text })),
  get_food_business: output(food.extend({ attribution: text })),
  find_schools: output(z.object({ schools: z.array(school.extend({ pupil_total: measure.optional() })), ...paging, source_url: text, source_published_at: text, snapshot_imported_at: text, attribution: text, note: text, pupil_statistics: z.object({ source, reported_count: integer, unavailable_count: integer }).optional() })),
  get_school: output(school.extend({ identity_source: text, pupils: z.object({ source: text, reporting_period: text, total: measure }), year_groups: z.object({ source: text, reporting_period: text, status: text, values: z.record(text, measure) }), fsm: z.object({ source: text, reporting_period: text, eligible: eligibility, eligible_or_transitionally_protected: eligibility, all_pupils: measure, count_rounding: text }), sources: z.object({ register: z.object({ provider: text, dataset: text, source_url: text, publication_date: text, snapshot_imported_at: text, attribution: text }), characteristics: source, year_groups: source, fsm: source }), source_differences: z.array(z.object({ field: text, register: text, value: text, source: text })).optional(), notes: z.array(text) })),
  find_census_areas: output(z.object({ areas: z.array(area), total_count: integer, has_more: z.boolean(), note: text.optional(), geography_source: z.object({ source_urls: z.array(text), retrieved_at: text, attribution: text }) })),
  get_area_demographics: output(demographics.extend(censusMetadata)),
  compare_area_demographics: output(z.object({ areas: z.array(demographics), ...censusMetadata })),
  rank_areas_by_demographic: output(z.object({ ...censusMetadata, parent_area: area, area_type: z.enum(["ward", "msoa"]), metric: text, sort_order: z.enum(["asc", "desc"]), unit: z.enum(["people", "percent"]), results: z.array(z.object({ area, count: integer, denominator: integer, denominator_definition: text, value: z.number(), rank: integer, tied: z.boolean() })), areas_considered: integer, eligible_area_count: integer, complete: z.boolean() })),
};
