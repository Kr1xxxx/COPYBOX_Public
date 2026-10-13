import assert from "node:assert/strict";
import test from "node:test";
import { STANDARD_SNIPPET_FOLDERS } from "../app/snippet-folders.ts";
import { STANDARD_FOLDER_SHORT_NAMES, folderShortName } from "../app/folder-short-name.ts";

test("standard 话术 folders get their fixed short names", () => {
  assert.deepEqual(STANDARD_SNIPPET_FOLDERS.map((folder) => folderShortName(folder)), ["询盘", "产品", "报价", "定制", "跟进", "物流", "售后"]);
  assert.deepEqual(Object.keys(STANDARD_FOLDER_SHORT_NAMES), [...STANDARD_SNIPPET_FOLDERS]);
});

test("other Chinese folders show their first two characters", () => {
  assert.equal(folderShortName("收款码"), "收款");
  assert.equal(folderShortName("价目表很长的名字"), "价目");
  assert.equal(folderShortName("工作账号"), "工作");
});

test("names of two characters or less stay as they are; 未分类 stays whole", () => {
  assert.equal(folderShortName("工作"), "工作");
  assert.equal(folderShortName("码"), "码");
  assert.equal(folderShortName("未分类"), "未分类");
});

test("emoji count as one character each, joined emoji included", () => {
  assert.equal(folderShortName("🔑密码库"), "🔑密");
  assert.equal(folderShortName("👨‍👩‍👧家人账号"), "👨‍👩‍👧家");
  assert.equal(folderShortName("🇨🇳🇺🇸外贸"), "🇨🇳🇺🇸");
});

test("names that start with Latin letters or digits keep up to four of them", () => {
  assert.equal(folderShortName("Amazon"), "Amaz");
  assert.equal(folderShortName("VIP客户"), "VIP");
  assert.equal(folderShortName("2024 报价"), "2024");
  assert.equal(folderShortName("AI"), "AI");
});

test("spaces around the name are ignored", () => {
  assert.equal(folderShortName("  收款码  "), "收款");
  assert.equal(folderShortName(" 询盘接待 "), "询盘");
  assert.equal(folderShortName("  Shop "), "Shop");
});

test("a short name set by the person wins and is kept short", () => {
  assert.equal(folderShortName("价目表", "价格"), "价格");
  assert.equal(folderShortName("询盘接待", "新客"), "新客");
  assert.equal(folderShortName("价目表", "价格表单"), "价格");
  assert.equal(folderShortName("价目表", "   "), "价目");
  assert.equal(folderShortName("价目表", undefined), "价目");
});
