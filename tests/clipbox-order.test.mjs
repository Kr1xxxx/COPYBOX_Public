import assert from "node:assert/strict";
import test from "node:test";
import {
  canReorderCards,
  formatSnippetNumber,
  moveName,
  moveVisibleItem,
  normalizeSnippetNumbers,
  reorderNames,
  reorderVisibleItems,
} from "../app/clipbox-order.ts";

const snippet = (id, snippetNumber, overrides = {}) => ({
  id,
  label: id,
  secret: "hello",
  note: "",
  color: "#fff",
  kind: "snippet",
  snippetNumber,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

test("assigns stable unique numbers and advances past existing numbers", () => {
  const result = normalizeSnippetNumbers([
    snippet("a", "CB-0007"),
    snippet("b"),
    snippet("c", "CB-0007"),
  ], 4);

  assert.deepEqual(result.items.map((item) => item.snippetNumber), ["CB-0007", "CB-0008", "CB-0009"]);
  assert.equal(result.nextSnippetNumber, 10);
});

test("never moves the counter backward after the highest item was deleted", () => {
  const result = normalizeSnippetNumbers([snippet("a", "CB-0002")], 12);
  assert.equal(result.nextSnippetNumber, 12);
});

test("does not number secret items", () => {
  const secret = { ...snippet("secret"), kind: "secret" };
  assert.equal(normalizeSnippetNumbers([secret], 1).items[0].snippetNumber, undefined);
});

test("formats sequences with four digits and grows naturally", () => {
  assert.equal(formatSnippetNumber(1), "CB-0001");
  assert.equal(formatSnippetNumber(12345), "CB-12345");
});

test("reorderVisibleItems changes visible slots without moving hidden items", () => {
  const items = [snippet("a"), snippet("hidden-1"), snippet("b"), snippet("hidden-2"), snippet("c")];

  assert.deepEqual(
    reorderVisibleItems(items, ["a", "b", "c"], "c", "a").map((item) => item.id),
    ["c", "hidden-1", "a", "hidden-2", "b"],
  );
});

test("reorderVisibleItems refuses to cross the pinned boundary", () => {
  const items = [snippet("a", undefined, { pinned: true }), snippet("b")];

  assert.equal(reorderVisibleItems(items, ["a", "b"], "a", "b"), items);
});

test("moveVisibleItem moves within its visible pinned group and stops at boundaries", () => {
  const items = [
    snippet("pinned", undefined, { pinned: true }),
    snippet("a"),
    snippet("hidden"),
    snippet("b"),
  ];

  assert.deepEqual(
    moveVisibleItem(items, ["pinned", "a", "b"], "b", -1).map((item) => item.id),
    ["pinned", "b", "hidden", "a"],
  );
  assert.equal(moveVisibleItem(items, ["pinned", "a", "b"], "pinned", -1), items);
});

test("reorderNames and moveName preserve explicit directory order", () => {
  const names = ["售后", "报价", "物流"];

  assert.deepEqual(reorderNames(names, "物流", "售后"), ["物流", "售后", "报价"]);
  assert.deepEqual(moveName(names, "报价", 1), ["售后", "物流", "报价"]);
  assert.equal(moveName(names, "售后", -1), names);
});

test("card reordering stays available for the visible product-filtered cards", () => {
  assert.equal(canReorderCards("", "全部产品"), true);
  assert.equal(canReorderCards("  ", "全部产品"), true);
  assert.equal(canReorderCards("报价", "全部产品"), false);
  assert.equal(canReorderCards("", "睫毛"), true);
});
