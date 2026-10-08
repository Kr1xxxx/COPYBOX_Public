import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const styles = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("the category marker is a compact heart-shaped drag affordance", () => {
  const markerRule = styles.match(/\.drag-handle i\{([^}]*)\}/)?.[1] || "";

  assert.match(markerRule, /width:15px/);
  assert.match(markerRule, /height:14px/);
  assert.match(markerRule, /mask:url\("data:image\/svg\+xml/);
  assert.match(markerRule, /M12 21\.35l-1\.45-1\.32/);
});
