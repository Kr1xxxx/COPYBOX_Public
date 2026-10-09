import assert from "node:assert/strict";
import test from "node:test";
import { searchSnippets } from "../app/snippet-search.ts";

const item = (id, label, extra = {}) => ({ id, label, secret: "", note: "", color: "", kind: "snippet", createdAt: 1, updatedAt: 1, ...extra });
const ids = (list) => list.map((value) => value.id);

test("pinyin initials and full pinyin find Chinese titles", () => {
  const list = [item("a", "退款说明"), item("b", "发货时间")];
  assert.deepEqual(ids(searchSnippets(list, "tk")), ["a"]);
  assert.deepEqual(ids(searchSnippets(list, "tuikuan")), ["a"]);
  assert.deepEqual(ids(searchSnippets(list, "fh")), ["b"]);
});

test("title hit beats hint hit beats body hit", () => {
  const list = [
    item("body", "其他", { secret: "关于退款的内容" }),
    item("hint", "其他2", { note: "退款提示" }),
    item("title", "退款"),
  ];
  assert.deepEqual(ids(searchSnippets(list, "退款")), ["title", "hint", "body"]);
});

test("more copies rank first among equal hits; pinned stay on top", () => {
  const list = [
    item("a", "退款一", { useCount: 1 }),
    item("b", "退款二", { useCount: 9 }),
    item("c", "退款三", { pinned: true }),
  ];
  assert.deepEqual(ids(searchSnippets(list, "退款")), ["c", "b", "a"]);
});

test("every term must match and plain text still works", () => {
  const list = [item("a", "退款 Refund policy"), item("b", "退款")];
  assert.deepEqual(ids(searchSnippets(list, "tk refund")), ["a"]);
  assert.deepEqual(ids(searchSnippets(list, "zzz")), []);
});

test('literal "ok" ranks above pinyin "haokan"', () => {
  const list = [item("py", "好看的包装"), item("lit", "收到", { secret: "OK, 已收到" })];
  assert.deepEqual(ids(searchSnippets(list, "ok")), ["lit"]);
  const both = [item("py", "好看的包装"), item("lit", "收到", { secret: "OK, 已收到" }), item("t", "OK 确认")];
  assert.deepEqual(ids(searchSnippets(both, "ok")).slice(0, 2), ["t", "lit"]);
});

test('"an" does not match from the middle of a syllable', () => {
  const list = [item("a", "先发货"), item("b", "安排发货"), item("c", "Plan B")];
  const found = ids(searchSnippets(list, "an"));
  assert.ok(!found.includes("a"));
  assert.deepEqual(found, ["c", "b"]);
});

test("partial last syllable still matches (tuik → 退款)", () => {
  assert.deepEqual(ids(searchSnippets([item("a", "退款说明")], "tuik")), ["a"]);
  assert.deepEqual(ids(searchSnippets([item("a", "退款说明")], "kuan")), ["a"]);
  assert.deepEqual(ids(searchSnippets([item("a", "退款说明")], "uik")), []);
});

import { searchSnippetsEnglish } from "../app/snippet-search.ts";

test("English search looks at the English message by word, whole word first", () => {
  const list = [
    item("prefix", "甲", { secret: "Your refunded amount is ready" }),
    item("whole", "乙", { secret: "We will refund you today" }),
    item("zh", "refund 退款", { secret: "Hello there" }),
  ];
  assert.deepEqual(ids(searchSnippetsEnglish(list, "refund")), ["whole", "prefix"]);
  assert.deepEqual(ids(searchSnippetsEnglish(list, "ok")), []);
  assert.deepEqual(ids(searchSnippetsEnglish(list, "will today")), ["whole"]);
});

test("English search does not use pinyin", () => {
  assert.deepEqual(ids(searchSnippetsEnglish([item("a", "好看的包装", { secret: "Nice box" })], "haokan")), []);
});
