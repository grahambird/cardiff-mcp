import { readFile } from "node:fs/promises";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const origin = process.argv.slice(2).find((argument) => argument !== "--") || "http://127.0.0.1:3000";
const endpoint = new URL("/mcp", `${origin}/`);
const client = new Client({ name: "mcp-wales-smoke-test", version: "0.1.0" });
const expectedAttribution =
  "Contains public sector information licensed under the Open Government Licence v3.0. Source: Food Standards Agency.";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isIsoTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function validateBusiness(business, label) {
  assert(Number.isInteger(business?.establishment_id) && business.establishment_id > 0, `${label} has no valid establishment ID.`);
  assert(typeof business.business_name === "string" && business.business_name.length > 0, `${label} has no business name.`);
  assert(typeof business.address === "string", `${label} has no address field.`);
  assert(typeof business.business_type === "string" && business.business_type.length > 0, `${label} has no business type.`);
  assert(business.rating === 5, `${label} did not preserve the requested minimum rating of 5.`);
  assert(
    business.inspection_date === null || /^\d{4}-\d{2}-\d{2}$/.test(business.inspection_date),
    `${label} has an invalid inspection date.`,
  );
  assert(typeof business.new_rating_pending === "boolean", `${label} has no pending-rating flag.`);
  assert(
    business.source_url === `https://ratings.food.gov.uk/business/${business.establishment_id}`,
    `${label} has an invalid FSA source URL.`,
  );
  assert(isIsoTimestamp(business.source_retrieved_at), `${label} has no valid retrieval timestamp.`);
}

