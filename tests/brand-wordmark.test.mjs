import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render, SOURCE, TARGET } from "../tools/brand/wordmark-to-tsx.mjs";

// The settings page shows the brand wordmark as an inline SVG component generated from docs/brand/wordmark-cn.svg.
test("app/brand-wordmark.tsx is what tools/brand/wordmark-to-tsx.mjs generates from docs/brand/wordmark-cn.svg", () => {
  assert.equal(readFileSync(TARGET, "utf8"), render(readFileSync(SOURCE, "utf8")), "run: node tools/brand/wordmark-to-tsx.mjs");
});

test("the generated wordmark keeps every glyph, fills with currentColor and is hidden from screen readers", () => {
  const svg = readFileSync(SOURCE, "utf8");
  const tsx = readFileSync(TARGET, "utf8");
  assert.equal((tsx.match(/<path /g) ?? []).length, (svg.match(/<path /g) ?? []).length);
  assert.match(tsx, /fill="currentColor"/);
  assert.match(tsx, /aria-hidden="true"/);
  assert.doesNotMatch(tsx, /#000000|#ffffff/i, "colour comes from CSS, not the file");
});
