// Optional release acceptance. Does not persist observations or run in daily CI.
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
const origin = process.argv[2] ?? "http://127.0.0.1:3000";
const client = new Client({ name: "mcp-wales-census-acceptance", version: "0.1" });
function assert(condition, message) { if (!condition) throw new Error(message); }
async function call(name, args) {
  const response = await client.callTool({ name, arguments: args });
  assert(!response.isError, `${name} failed: ${JSON.stringify(response.structuredContent)}`);
  return response.structuredContent.result;
}
try {
  await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", origin)));
  const whitchurch = await call("find_census_areas", { query: "Whitchurch" });
  assert(whitchurch.areas[0].code === "W05001297" && whitchurch.areas[0].requires_selection, "Whitchurch must require selection.");
  const roath = await call("find_census_areas", { query: "Roath" });
  assert(roath.areas.length === 0 && roath.note, "Roath must not be silently substituted.");
  const approximate = await client.callTool({ name: "get_area_demographics", arguments: { area: "Whitchurch", topic: "age" } });
  assert(approximate.isError && approximate.structuredContent.error === "ambiguous_area", "Approximate retrieval was accepted.");
  const age = await call("compare_area_demographics", { areas: ["Llanishen", "Grangetown"], topic: "age" });
  assert(age.areas.length === 2 && age.dataset_id === "TS007", "Invalid ward comparison.");
  const selected = await call("get_area_demographics", { area: "W05001297", topic: "age", detail_level: "full" });
  assert(selected.breakdown.reduce((sum, band) => sum + band.count, 0) === selected.denominator, "Age bands do not cover the denominator.");
  const councils = await call("compare_area_demographics", { areas: ["Cardiff", "Swansea"], topic: "population" });
  assert(councils.areas.every(row => row.area.area_type === "local_authority"), "Invalid council comparison.");
  const msoa = await call("get_area_demographics", { area: "W02000367", topic: "sex" });
  assert(msoa.area.area_type === "msoa", "MSOA query failed.");
  // Independently read the same official published table, not the MCP output.
  const response = await fetch(age.source_api_url, { headers: { Accept: "application/json", "User-Agent": "mcp-wales/0.1 (+https://mcp.wales)" }, signal: AbortSignal.timeout(8000) });
  assert(response.ok, `ONS numerical verification returned HTTP ${response.status}.`);
  const raw = await response.json();
  assert(raw.dimensions[0].dimension_name === "wd" && raw.dimensions[1].dimension_name === "resident_age_101a", "Unexpected verification dimensions.");
  const categories = raw.dimensions[1].options;
  for (const row of age.areas) {
    const index = raw.dimensions[0].options.findIndex(option => option.id === row.area.code);
    const counts = raw.observations.slice(index * categories.length, (index + 1) * categories.length);
    const total = counts.reduce((sum, count) => sum + count, 0);
    const older = counts.reduce((sum, count, i) => sum + (Number(categories[i].id) >= 65 ? count : 0), 0);
    assert(row.denominator === total && row.measures.aged_65_plus.count === older && row.measures.aged_65_plus.percentage === Math.round(older / total * 10000) / 100, "MCP differs from published ONS table.");
  }
  assert(age.census_date === "2021-03-21" && age.limitations.includes("not today's population"), "Missing historical census limitation.");
  console.log(JSON.stringify({ endpoint: origin, assertions: "passed", checks: ["approximate selection", "Roath non-equivalence", "ward age comparison", "full age bands", "Cardiff/Swansea", "MSOA sex", "independent ONS count/percentage verification", "historical date"] }));
} finally { await client.close(); }
