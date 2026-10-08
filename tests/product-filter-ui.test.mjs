import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const styles = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("keeps the open product filter menu above the animated card list", () => {
  assert.match(
    styles,
    /\.native-search\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*[1-9]\d*;/,
    "the focused search bar creates a stacking context, so it must be elevated above the later card-list stacking context",
  );
});
