import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { shouldPruneRuntimeArtifact } = require("../desktop/runtime-artifact-policy.cjs");

test("prunes only source maps and TypeScript declarations from the packaged runtime", () => {
  for (const file of ["index.js.map", "index.d.ts", "index.d.mts", "index.d.cts"]) {
    assert.equal(shouldPruneRuntimeArtifact(file), true, file);
  }

  for (const file of ["index.js", "index.mjs", "index.cjs", "index.ts", "package.json", "LICENSE.md", "resvg.wasm"]) {
    assert.equal(shouldPruneRuntimeArtifact(file), false, file);
  }
});
