import assert from "node:assert/strict";
import test from "node:test";
import { readUiSource } from "./helpers/ui-source.mjs";

const pageSource = readUiSource();

test("snippets and 备注/秘密 are exported to separate files, never one combined backup", () => {
  assert.match(pageSource, /vaultDataForBackupScope\(currentData, scope\)/);
  assert.match(pageSource, /导出话术备份/);
  assert.match(pageSource, /导出\$\{SECRET_WORD\}备份/);
  assert.match(pageSource, /setBackupMode\("export-secret"\)/);
  assert.doesNotMatch(pageSource, /导出安全备份/);
  assert.doesNotMatch(pageSource, /导出全部/);
});
