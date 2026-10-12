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
  const expected = ["find_food_businesses", "find_schools", "get_food_business", "get_school"];
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
