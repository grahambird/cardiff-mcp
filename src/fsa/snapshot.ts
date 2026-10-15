import source from "./source.json";
import { establishmentSchema, mapEstablishment, fsaLocation, FSA_ATTRIBUTION } from "./client";
import { BUSINESS_TYPES, type BusinessType, type FindBusinessesInput } from "./types";
import { CARDIFF, coverage, geographyMetadata, getRecordGeography, resolveArea, selectedWards } from "@/geography";

// Bulk XML strings are preserved in source.json; use the same public mapping as live records.
export const SNAPSHOT = source as unknown as {
  source_url: string; source_extract_time: string; source_retrieved_at: string;
  expected_count: number; records: Record<string, unknown>[];
};
let mapped: ReturnType<typeof records> | undefined;
function records() {
  return SNAPSHOT.records.map(raw => {
    const record = establishmentSchema.parse({ ...raw, FHRSID: Number(raw.FHRSID), BusinessTypeID: Number(raw.BusinessTypeID), NewRatingPending: String(raw.NewRatingPending).toLowerCase() === "true",
      Geocode: typeof raw.Geocode === "object" ? raw.Geocode : undefined });
    return { ...mapEstablishment(record, SNAPSHOT.source_retrieved_at), business_type_id: record.BusinessTypeID,
      geography: getRecordGeography("fsa", String(record.FHRSID), fsaLocation(record)) };
  });
}
const allRecords = () => mapped ??= records();
function matching(input: Pick<FindBusinessesInput, "name" | "business_type" | "minimum_rating">) {
  return allRecords().filter(r => (!input.name || r.business_name.toLocaleLowerCase("en-GB").includes(input.name.trim().toLocaleLowerCase("en-GB"))) &&
    (!input.business_type || r.business_type_id === BUSINESS_TYPES[input.business_type]) &&
    (input.minimum_rating === undefined || typeof r.rating === "number" && r.rating >= input.minimum_rating));
}
function metadata(now = Date.now()) {
  const age = Math.max(0, Math.floor((now - Date.parse(SNAPSHOT.source_extract_time)) / 86_400_000));
  return { data_mode: "snapshot" as const, source_url: SNAPSHOT.source_url, source_extract_time: SNAPSHOT.source_extract_time,
    source_retrieved_at: SNAPSHOT.source_retrieved_at, snapshot_age_days: age,
    ...(age > 30 ? { freshness_warning: "This FSA snapshot is more than 30 days old; openings, removals, locations and ratings may have changed. Individual business lookups remain live." } : {}),
    attribution: FSA_ATTRIBUTION, geography: geographyMetadata() };
}
export function findFoodBusinessesByWard(input: FindBusinessesInput) {
  const ward = resolveArea(input.ward!, { type: "ward", localAuthority: CARDIFF });
  const population = matching(input);
  const businesses = population.filter(r => r.geography.ward.code === ward.code).sort((a, b) => {
    let difference = 0;
    if (input.sort_by === "rating") {
      const numericA = typeof a.rating === "number", numericB = typeof b.rating === "number";
      if (numericA !== numericB) return numericA ? -1 : 1;
      difference = numericA ? (a.rating as number) - (b.rating as number) : a.rating_label.localeCompare(b.rating_label, "en");
    } else difference = a.business_name.localeCompare(b.business_name, "en-GB");
    return (input.sort_order === "desc" ? -1 : 1) * difference || a.establishment_id - b.establishment_id;
  });
  const start = (input.page - 1) * input.limit;
  return { ...metadata(), businesses: businesses.slice(start, start + input.limit).map(({ business_type_id, ...publicRecord }) => { void business_type_id; return publicRecord; }),
    total_count: businesses.length, page: input.page, has_more: start + input.limit < businesses.length,
    authority_coverage: coverage(population), ward,
    note: "Complete manually refreshed FSA-published Cardiff population, filtered and sorted before pagination. Snapshot ratings are not live. Numeric ratings sort before non-numeric states in both directions; ties use FHRSID ascending. Unresolved locations are excluded from ward matches and counted in authority coverage. Restaurant/Cafe/Canteen is broader than restaurants alone." };
}
export function summarizeFoodBusinessesByWard(input: { business_type?: BusinessType; wards?: string[] }) {
  const population = matching(input);
  return { ...metadata(), wards: selectedWards(input.wards).map(area => {
    const records = population.filter(r => r.geography.ward.code === area.code);
    const buckets: Record<string, number> = Object.fromEntries(["0", "1", "2", "3", "4", "5", "AwaitingInspection", "AwaitingPublication", "Exempt", "Other"].map(key => [key, 0]));
    for (const record of records) buckets[String(record.rating)]++;
    const denominator = records.filter(r => typeof r.rating === "number").length;
    return { area, ...coverage(records), rating_counts: buckets, numeric_rating_denominator: denominator,
      numeric_rating_percentages: Object.fromEntries([0, 1, 2, 3, 4, 5].map(r => [String(r), denominator ? Math.round(buckets[String(r)] / denominator * 10000) / 100 : null])),
      new_rating_pending_count: records.filter(r => r.new_rating_pending).length };
  }), authority_coverage: coverage(population),
    limitations: "Counts cover the complete FSA-published snapshot, not all businesses operating or registered in other systems. Ward allocations include labelled postcode approximations. Unresolved records are counted separately. Pending is a separate flag, not an additional rating bucket. Hygiene is not food quality; snapshot and live records may differ." };
}