try {
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name).sort();
  const expected = ["find_food_businesses", "find_schools", "get_food_business", "get_school", "find_census_areas", "get_area_demographics", "compare_area_demographics", "rank_areas_by_demographic", "summarize_schools_by_ward", "summarize_food_businesses_by_ward"].sort();
  if (process.env.CARDIFF_WASTE_TOOLS_ENABLED === "true") {
    expected.push("find_waste_collection_addresses", "get_waste_collections");
    expected.sort();
  }
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`Expected tools ${expected.join(", ")}; received ${names.join(", ")}`);
  }
  for (const tool of tools) {
    assert(tool.annotations?.readOnlyHint === true, `${tool.name} is not advertised as read-only.`);
    assert(tool.annotations?.destructiveHint === false, `${tool.name} is incorrectly advertised as destructive.`);
    assert(typeof tool.description === "string" && tool.description.length > 0, `${tool.name} has no description.`);
  }

  const census = await client.callTool({ name: "get_area_demographics", arguments: { area: "W06000015", topic: "population" } });
  assert(!census.isError, "ONS Cardiff population lookup failed.");
  const population = census.structuredContent?.result;
  function validateCensus(value) {
    assert(value?.census_date === "2021-03-21" && value.census_year === 2021, "Invalid census reference date.");
    assert(Number.isInteger(value.dataset_version) && value.dataset_version > 0, "Missing census version.");
    assert(value.source_url?.startsWith(`https://www.ons.gov.uk/datasets/${value.dataset_id}/editions/2021/versions/`), "Invalid ONS provenance.");
    assert(isIsoTimestamp(value.source_retrieved_at), "Missing census retrieval time.");
    assert(value.attribution?.includes("Office for National Statistics") && value.attribution.includes("Open Government Licence"), "Missing ONS attribution.");
  }
  validateCensus(population);
  assert(population.area?.code === "W06000015" && population.dataset_id === "TS001", "Invalid Cardiff census identity.");
  assert(Number.isInteger(population.denominator) && population.denominator > 0, "Invalid census population.");
  assert(population.measures?.population?.count === population.denominator, "Population denominator differs.");
  const rankingCall = await client.callTool({ name: "rank_areas_by_demographic", arguments: { metric: "welsh_speaking_percentage", limit: 3 } });
  assert(!rankingCall.isError, "ONS Cardiff ward ranking failed.");
  const ranking = rankingCall.structuredContent?.result;
  validateCensus(ranking);
  const geography = JSON.parse(await readFile(new URL("../src/geography/data/W06000015/catalogue.json", import.meta.url), "utf8"));
  const eligible = geography.areas.filter(a => a.area_type === "ward" && a.parent_code === "W06000015");
  assert(ranking.complete === true && ranking.areas_considered === eligible.length && ranking.eligible_area_count === eligible.length, "Ward ranking is incomplete.");
  assert(ranking.dataset_id === "TS033" && ranking.unit === "percent", "Invalid ranking measure.");
  assert(ranking.results?.length === 3 && new Set(ranking.results.map(r => r.area.code)).size === 3, "Invalid bounded ranking results.");
  for (const row of ranking.results) {
    assert(eligible.some(a => a.code === row.area.code) && row.area.boundary_date === "2022-05", "Invalid ward boundary.");
    assert(Number.isInteger(row.count) && row.count >= 0 && Number.isInteger(row.denominator) && row.denominator >= row.count && row.denominator > 0, "Invalid Welsh-speaking denominator.");
    assert(row.denominator_definition === "Usual residents aged 3 years and over", "Invalid Welsh-speaking population base.");
    assert(row.value === Math.round(row.count / row.denominator * 10000) / 100, "Invalid Welsh-speaking percentage.");
  }
  assert(ranking.results.every((row, i, all) => i === 0 || all[i - 1].count / all[i - 1].denominator >= row.count / row.denominator), "Ranking order is incorrect.");

  for (const name of ["summarize_schools_by_ward", "summarize_food_businesses_by_ward"]) {
    const call = await client.callTool({ name, arguments: {} });
    assert(!call.isError, `${name} failed.`);
    const summary = call.structuredContent?.result;
    assert(summary?.wards?.length === eligible.length, `${name} omitted wards.`);
    const coverage = summary.authority_coverage;
    assert(coverage && coverage.population === coverage.exact + coverage.approximate + coverage.unresolved, "Invalid association coverage.");
    assert(summary.wards.reduce((sum, row) => sum + row.population, 0) + coverage.unresolved === coverage.population, "Incomplete ward population.");
    assert(summary.geography?.reference_version && summary.geography.boundary_dates.ward === "2022-05", "Missing geography version.");
    for (const row of summary.wards) {
      assert(eligible.some(a => a.code === row.area.code), "Unsupported ward in summary.");
      assert(row.population === row.exact + row.approximate && row.unresolved === 0, "Invalid ward allocation counts.");
      if (row.rating_counts) {
        assert(Object.values(row.rating_counts).reduce((sum, count) => sum + count, 0) === row.population, "Incomplete rating distribution.");
        assert(row.numeric_rating_denominator === [0,1,2,3,4,5].reduce((sum, rating) => sum + row.rating_counts[rating], 0), "Incorrect numeric denominator.");
      }
    }
    if (name === "summarize_food_businesses_by_ward") assert(summary.data_mode === "snapshot" && isIsoTimestamp(summary.source_extract_time), "Missing FSA snapshot date.");
    const wardCall = await client.callTool({ name: name === "summarize_schools_by_ward" ? "find_schools" : "find_food_businesses", arguments: { ward: summary.wards[0].area.code, limit: 1 } });
    assert(!wardCall.isError, "Bounded ward discovery failed.");
    assert(wardCall.structuredContent?.result?.total_count === summary.wards[0].population, "Ward discovery and summary disagree.");
  }

  const schools = await client.callTool({ name: "find_schools", arguments: { limit: 3 } });
  assert(!schools.isError, "School directory search failed.");
  const directory = schools.structuredContent?.result;
  assert(Array.isArray(directory?.schools) && directory.schools.length > 0 && directory.schools.length <= 3, "Invalid school results.");
  assert(Number.isInteger(directory.total_count) && directory.total_count >= directory.schools.length, "Invalid school total.");
  assert(directory.page === 1 && typeof directory.has_more === "boolean", "Invalid school pagination.");
  assert(directory.source_url === "https://www.gov.wales/addresses-and-phone-numbers-schools-and-pupil-referral-units", "Invalid school source URL.");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(directory.source_published_at), "Missing school publication date.");
  assert(isIsoTimestamp(directory.snapshot_imported_at), "Missing school import date.");
  assert(directory.attribution === "Contains public sector information licensed under the Open Government Licence v3.0. Source: Welsh Government.", "Missing school attribution.");
  for (const school of directory.schools) {
    assert(/^681\d{4}$/.test(school.school_id) && school.local_authority_code === "681", "School is outside Cardiff or has an invalid ID.");
    for (const field of ["name", "sector", "school_type", "governance", "language_category", "language_group", "address", "postcode", "telephone"]) {
      assert(typeof school[field] === "string" && school[field].length > 0, `Missing school ${field}.`);
    }
  }

  const profileCall = await client.callTool({
    name: "get_school", arguments: { school_id: directory.schools[0].school_id },
  });
  assert(!profileCall.isError, "School profile failed.");
  const profile = profileCall.structuredContent?.result;
  assert(profile?.school_id === directory.schools[0].school_id, "Profile school ID differs.");
  assert(profile.name === directory.schools[0].name && profile.identity_source === "register", "Profile identity differs.");
  for (const key of ["register", "characteristics", "year_groups", "fsm"]) {
    const source = profile.sources?.[key];
    assert(source?.provider === "Welsh Government", "Missing profile provider.");
    assert(typeof source.source_url === "string" && source.source_url.startsWith("https://"), "Missing profile source URL.");
    assert(/^\d{4}-\d{2}-\d{2}$/.test(source.publication_date), "Missing profile publication date.");
    assert(isIsoTimestamp(source.snapshot_imported_at), "Missing profile import date.");
    assert(source.attribution?.includes("Open Government Licence v3.0"), "Missing profile attribution.");
    if (key !== "register") {
      assert(source.publishing_service === "StatsWales", "Missing StatsWales provenance.");
      assert(/^\d{4}\/\d{2}$/.test(source.reporting_period), "Missing statistics period.");
      assert(/^\d{4}-\d{2}-\d{2}$/.test(source.census_date), "Missing census date.");
    }
  }
  const measures = [profile.pupils.total, profile.fsm.all_pupils,
    profile.fsm.eligible.count, profile.fsm.eligible.percentage,
    profile.fsm.eligible_or_transitionally_protected.count, profile.fsm.eligible_or_transitionally_protected.percentage,
    ...Object.values(profile.year_groups.values)];
  for (const measure of measures) {
    assert(["reported", "suppressed", "unavailable", "not_applicable"].includes(measure.status), "Invalid measure status.");
    assert(measure.status === "reported" ? typeof measure.value === "number" && measure.value >= 0 : measure.value === null, "Invalid measure value/status.");
  }

  const search = await client.callTool({
    name: "find_food_businesses",
    arguments: { business_type: "restaurant_cafe_canteen", minimum_rating: 5, page: 1, limit: 3 },
  });
  if (search.isError) throw new Error(`Search tool failed: ${JSON.stringify(search.content)}`);
  const searchResult = search.structuredContent?.result;
  assert(Array.isArray(searchResult?.businesses), "Search did not return a businesses array.");
  assert(searchResult.businesses.length > 0, "Search returned no rating-5 Cardiff establishments.");
  assert(searchResult.businesses.length <= 3, "Search exceeded its requested result limit.");
  assert(searchResult.page === 1, "Search returned an unexpected page number.");
  assert(typeof searchResult.total_count === "number", "Search returned no total count.");
  assert(typeof searchResult.has_more === "boolean", "Search returned no pagination indicator.");
  assert(searchResult.attribution === expectedAttribution, "Search attribution is missing or changed.");
  assert(isIsoTimestamp(searchResult.source_retrieved_at), "Search has no valid retrieval timestamp.");
  searchResult.businesses.forEach((business, index) => validateBusiness(business, `Search result ${index + 1}`));

  const first = searchResult.businesses[0];

  const detail = await client.callTool({
    name: "get_food_business",
    arguments: { establishment_id: first.establishment_id },
  });
  if (detail.isError) throw new Error(`Detail tool failed: ${JSON.stringify(detail.content)}`);
  const detailResult = detail.structuredContent?.result;
  validateBusiness(detailResult, "Detail result");
  assert(detailResult.establishment_id === first.establishment_id, "Detail result has a different establishment ID.");
  assert(detailResult.business_name === first.business_name, "Detail result has a different business name.");
  assert(detailResult.rating === first.rating, "Detail result has a different rating.");
  assert(detailResult.attribution === expectedAttribution, "Detail attribution is missing or changed.");

  console.log(
    JSON.stringify(
      {
        endpoint: endpoint.toString(),
        tools: names,
        assertions: "passed",
        checked_results: searchResult.businesses.length,
        sample: detailResult,
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}
