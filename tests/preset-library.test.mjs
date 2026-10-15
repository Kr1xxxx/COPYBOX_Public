import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parsePresetLibrary, sharedLibraryJson } from "../tools/preset-library.mjs";
import { PRESET_LIBRARY } from "../app/preset-library.ts";
import { parseSharedLibrary, presetLibraryText } from "../app/shared-library.ts";
import { DEFAULT_SNIPPET_FOLDERS, STANDARD_SNIPPET_FOLDERS, normalizeImportedSnippetFolder } from "../app/snippet-folders.ts";

const sample = readFileSync(new URL("../docs/samples/standard-library-sample.md", import.meta.url), "utf8");

test("the 标准话术库 document becomes folders and entries with stable ids", () => {
  const library = parsePresetLibrary(sample);
  assert.deepEqual(library.folders, ["开场接待", "群发", "通用短句"]);
  assert.deepEqual(library.items.map((item) => [item.id, item.folder, item.label]), [
    ["STD-1.1-01", "开场接待", "新询盘｜通用开场"],
    ["STD-1.1-02", "开场接待", "新询盘｜定制询盘进线"],
    ["STD-1.2-01", "开场接待", "打招呼"],
    ["STD-2.1-01", "群发", "新品通知｜A: 多款新品"],
    ["STD-3-01", "通用短句", "请稍等"],
    ["STD-3-02", "通用短句", "收尾"],
  ]);
  assert.equal(library.items[0].secret, "Hi lovely 👋 This is [名字] from [Company].\nHow can I help you today?");
  assert.equal(library.items[3].usageNote, "群发三行以内.");
  assert.equal(library.items[0].usageNote, "");
});

test("the generated library is a company library the app accepts whole, with fill-in blocks", () => {
  const library = parsePresetLibrary(sample);
  const { items, skipped } = parseSharedLibrary(sharedLibraryJson(library, 0));
  assert.equal(skipped, 0);
  assert.equal(items.length, library.items.length);
  assert.deepEqual(items[0].placeholders, ["名字", "Company"]);
  // Folders are only kept when they are this build's standard folders; the public build has the default seven.
  assert.equal(items[0].folder, "询盘接待");
  assert.equal(presetLibraryText(library) !== "", true);
  assert.equal(presetLibraryText({ folders: [], items: [] }), "");
});

test("the public build ships no 话术 and keeps the seven standard folders", () => {
  assert.deepEqual(PRESET_LIBRARY, { folders: [], items: [] });
  assert.deepEqual([...STANDARD_SNIPPET_FOLDERS], [...DEFAULT_SNIPPET_FOLDERS]);
  assert.equal(presetLibraryText(), "");
  assert.equal(normalizeImportedSnippetFolder("售后"), "售后争议");
});

test("a 话术 document imports with its chapters as folders, fill-in blocks and no duplicates on a second import", async () => {
  const { buildSnippetDocImportPreview, SNIPPET_DOC_EMPTY } = await import("../app/snippet-doc.ts");
  let n = 0;
  const preview = buildSnippetDocImportPreview(sample, [], () => `id-${++n}`, 5);
  assert.equal(preview.importableCount, 6);
  assert.deepEqual(preview.folders, ["开场接待", "群发", "通用短句"]);
  const first = preview.items[0];
  assert.equal(first.folder, "开场接待");
  assert.equal(first.label, "新询盘｜通用开场");
  assert.deepEqual(first.snippetMeta.placeholders, ["名字", "Company"]);
  assert.equal(preview.items[3].snippetMeta.usageNote, "群发三行以内.");
  const again = buildSnippetDocImportPreview(sample, preview.items, () => "x", 6);
  assert.equal(again.importableCount, 0);
  assert.equal(again.duplicateCount, 6);
  assert.throws(() => buildSnippetDocImportPreview("随便写的一段话\n没有目录", [], () => "x", 0), { message: SNIPPET_DOC_EMPTY });
});

test("Windows line endings and a byte-order mark read the same", async () => {
  const { parseSnippetDocument } = await import("../app/snippet-doc.ts");
  assert.deepEqual(parseSnippetDocument(`\uFEFF${sample.replace(/\n/g, "\r\n")}`), parseSnippetDocument(sample));
});
