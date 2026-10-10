import assert from "node:assert/strict";
import test from "node:test";
import { APP_LINE_LIMIT, TOTAL_LINE_LIMIT, classify } from "../scripts/classify-pr.mjs";

const file = (path, added = 5, deleted = 0, status = "M") => ({ path, added, deleted, status });
const run = (files, { appDiff = "", labels = [] } = {}) => classify({ files, appDiff, labels });

test("a small styling or wording fix merges on its own", () => {
  const result = run([file("app/globals.css", 6, 2), file("app/page.tsx", 4, 4), file("docs/HANDOFF.md", 3, 1)], { appDiff: "+  gap: 8px;\n-  gap: 6px;" });
  assert.deepEqual(result, { size: "small", reasons: [] });
});

test("docs and test additions are small", () => {
  assert.equal(run([file("docs/handoff-log.md", 40), file("tests/e2e/new.e2e.mjs", 120)]).size, "small");
});

test("desktop, dependencies, CI, scripts and the rulebook wait for the owner", () => {
  for (const path of ["desktop/main.cjs", "package.json", "package-lock.json", ".github/workflows/ci.yml", "scripts/classify-pr.mjs", "AGENTS.md", "CLAUDE.md", "CONTRIBUTING.md", "docs/DECISIONS.md", "docs/decisions/D-030-new-rule.md", "eslint.config.mjs", "playwright.config.mjs"]) {
    assert.equal(run([file(path)]).size, "big", path);
  }
});

test("storage and encryption changes wait for the owner", () => {
  assert.equal(run([file("app/page.tsx")], { appDiff: "+  localStorage.setItem(KEY, value);" }).size, "big");
  assert.equal(run([file("app/page.tsx")], { appDiff: "-  const DEVICE_KEY = 'x';" }).size, "big");
  assert.equal(run([file("app/page.tsx")], { appDiff: "@@ -1 +1 @@ localStorage context line" }).size, "small", "hunk headers do not count");
});

test("more than the line limit of app code waits for the owner", () => {
  assert.equal(run([file("app/page.tsx", APP_LINE_LIMIT, 0)]).size, "small");
  assert.equal(run([file("app/page.tsx", APP_LINE_LIMIT, 1)]).size, "big");
});

test("500 or more changed lines in total wait for the owner, whatever the file type", () => {
  assert.equal(run([file(".claude/skills/x/SKILL.md", TOTAL_LINE_LIMIT - 1)]).size, "small");
  assert.equal(run([file(".claude/skills/x/SKILL.md", TOTAL_LINE_LIMIT)]).size, "big");
  assert.equal(run([file("docs/a.md", 300), file("tests/x.test.mjs", 150, 50)]).size, "big", "docs and tests count toward the total");
  assert.equal(run([file("tests/x.test.mjs", 900)]).size, "big");
});

test("deleting app files or loosening tests waits for the owner", () => {
  assert.equal(run([file("app/old.ts", 0, 20, "D")]).size, "big");
  assert.equal(run([file("tests/a.test.mjs", 2, 30)]).size, "big");
  assert.equal(run([file("tests/a.test.mjs", 5, 12)]).size, "small");
});

test("an agent can mark a change as major", () => {
  const result = run([file("app/page.tsx", 10)], { labels: ["major"] });
  assert.equal(result.size, "big");
  assert.match(result.reasons[0], /major/);
});

test("storage code moved unchanged between files is not a storage change", () => {
  const moved = "-  localStorage.getItem(KEY)\n+    localStorage.getItem(KEY)";
  assert.equal(run([file("app/page.tsx", 1, 1), file("app/settings.tsx", 1, 1)], { appDiff: moved }).size, "small");
});

test("an edited storage line still waits for the owner", () => {
  const edited = "-  localStorage.setItem(KEY, a)\n+  localStorage.setItem(KEY, b)";
  assert.equal(run([file("app/page.tsx", 1, 1)], { appDiff: edited }).size, "big");
});

test("a storage line added twice but removed once still waits for the owner", () => {
  const copied = "-  localStorage.getItem(KEY)\n+  localStorage.getItem(KEY)\n+    localStorage.getItem(KEY)";
  assert.equal(run([file("app/page.tsx", 2, 1)], { appDiff: copied }).size, "big");
});

test("a removed storage line with no matching add still waits for the owner", () => {
  assert.equal(run([file("app/page.tsx", 0, 1)], { appDiff: "-  localStorage.removeItem(KEY)" }).size, "big");
});

test("a move plus an unrelated new storage line still waits for the owner", () => {
  const diff = "-  localStorage.getItem(KEY)\n+    localStorage.getItem(KEY)\n+  sessionStorage.setItem(OTHER, v)";
  assert.equal(run([file("app/page.tsx", 2, 1)], { appDiff: diff }).size, "big");
});
