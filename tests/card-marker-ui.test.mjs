import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const styles = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("the category marker is a compact round drag affordance", () => {
  const markerRule = styles.match(/\.drag-handle i \{([^}]*)\}/)?.[1] || "";

  assert.match(markerRule, /width: 8px/);
  assert.match(markerRule, /height: 8px/);
  assert.match(markerRule, /border-radius: 50%/);
  assert.match(styles, /\.drag-handle:focus-visible/);
});
