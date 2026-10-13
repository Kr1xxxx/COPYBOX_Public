// 撤销 in the toast after a save: an edit goes back to the earlier version, a new entry disappears again, and a change
// made after the save is never overwritten.
import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_FOLDER_REGISTRY, undoItemSave, unchangedSinceSave } from "../app/clipbox-core.ts";

const base = (overrides = {}) => ({ id: "a", label: "退款说明", secret: "Refund in 3 days", note: "", color: "#fff", kind: "snippet", folder: "售后", snippetNumber: "H-0001", createdAt: 1, updatedAt: 1, ...overrides });
const vault = (items, nextSnippetNumber = 2) => ({ items, folders: EMPTY_FOLDER_REGISTRY, nextSnippetNumber });

test("an edit is undone: every field returns, the place in the list stays", () => {
  const before = base({ pinned: true });
  const after = base({ label: "退款说明（新）", secret: "Refund in 5 days", folder: "售前", pinned: true, updatedAt: 9 });
  const other = base({ id: "b", label: "别的", snippetNumber: "H-0002" });
  const undone = undoItemSave(vault([other, after]), { before, after, nextBefore: 3, nextAfter: 3 });
  assert.deepEqual(undone.items, [other, before]);
});

test("copying after the save does not block undo, and the use count is kept", () => {
  const before = base();
  const after = base({ label: "新标题", updatedAt: 9 });
  const copied = { ...after, lastUsedAt: 50, useCount: 4 };
  assert.equal(unchangedSinceSave(copied, after), true);
  const undone = undoItemSave(vault([copied]), { before, after, nextBefore: 2, nextAfter: 2 });
  assert.deepEqual(undone.items, [{ ...before, lastUsedAt: 50, useCount: 4 }]);
});

test("a new entry is removed outright, not sent to the 回收站, and its number is handed out again", () => {
  const after = base({ id: "new", snippetNumber: "H-0002", createdAt: 9, updatedAt: 9 });
  const old = base();
  const undone = undoItemSave(vault([after, old], 3), { before: null, after, nextBefore: 2, nextAfter: 3 });
  assert.deepEqual(undone.items, [old]);
  assert.equal(undone.nextSnippetNumber, 2);
  // Another entry was numbered after it: the counter stays where it is.
  const later = base({ id: "later", snippetNumber: "H-0003" });
  assert.equal(undoItemSave(vault([later, after, old], 4), { before: null, after, nextBefore: 2, nextAfter: 3 }).nextSnippetNumber, 4);
});

test("a change after the save makes undo refuse", () => {
  const before = base();
  const after = base({ label: "新标题", updatedAt: 9 });
  const record = { before, after, nextBefore: 2, nextAfter: 2 };
  assert.equal(undoItemSave(vault([{ ...after, label: "又改了", updatedAt: 12 }]), record), null, "edited again");
  assert.equal(undoItemSave(vault([{ ...after, pinned: true }]), record), null, "pinned");
  assert.equal(undoItemSave(vault([{ ...after, folder: "售前", updatedAt: 12 }]), record), null, "moved");
  assert.equal(undoItemSave(vault([{ ...after, deletedAt: 12 }]), record), null, "in the 回收站");
  assert.equal(undoItemSave(vault([]), record), null, "removed");
  assert.equal(undoItemSave(vault([{ ...after, deletedAt: 12 }]), { ...record, before: null }), null, "a new entry already in the 回收站");
});

test("the same fields in another order still count as unchanged", () => {
  const after = base({ label: "新标题" });
  const reordered = Object.fromEntries(Object.entries(after).reverse());
  assert.equal(unchangedSinceSave(reordered, after), true);
  assert.equal(unchangedSinceSave(undefined, after), false);
});
