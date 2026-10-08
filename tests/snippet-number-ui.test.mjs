import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const pageSource = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("shows a snippet number only inside the opened editor", () => {
  assert.doesNotMatch(pageSource, /className="snippet-number"/);
  assert.doesNotMatch(pageSource, /request\.item\.snippetNumber/);
  assert.match(
    pageSource,
    /kind === "snippet" && item\?\.snippetNumber && <b className="editor-snippet-number">\{item\.snippetNumber\}<\/b>/,
  );
});
