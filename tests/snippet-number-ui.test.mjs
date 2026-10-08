import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const pageSource = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("shows a snippet number only in the opened entry and the editor", () => {
  assert.doesNotMatch(pageSource, /className="snippet-number"/);
  assert.doesNotMatch(pageSource, /request\.item\.snippetNumber/);
  assert.match(
    pageSource,
    /isSelected && isSnippet && item\.snippetNumber && <b className="row-snippet-number">\{item\.snippetNumber\}<\/b>/,
  );
  assert.match(
    pageSource,
    /kind === "snippet" && item\?\.snippetNumber && <b className="editor-snippet-number">\{item\.snippetNumber\}<\/b>/,
  );
});

test("the list no longer shows snippet summaries or copy times", () => {
  assert.doesNotMatch(pageSource, /className="snippet-summary"/);
  assert.doesNotMatch(pageSource, /未填写中文总结/);
});
