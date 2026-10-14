import { execFileSync } from "node:child_process";
import { it } from "vitest";
it("validates geography metadata pagination and preserves the catalogue on failure", () => {
  execFileSync("python3", ["scripts/test-census-geographies.py"], { stdio: "pipe" });
});
