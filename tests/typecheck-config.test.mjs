import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("CI type-checks app/ with its own config, separate from the build", () => {
  const config = JSON.parse(read("tsconfig.typecheck.json"));
  assert.equal(config.compilerOptions.noEmit, true);
  assert.equal(config.compilerOptions.strict, true);
  assert.ok(config.include.some((pattern) => pattern.startsWith("app/")));
  assert.equal(JSON.parse(read("package.json")).scripts.typecheck, "tsc -p tsconfig.typecheck.json");
  assert.match(read(".github/workflows/ci.yml"), /- run: npm run typecheck/);
});
