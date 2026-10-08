import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const styles = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("editor textarea uses the same readable weight as editor inputs", () => {
  assert.match(
    styles,
    /\.soft-textarea textarea\{[^}]*font-weight:620(?:;|})/,
    "editor textarea should avoid a light weight that makes diagonal glyphs look faded",
  );
});
