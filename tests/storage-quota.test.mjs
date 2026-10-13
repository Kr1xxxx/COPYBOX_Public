// localStorage holds about 5 million characters per origin. When it is full, "please retry" never helps, so the
// person is told to empty the trash or delete things; when it is nearly full, they hear it once, early.
import assert from "node:assert/strict";
import test from "node:test";
import {
  attemptEditorSave,
  clipboxStorageChars,
  isQuotaError,
  isStorageNearlyFull,
  STORAGE_FULL_MESSAGE,
  STORAGE_NEARLY_FULL_MESSAGE,
  STORAGE_QUOTA_CHARS,
  storageUsageRatio,
} from "../app/clipbox-core.ts";
import { pageHarness, seed } from "./helpers/page-harness.mjs";
import { memoryStorage } from "./helpers/memory-idb.mjs";

test("the browser's storage-full error is recognised under its names and codes, and nothing else is", () => {
  assert.equal(isQuotaError(new DOMException("full", "QuotaExceededError")), true);
  assert.equal(isQuotaError({ name: "NS_ERROR_DOM_QUOTA_REACHED" }), true);
  assert.equal(isQuotaError({ name: "Error", code: 22 }), true);
  assert.equal(isQuotaError({ code: 1014 }), true);
  assert.equal(isQuotaError(new Error("save failed", { cause: new DOMException("full", "QuotaExceededError") })), true);
  assert.equal(isQuotaError(new Error("QuotaExceededError")), false, "only the message says so: not the real error");
  assert.equal(isQuotaError(new DOMException("gone", "NotFoundError")), false);
  assert.equal(isQuotaError(undefined), false);
  assert.equal(isQuotaError("QuotaExceededError"), false);
});

test("usage counts only Clipbox's own entries, keys included", () => {
  const storage = memoryStorage({ "clipbox.vault.v1": "x".repeat(100), "clipbox.theme": "dark", "other.app": "y".repeat(1000) });
  assert.equal(clipboxStorageChars(storage), "clipbox.vault.v1".length + 100 + "clipbox.theme".length + 4);
  assert.equal(storageUsageRatio(STORAGE_QUOTA_CHARS / 2), 0.5);
  assert.equal(storageUsageRatio(10, 0), 1);
});

test("nearly full means more than 85% of 5,000,000 characters", () => {
  const filler = (chars) => memoryStorage({ "clipbox.vault.v1": "x".repeat(chars - "clipbox.vault.v1".length) });
  assert.equal(isStorageNearlyFull(filler(4_250_000)), false);
  assert.equal(isStorageNearlyFull(filler(4_250_001)), true);
});

test("saving in the editor when storage is full says what to do instead of 'retry'", async () => {
  assert.deepEqual(await attemptEditorSave(async () => { throw new DOMException("full", "QuotaExceededError"); }), { saved: false, error: STORAGE_FULL_MESSAGE });
  assert.deepEqual(await attemptEditorSave(async () => { throw new Error("other"); }), { saved: false, error: "保存失败，当前内容仍保留，请重试" });
  assert.equal(STORAGE_FULL_MESSAGE, "存储空间满了，请清空回收站或删掉不用的内容");
});

test("after a save that leaves storage nearly full, the warning shows once per session", async () => {
  const h = await pageHarness();
  const data = await seed(h);
  const toasts = [];
  h.c.setToast = (message) => { if (message) toasts.push(message); };
  h.c.window.setTimeout = (callback, ms) => { if (!ms) callback(); return 1; };
  Object.defineProperty(h.c.localStorage, "length", { get: () => h.storage.size });
  h.c.localStorage.key = (index) => [...h.storage.keys()][index] ?? null;
  await h.c.storeVault(data);
  assert.deepEqual(toasts, [], "plenty of room: no warning");
  h.storage.set("clipbox.filler", "x".repeat(4_300_000));
  await h.c.storeVault(data);
  await h.c.storeVault(data);
  assert.deepEqual(toasts, [STORAGE_NEARLY_FULL_MESSAGE]);
  assert.equal(STORAGE_NEARLY_FULL_MESSAGE, "存储空间快满了，请清空回收站或删掉不用的内容");
});
