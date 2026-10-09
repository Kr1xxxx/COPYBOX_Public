import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

test("CI merges only the commit its checks ran on, never a newer unchecked push", () => {
  assert.match(ci, /TESTED_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(ci, /headRefOid[^\n]*!= "\$TESTED_SHA"/);
  assert.match(ci, /gh pr merge "\$PR" --merge --delete-branch --match-head-commit "\$TESTED_SHA"/);
});
