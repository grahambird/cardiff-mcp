import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearWasteStateForTests, findWasteCollectionAddresses, getWasteCollections, normalizePostcode, WasteError } from "./client";

const token = `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify({ exp: 4_102_444_800 })).toString("base64url")}.sig`;
const tokenResponse = () => new Response(`<GetJWTResult>{&quot;access_token&quot;:&quot;${token}&quot;}</GetJWTResult>`, { status: 200 });

describe("Cardiff waste client", () => {
  beforeEach(() => {
    clearWasteStateForTests();
    vi.restoreAllMocks();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("normalizes UK postcodes and rejects malformed input", () => {
    expect(normalizePostcode("cf10 4uw")).toBe("CF10 4UW");
    expect(() => normalizePostcode("not a postcode")).toThrow(WasteError);
  });

  it("returns bounded ambiguous addresses and preserves UPRNs as strings", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { uprn: 1000000000001, fullAddress: "1 Example Court, Cardiff, CF10 1AA" },
        { uprn: "1000000000002", fullAddress: "2 Example Court, Cardiff, CF10 1AA" },
      ]), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await findWasteCollectionAddresses({ postcode: "CF10 1AA", limit: 1 });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].property_id).toBe("1000000000001");
    expect(result.truncated).toBe(true);
    expect(result.match_count).toBe(2);
    const request = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(request.searchTerm).toBe("CF10 1AA");
  });

  it("represents HTTP 204 as no matches", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(new Response(null, { status: 204 })));
    const result = await findWasteCollectionAddresses({ postcode: "CF10 1AA", limit: 10 });
    expect(result.status).toBe("no_matches");
    expect(result.matches).toEqual([]);
  });

  it("maps standard, moved, missing and unknown statuses without inventing dates", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(new Response(JSON.stringify({
      collectionWeeks: [
        { date: "2026-10-16T00:00:00", bins: [{ type: "Food", collectionType: "Standard" }, { type: "Garden", collectionType: "Moved" }] },
        { date: "2026-10-23T00:00:00", bins: [{ type: "New stream" }, { type: "Glass", collectionType: "Other" }] },
      ],
    }), { status: 200 })));
    const result = await getWasteCollections("1000000000001");
    expect(result.collections.map((item) => item.schedule_status)).toEqual(["scheduled", "rescheduled", "unknown", "unknown"]);
    expect(result.schedule_window_start).toBe("2026-10-16");
    expect(result.schedule_window_end).toBe("2026-10-23");
  });

  it("distinguishes empty schedules from malformed responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ collectionWeeks: [] }), { status: 200 })));
    expect((await getWasteCollections("1000000000001")).status).toBe("no_collections");

    clearWasteStateForTests();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(new Response("not json", { status: 200 })));
    await expect(getWasteCollections("1000000000002")).rejects.toMatchObject({ code: "malformed" });
  });

  it("represents an unknown property response as not found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(new Response(null, { status: 204 })));
    await expect(getWasteCollections("1000000000001")).rejects.toMatchObject({ code: "not_found", status: 204 });
  });

  it("deduplicates simultaneous collection requests and serves a cache hit", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ collectionWeeks: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const [first, second] = await Promise.all([getWasteCollections("1000000000001"), getWasteCollections("1000000000001")]);
    const third = await getWasteCollections("1000000000001");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(first.cache_status).toBe("miss");
    expect(second.status).toBe("no_collections");
    expect(third.cache_status).toBe("hit");
  });

  it("retries throttling once and honours access-denied without retry", async () => {
    const throttled = vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "0" } })).mockResolvedValueOnce(new Response(JSON.stringify({ collectionWeeks: [] }), { status: 200 }));
    vi.stubGlobal("fetch", throttled);
    expect((await getWasteCollections("1000000000001")).status).toBe("no_collections");
    expect(throttled).toHaveBeenCalledTimes(3);

    clearWasteStateForTests();
    const denied = vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(new Response("", { status: 403 }));
    vi.stubGlobal("fetch", denied);
    await expect(getWasteCollections("1000000000002")).rejects.toMatchObject({ code: "access_denied" });
    expect(denied).toHaveBeenCalledTimes(2);
  });

  it("categorizes exhausted timeouts and malformed token XML", async () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const timedOut = vi.fn().mockRejectedValue(timeout);
    vi.stubGlobal("fetch", timedOut);
    await expect(getWasteCollections("1000000000001")).rejects.toMatchObject({ code: "timeout" });
    expect(timedOut).toHaveBeenCalledTimes(2);

    clearWasteStateForTests();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("<unexpected />", { status: 200 })));
    await expect(getWasteCollections("1000000000002")).rejects.toMatchObject({ code: "malformed" });
  });

  it("does not expose postcode or UPRN in cache log fields", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(new Response(null, { status: 204 })));
    await findWasteCollectionAddresses({ postcode: "CF10 1AA", house_number: "7", limit: 10 });
    const logs = info.mock.calls.flat().join("\n");
    expect(logs).not.toContain("CF10");
    expect(logs).not.toContain("100000");
  });
});
