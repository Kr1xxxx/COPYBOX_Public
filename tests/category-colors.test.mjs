import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

let categoryColors;
try {
  categoryColors = await import("../app/category-colors.ts");
} catch {
  categoryColors = undefined;
}

const currentSnippetFolders = [
  "询盘接待",
  "产品样品",
  "报价成交",
  "定制生产",
  "客户跟进",
  "物流清关",
  "售后争议",
];

const refinedCategoryPalette = new Set([
  "#F06F7D",
  "#FF806B",
  "#F4B64A",
  "#E3C653",
  "#A5CE63",
  "#62C483",
  "#53C4A1",
  "#4DBFC4",
  "#67AFE2",
  "#7898E5",
  "#887FE2",
  "#A27DDF",
  "#BE78D3",
  "#D978BD",
  "#EB7DA1",
  "#C78ADE",
  "#E58B72",
  "#A58AE3",
  "#E783B1",
  "#ED7187",
]);

test("assigns one distinct stable color to every current category", () => {
  assert.equal(typeof categoryColors?.buildCategoryColorMap, "function");
  const original = categoryColors.buildCategoryColorMap(currentSnippetFolders);
  const reordered = categoryColors.buildCategoryColorMap([...currentSnippetFolders].reverse());

  assert.equal(new Set(Object.values(original)).size, currentSnippetFolders.length);
  assert.ok(Object.values(original).every((color) => refinedCategoryPalette.has(color)));
  assert.deepEqual(reordered, original);
  assert.equal(original.报价成交, reordered.报价成交);
  assert.equal(original.询盘接待, "#887FE2");
  assert.equal(original.产品样品, "#D978BD");
  assert.equal(original.物流清关, "#C78ADE");
});

test("normalizes duplicate folder names and exposes a neutral fallback", () => {
  assert.equal(typeof categoryColors?.buildCategoryColorMap, "function");
  assert.deepEqual(
    Object.keys(categoryColors.buildCategoryColorMap([" 开发 ", "开发", "", "报价"])).sort(),
    ["开发", "报价"].sort(),
  );
  assert.equal(categoryColors.UNCATEGORIZED_COLOR, "#C7C7CC");
});

test("card and directory markers share the derived category color map", () => {
  const pageSource = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(pageSource, /buildCategoryColorMap\(activeFolders\)/);
  assert.match(pageSource, /className="directory-color-marker"/);
  assert.match(pageSource, /background: categoryColors\[folder\]/);
  assert.match(pageSource, /background: categoryColors\[item\.folder \|\| ""\] \|\| UNCATEGORIZED_COLOR/);
  assert.doesNotMatch(pageSource, /background: item\.color/);
  assert.doesNotMatch(styles, /\.snippet-row \.drag-handle i\{background:[^}]*!important/);
  assert.doesNotMatch(styles, /\.native-row:not\(\.snippet-row\) \.drag-handle i\{background:[^}]*!important/);
});
