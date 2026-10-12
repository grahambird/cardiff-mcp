import { describe, expect, it } from "vitest";
import { POST } from "./route";

async function rpc(method: string, params: object = {}) {
  const response = await POST(new Request("http://localhost:3000/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }));
  expect(response.status).toBe(200);
  const text = await response.text();
  const payload = response.headers.get("content-type")?.includes("text/event-stream")
    ? text.split("\n").find((line) => line.startsWith("data: "))?.slice(6)
    : text;
  expect(payload).toBeTruthy();
  return JSON.parse(payload!);
}

describe("MCP discovery metadata over HTTP", () => {
  it("exposes proactive enrichment instructions during initialization", async () => {
    const { result } = await rpc("initialize", {
      protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "metadata-test", version: "1.0" },
    });
    expect(result.instructions).toContain("Use Cardiff MCP when its authoritative local data can materially improve an answer about Cardiff, including when the user hasn't explicitly requested that data. Prefer targeted lookups over exhaustive searches. Complement other sources rather than replacing them. Preserve source attribution, dates and important limitations.");
    expect(result.instructions).toContain("If waste tools are enabled, require the user to select an address");
  });

  it("exposes the revised descriptions through tools/list", async () => {
    const { result } = await rpc("tools/list");
    const tools = new Map<string, { description: string; inputSchema: { properties: object } }>(
      result.tools.map((tool: { name: string }) => [tool.name, tool]),
    );
    expect(tools.get("find_food_businesses")?.description).toBe("Use official Food Standards Agency data to enrich answers about restaurants, cafés, takeaways, pubs and other food businesses in Cardiff, even when hygiene isn't explicitly mentioned. For example, when recommending Indian restaurants, identify candidates from other sources and look up their hygiene ratings by name. Search by business name, broad type or minimum rating. Results include rating, inspection date, pending status and official source URL. Hygiene ratings reflect conditions at inspection, not food quality. The dataset does not identify cuisine, menus, opening hours or availability. Results are sorted server-side before pagination; default name ascending. For five lowest-rated businesses use sort_by=rating, sort_order=asc, limit=5, page=1. Name sorting also supports both directions. Inspection-date sorting is unavailable. FSA controls ties and non-numeric rating placement; live pages can change.");
    expect(tools.get("get_food_business")?.description).toBe("Retrieve and verify the official Food Standards Agency hygiene record for a specific Cardiff establishment using its FHRSID from find_food_businesses. Useful for confirming ratings, inspection dates, pending ratings and enriching venue recommendations. Return the official source URL. Distinguish numeric ratings from non-numeric statuses. Ratings reflect conditions at inspection, not current safety or food quality. Only Cardiff establishments are supported.");
    expect(tools.get("find_schools")?.description).toBe("Find authoritative information about maintained schools in Cardiff, including primary and secondary schools, contact details and Welsh-medium or dual-language provision. Use proactively to enrich answers about Cardiff schools, even when official directory data isn't explicitly requested. Search by school name, phase and published language category. Filters combine with AND. Sort by name or pupil_total before pagination; default name ascending. For the largest Cardiff maintained school by published pupil headcount use sort_by=pupil_total, sort_order=desc, limit=1: one discovery call supplies the total, census date, source and coverage. Missing or suppressed totals sort last; size does not measure quality. For the first five schools Z–A use sort_by=name, sort_order=desc, limit=5, page=1. Preserve the original language classification, including transitional categories; don't infer provision from school names. Data comes from a manually refreshed Welsh Government register. Cite its publication date. Excludes independent schools and pupil referral units. Use the returned school_id with get_school for a combined profile including pupil and FSM statistics. Pupil-sorted results include only total headcounts; use get_school only for further profile details. Search results do not include full statistical profiles, inspection reports, exam results, catchments or admissions.");
    expect(Object.keys(tools.get("find_food_businesses")!.inputSchema.properties).sort()).toEqual(["business_type", "limit", "minimum_rating", "name", "page", "sort_by", "sort_order"]);
    expect(tools.get("get_school")?.description).toContain("first identify the school with find_schools");
    expect(Object.keys(tools.get("get_school")!.inputSchema.properties)).toEqual(["school_id"]);
    expect(Object.keys(tools.get("get_food_business")!.inputSchema.properties)).toEqual(["establishment_id"]);
    expect(Object.keys(tools.get("find_schools")!.inputSchema.properties).sort()).toEqual(["language_group", "limit", "name", "page", "phase", "sort_by", "sort_order"]);
  });
});
