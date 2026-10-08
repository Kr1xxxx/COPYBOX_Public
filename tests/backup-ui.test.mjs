import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const pageSource = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("the application UI exports snippets but offers no secret export control", () => {
  assert.match(pageSource, /vaultDataForBackupScope\([^)]*, "snippet"\)/);
  assert.match(pageSource, /导出话术备份/);
  assert.doesNotMatch(pageSource, /导出安全备份/);
  assert.doesNotMatch(pageSource, />导出秘密/);
});
