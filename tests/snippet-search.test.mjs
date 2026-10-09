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
