import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const origin = process.argv.slice(2).find((argument) => argument !== "--") || "http://127.0.0.1:3000";
const endpoint = new URL("/mcp", `${origin}/`);
const client = new Client({ name: "cardiff-mcp-smoke-test", version: "0.1.0" });

try {
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name).sort();
  const expected = ["find_food_businesses", "get_food_business"];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`Expected tools ${expected.join(", ")}; received ${names.join(", ")}`);
  }

  const search = await client.callTool({
    name: "find_food_businesses",
    arguments: { business_type: "restaurant_cafe_canteen", minimum_rating: 5, limit: 1 },
  });
  if (search.isError) throw new Error(`Search tool failed: ${JSON.stringify(search.content)}`);
  const first = search.structuredContent?.result?.businesses?.[0];
  if (!first?.establishment_id) throw new Error("Search did not return a usable Cardiff establishment ID.");

  const detail = await client.callTool({
    name: "get_food_business",
    arguments: { establishment_id: first.establishment_id },
  });
  if (detail.isError) throw new Error(`Detail tool failed: ${JSON.stringify(detail.content)}`);
  console.log(JSON.stringify({ endpoint: endpoint.toString(), tools: names, sample: detail.structuredContent?.result }, null, 2));
} finally {
  await client.close();
}
