import { afterEach, describe, expect, it, vi } from "vitest";
import { logEvent } from "./logger";

describe("structured logger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("emits searchable single-line JSON", () => {
    const output = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logEvent("info", "mcp_tool_call", {
      tool: "find_food_businesses",
      outcome: "success",
      duration_ms: 42,
      result_count: 3,
    });

    expect(output).toHaveBeenCalledOnce();
    const entry = JSON.parse(output.mock.calls[0][0] as string);
    expect(entry).toMatchObject({
      level: "info",
      event: "mcp_tool_call",
      tool: "find_food_businesses",
      outcome: "success",
      duration_ms: 42,
      result_count: 3,
    });
    expect(entry.timestamp).toEqual(expect.any(String));
  });
});
