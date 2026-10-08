import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const styles = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("uses a stable Windows Chinese font stack and the approved title hierarchy", () => {
  assert.match(
    styles,
    /\.platform-win32 body\{font-family:"Microsoft YaHei UI","Microsoft YaHei","Segoe UI",sans-serif\}/,
  );
  assert.match(styles, /\.snippet-title-primary\{font-weight:600\}/);
  assert.match(styles, /\.snippet-title-separator\{[^}]*font-weight:400\}/);
  assert.match(styles, /\.snippet-title-detail\{font-weight:500\}/);
});
