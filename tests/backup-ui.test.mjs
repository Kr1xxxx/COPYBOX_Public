import assert from "node:assert/strict";
import test from "node:test";
import { readUiSource } from "./helpers/ui-source.mjs";

const pageSource = readUiSource();

test("the application UI exports snippets but offers no secret export control", () => {
  assert.match(pageSource, /vaultDataForBackupScope\([^)]*, "snippet"\)/);
  assert.match(pageSource, /导出话术备份/);
  assert.doesNotMatch(pageSource, /导出安全备份/);
  assert.doesNotMatch(pageSource, />导出秘密/);
});
