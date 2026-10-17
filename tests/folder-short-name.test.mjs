import assert from "node:assert/strict";
import test from "node:test";
import { STANDARD_SNIPPET_FOLDERS } from "../app/snippet-folders.ts";
import { FOLDER_SHORT_NAME_ERROR, folderShortName, normalizeFolderShortName } from "../app/folder-short-name.ts";

// D-074: the mini window's folder tabs show up to four characters (D-049 had two).

test("a short name the person sets must already be short: four characters or eight Latin letters/digits", () => {
  assert.equal(FOLDER_SHORT_NAME_ERROR, "最多四个字");
  for (const ok of ["跟单", "新", "跟单员", "客户跟单", "AB12", "VIP", "Shopify", "ABCD1234", "🔑密", "👨‍👩‍👧家人账"]) assert.equal(normalizeFolderShortName(ok), ok, ok);
  assert.equal(normalizeFolderShortName("  跟单 "), "跟单", "spaces around are dropped");
  assert.equal(normalizeFolderShortName(""), "", "empty means the default");
  assert.equal(normalizeFolderShortName("   "), "");
  for (const bad of ["客户跟单员", "ABCDEFGHI", "A客", 12, null, undefined, {}]) assert.equal(normalizeFolderShortName(bad), null, String(bad));
  // A valid short name shows exactly as typed, never cut.
  for (const ok of ["跟单", "客户跟单", "AB12", "🔑密"]) assert.equal(folderShortName("很长的目录名字", ok), ok);
});

test("standard 话术 folders show their whole four-character names", () => {
  assert.deepEqual(STANDARD_SNIPPET_FOLDERS.map((folder) => folderShortName(folder)), [...STANDARD_SNIPPET_FOLDERS]);
});

test("other Chinese folders show up to their first four characters", () => {
  assert.equal(folderShortName("开场接待"), "开场接待");
  assert.equal(folderShortName("收款码"), "收款码");
  assert.equal(folderShortName("价目表很长的名字"), "价目表很");
  assert.equal(folderShortName("工作账号"), "工作账号");
});

test("short names stay as they are; 未分类 stays whole", () => {
  assert.equal(folderShortName("工作"), "工作");
  assert.equal(folderShortName("码"), "码");
  assert.equal(folderShortName("未分类"), "未分类");
});

test("emoji count as one character each, joined emoji included", () => {
  assert.equal(folderShortName("🔑密码库备用"), "🔑密码库");
  assert.equal(folderShortName("👨‍👩‍👧家人账号"), "👨‍👩‍👧家人账");
  assert.equal(folderShortName("🇨🇳🇺🇸外贸客户"), "🇨🇳🇺🇸外贸");
});

test("names that start with Latin letters or digits keep up to eight of them", () => {
  assert.equal(folderShortName("Amazon"), "Amazon");
  assert.equal(folderShortName("Alibaba1688"), "Alibaba1");
  assert.equal(folderShortName("VIP客户"), "VIP");
  assert.equal(folderShortName("2024 报价"), "2024");
  assert.equal(folderShortName("AI"), "AI");
});

test("spaces around the name are ignored", () => {
  assert.equal(folderShortName("  收款码  "), "收款码");
  assert.equal(folderShortName(" 询盘接待 "), "询盘接待");
  assert.equal(folderShortName("  Shop "), "Shop");
});

test("a short name set by the person wins and is kept short", () => {
  assert.equal(folderShortName("价目表", "价格"), "价格");
  assert.equal(folderShortName("询盘接待", "新客"), "新客");
  assert.equal(folderShortName("价目表", "价格表单明细"), "价格表单");
  assert.equal(folderShortName("价目表", "   "), "价目表");
  assert.equal(folderShortName("价目表", undefined), "价目表");
});
