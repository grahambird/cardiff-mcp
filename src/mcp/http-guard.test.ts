import { afterEach, expect, it, vi } from "vitest";
import { guardMcpHandler } from "./http-guard";
afterEach(() => vi.unstubAllEnvs());
it("allows absent and configured origins, rejecting reflected or malformed origins", async () => {
  vi.stubEnv("VERCEL_URL", "preview.vercel.app");
  vi.stubEnv("NODE_ENV", "production");
  const handler = vi.fn(async () => new Response("ok"));
  const guarded = guardMcpHandler(handler);
  for (const origin of [undefined, "https://mcp.wales", "https://preview.vercel.app"]) {
    expect((await guarded(new Request("https://mcp.wales/mcp", { headers: origin ? { origin } : {} }))).status).toBe(200);
  }
  for (const origin of ["https://evil.test", "null", "https://mcp.wales.evil.test", "http://localhost:3000"]) {
    expect((await guarded(new Request("https://evil.test/mcp", { headers: { origin, "x-forwarded-host": "evil.test" } }))).status).toBe(403);
  }
  vi.stubEnv("NODE_ENV", "development");
  expect((await guarded(new Request("http://localhost:3000/mcp", { headers: { origin: "http://localhost:3000" } }))).status).toBe(200);
});
it("counts actual streamed bytes before dispatch, including missing or false length", async () => {
  const handler = vi.fn(async (r: Request) => new Response(await r.text()));
  const guarded = guardMcpHandler(handler);
  for (const headers of [{}, { "content-length": "1" }, { "content-length": "65537" }] as HeadersInit[]) {
    expect((await guarded(new Request("https://mcp.wales/mcp", { method: "POST", headers, body: "x".repeat(65537) }))).status).toBe(413);
  }
  expect(handler).not.toHaveBeenCalled();
  const exact = "x".repeat(65536);
  expect(await (await guarded(new Request("https://mcp.wales/mcp", { method: "POST", body: exact }))).text()).toBe(exact);
});
