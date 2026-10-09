import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { checkHandoff } from "../scripts/check-handoff.mjs";

const add = (file) => ({ status: "A", file });
const mod = (file) => ({ status: "M", file });

const goodNote = () => "# Title\n\n- Date: 2026-10-09\n- What changed: moved the thing and tested it\n";

test("an app change needs a new docs/log note that says what changed, or the old HANDOFF.md update", () => {
  const context = { readFile: goodNote };
  assert.equal(checkHandoff([mod("app/page.tsx")], context).ok, false);
  assert.equal(checkHandoff([mod("app/page.tsx"), add("docs/log/2026-10-09-grid.md")], context).ok, true);
  assert.equal(checkHandoff([mod("app/page.tsx"), mod("docs/HANDOFF.md")], context).ok, true);
});

test("an empty or placeholder note does not count", () => {
  for (const content of ["", "# Title\n", "- What changed:\n", "- What changed: tbd\n"]) {
    assert.equal(checkHandoff([mod("app/page.tsx"), add("docs/log/2026-10-09-grid.md")], { readFile: () => content }).ok, false, JSON.stringify(content));
  }
});

test("editing an existing note or a badly named file is not a handoff note", () => {
  const context = { readFile: goodNote };
  assert.equal(checkHandoff([mod("desktop/main.cjs"), mod("docs/log/2026-10-09-grid.md")], context).ok, false);
  assert.equal(checkHandoff([mod("desktop/main.cjs"), add("docs/log/notes.md")], context).ok, false);
  assert.equal(checkHandoff([mod("package.json"), add("docs/log/2026-10-09-Grid.md")], context).ok, false);
});

test("PRs without app changes need no note", () => {
  assert.equal(checkHandoff([mod("tests/x.test.mjs")]).ok, true);
});

test("only the preview publisher's PRs may edit the preview version files", () => {
  const changes = [mod("tools/preview/VERSION"), mod("tools/preview/changelog.json"), mod("README.md")];
  const result = checkHandoff(changes);
  assert.deepEqual(result.previewFiles, ["tools/preview/VERSION", "tools/preview/changelog.json"]);
  assert.equal(result.ok, false);
  assert.equal(checkHandoff(changes, { labels: ["major"] }).ok, false);
  assert.equal(checkHandoff(changes, { labels: ["preview-publisher"] }).ok, true);
  assert.deepEqual(checkHandoff([mod("README.md")]).previewFiles, []);
  assert.equal(checkHandoff([mod("README.md")]).ok, true);
});

test("decision numbers are unique across DECISIONS.md and docs/decisions/", () => {
  const ids = [...readFileSync("docs/DECISIONS.md", "utf8").matchAll(/^\| (D-\d{3}) \|/gm)].map((m) => m[1]);
  for (const name of readdirSync("docs/decisions")) {
    if (name === "README.md") continue;
    const match = /^(D-\d{3})-[a-z0-9-]+\.md$/.exec(name);
    assert.ok(match, `docs/decisions/${name} must be named D-NNN-short-name.md`);
    ids.push(match[1]);
  }
  assert.equal(new Set(ids).size, ids.length, `duplicate decision number in ${ids.join(", ")}`);
});

test("log notes are named YYYY-MM-DD-short-name.md", () => {
  for (const name of readdirSync("docs/log")) {
    if (name === "README.md") continue;
    assert.match(name, /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*\.md$/);
  }
});
