import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

// Owner rule (2026-10-12): no decorative English eyebrow labels over Chinese titles.
test("no uppercase English eyebrow labels in the UI", () => {
  const files = readdirSync("app").filter((name) => name.endsWith(".tsx"));
  const found = [];
  for (const file of files) {
    const source = readFileSync(`app/${file}`, "utf8");
    for (const match of source.matchAll(/>\s*([A-Z][A-Z ]{5,})\s*</g)) found.push(`${file}: ${match[1]}`);
    for (const match of source.matchAll(/"((?:[A-Z]{3,}) (?:[A-Z]{2,}(?: [A-Z]{2,})*))"/g)) found.push(`${file}: ${match[1]}`);
  }
  assert.deepEqual(found, []);
});
