import { afterEach, expect, it, vi } from "vitest";
import { runFindFoodBusinesses, runGetFoodBusiness, findFoodBusinessesInput } from "./tools";
import { runGetAreaDemographics } from "./census-tools";
import { runFindSchools } from "./school-tools";
import { clearFsaCacheForTests } from "@/fsa/client";
import { clearOnsCacheForTests } from "@/ons/client";
import { POST } from "@/app/mcp/route";
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("never exposes search text, credential markers or diagnostic bodies in errors/logs", async () => {
  clearFsaCacheForTests(); clearOnsCacheForTests();
  const marker = "synthetic-secret-password-token";
  const output: unknown[] = [];
  for (const method of ["info", "warn", "error"] as const) vi.spyOn(console, method).mockImplementation((...args) => { output.push(args); });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(marker, { status: 502 })));
  const responses = [await runFindFoodBusinesses({ name: marker, page: 1, limit: 1 })];
  expect(responses[0]).toHaveProperty("isError", true);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error(`${marker} at /internal/secret.ts`); }));
  responses.push(await runGetFoodBusiness({ establishment_id: 123 }));
  const census = await runGetAreaDemographics({ area: "Cardiff", topic: "population", detail_level: "summary" });
  expect(census).toHaveProperty("isError", true);
  const invalid = await runFindSchools({ name: marker.repeat(100), page: 1, limit: 1 });
  expect(invalid).toHaveProperty("isError", true);
  expect(JSON.stringify({ responses, census, invalid, output })).not.toContain(marker);
  expect(JSON.stringify({ responses, census, invalid, output })).not.toContain("/internal/");
});
it.each([{ name: "x".repeat(101) }, { limit: 21 }, { page: 11 }, { page: -1 }, { limit: "5" }, { minimum_rating: 6 }, { sort_by: "date" }])("rejects malformed/bounded input %j without a source request", async input => {
  vi.stubGlobal("fetch", vi.fn());
  expect(findFoodBusinessesInput.safeParse(input).success).toBe(false);
  const result = await runFindFoodBusinesses(input as unknown as Parameters<typeof runFindFoodBusinesses>[0]);
  expect(result).toMatchObject({ isError: true, structuredContent: { error: "invalid_input" } });
  expect(fetch).not.toHaveBeenCalled();
});
it("does not echo invalid tool arguments through the SDK HTTP error", async () => {
  const marker = "synthetic-secret-do-not-echo";
  const response = await POST(new Request("https://mcp.wales/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "find_food_businesses", arguments: { name: marker, sort_by: marker } } }) }));
  expect(await response.text()).not.toContain(marker);
});
