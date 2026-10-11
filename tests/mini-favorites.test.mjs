import assert from "node:assert/strict";
import test from "node:test";
import { pickMiniFavorites } from "../app/mini-favorites.ts";

const item = (id, extra = {}) => ({ id, label: id, ...extra });

test("starred first, then by copy count, unused ones left out", () => {
  const items = [item("a", { useCount: 1 }), item("b", { pinned: true }), item("c", { useCount: 9 }), item("d"), item("e", { useCount: 3 })];
  assert.deepEqual(pickMiniFavorites(items).map((i) => i.id), ["b", "c", "e", "a"]);
});

test("falls back to last use and caps at the limit", () => {
  const items = [item("a", { lastUsedAt: 1 }), item("b", { lastUsedAt: 3 }), item("c", { lastUsedAt: 2 })];
  assert.deepEqual(pickMiniFavorites(items, 2).map((i) => i.id), ["b", "c"]);
});
