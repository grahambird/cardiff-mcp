import { execFileSync } from "node:child_process";
import { it } from "vitest";
it("validates complete source imports and preserves active snapshots on failed preparation", () => {
  execFileSync("python3", ["scripts/test-geography-imports.py"], { stdio: "pipe" });
});
