import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const origin = process.argv.slice(2).find((argument) => argument !== "--") || "http://127.0.0.1:3000";
const endpoint = new URL("/mcp", `${origin}/`);
const client = new Client({ name: "cardiff-mcp-smoke-test", version: "0.1.0" });
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
  const expected = ["find_food_businesses", "get_food_business"];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`Expected tools ${expected.join(", ")}; received ${names.join(", ")}`);
  }
  for (const tool of tools) {
    assert(tool.annotations?.readOnlyHint === true, `${tool.name} is not advertised as read-only.`);
    assert(tool.annotations?.destructiveHint === false, `${tool.name} is incorrectly advertised as destructive.`);
    assert(typeof tool.description === "string" && tool.description.length > 0, `${tool.name} has no description.`);
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
