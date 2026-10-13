import assert from "node:assert/strict";
import test from "node:test";
import { searchSnippets } from "../app/snippet-search.ts";

const words = ["退款", "发货", "物流", "尺码", "颜色", "优惠", "售后", "换货", "包装", "质量", "客服", "订单", "地址", "快递", "时间", "说明"];
const pick = (i, k) => words[(i * 7 + k * 13) % words.length];
const ids = (list) => list.map((value) => value.id);

function syntheticSnippets(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    kind: "snippet",
    label: `${pick(i, 1)}${pick(i, 2)}${i}`,
    note: `${pick(i, 3)}提示${pick(i, 4)}`,
    summary: "",
    secret: `Reply ${i} about ${pick(i, 5)}`,
    color: "",
    folder: `${pick(i, 6)}目录`,
    snippetNumber: String(i + 1),
    useCount: i % 5,
    createdAt: 1,
    updatedAt: 1,
    snippetMeta: { chineseText: `${pick(i, 7)}${pick(i, 8)}的内容${i}`, usageNote: `${pick(i, 9)}用法`, stage: pick(i, 10) },
  }));
}

function timed(run) {
  const start = performance.now();
  const result = run();
  return { result, ms: performance.now() - start };
}

test("searching 3,000 snippets again is much faster and gives the same results", () => {
  // Warm up the pinyin library on other snippets so "cold" measures only per-snippet work.
  searchSnippets(syntheticSnippets(200).map((item) => ({ ...item, label: `预热${item.label}` })), "t");
  const items = syntheticSnippets(3000);
  const cold = timed(() => searchSnippets(items, "t"));
  const warm = timed(() => searchSnippets(items, "t"));
  assert.ok(cold.result.length > 0);
  assert.deepEqual(ids(warm.result), ids(cold.result));
  assert.ok(warm.ms < cold.ms * 0.3, `warm ${warm.ms.toFixed(1)} ms should be under 30% of cold ${cold.ms.toFixed(1)} ms`);
  // A different query on the same snippets reuses the work too.
  const other = timed(() => searchSnippets(items, "tk"));
  assert.ok(other.ms < cold.ms * 0.3, `second query ${other.ms.toFixed(1)} ms should be under 30% of cold ${cold.ms.toFixed(1)} ms`);
});

test("an edited snippet is found by its new text, not the old", () => {
  const original = { id: "a", kind: "snippet", label: "退款说明", secret: "old body", note: "", color: "", createdAt: 1, updatedAt: 1 };
  const other = { id: "b", kind: "snippet", label: "其他", secret: "", note: "", color: "", createdAt: 1, updatedAt: 1 };
  assert.deepEqual(ids(searchSnippets([original, other], "tk")), ["a"]);
  assert.deepEqual(ids(searchSnippets([original, other], "old")), ["a"]);

  const edited = { ...original, label: "发货时间", secret: "new body", updatedAt: 2 };
  const list = [edited, other];
  assert.deepEqual(ids(searchSnippets(list, "tk")), []);
  assert.deepEqual(ids(searchSnippets(list, "退款")), []);
  assert.deepEqual(ids(searchSnippets(list, "old")), []);
  assert.deepEqual(ids(searchSnippets(list, "fh")), ["a"]);
  assert.deepEqual(ids(searchSnippets(list, "fahuo")), ["a"]);
  assert.deepEqual(ids(searchSnippets(list, "new")), ["a"]);
  // The old object still matches its own text.
  assert.deepEqual(ids(searchSnippets([original], "tk")), ["a"]);
});

test("pinned and copy count changes on a new object still change the order", () => {
  const a = { id: "a", kind: "snippet", label: "退款一", secret: "", note: "", color: "", useCount: 5, createdAt: 1, updatedAt: 1 };
  const b = { id: "b", kind: "snippet", label: "退款二", secret: "", note: "", color: "", useCount: 1, createdAt: 1, updatedAt: 1 };
  assert.deepEqual(ids(searchSnippets([a, b], "tk")), ["a", "b"]);
  assert.deepEqual(ids(searchSnippets([a, { ...b, useCount: 9 }], "tk")), ["b", "a"]);
  assert.deepEqual(ids(searchSnippets([a, { ...b, pinned: true }], "tk")), ["b", "a"]);
});
