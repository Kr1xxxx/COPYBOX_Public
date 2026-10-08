import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const pageSource = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("copy feedback stays inside a compact accessible card button", () => {
  assert.doesNotMatch(pageSource, /className="copy-feedback"/);
  assert.match(pageSource, /className="copy-check"/);
  assert.match(pageSource, /className="copy-status" role="status" aria-live="polite">已复制/);
  assert.match(pageSource, /aria-label=\{copiedId === item\.id \? `已复制/);

  assert.match(styles, /\.native-copy\{[^}]*width:24px;height:24px/);
  assert.match(styles, /\.native-copy:focus-visible\{/);
  assert.match(styles, /\.copied \.native-copy\{[^}]*color:#2f9b62/);
  assert.doesNotMatch(styles, /\.copy-feedback/);
  assert.doesNotMatch(styles, /\.native-row\.copied \.native-pin/);
});
