import { execFileSync } from "node:child_process";
import { describe, it } from "vitest";

describe("StatsWales importer", () => {
  it("validates representative exports, source changes and failed refreshes", () => {
    execFileSync("python3", ["scripts/test-import-statswales.py"], { stdio: "pipe" });
  });
});
