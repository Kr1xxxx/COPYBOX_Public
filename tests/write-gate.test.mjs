// Restoring a backup replaces the device key and the vault. A save from the page landing afterwards would write the
// old data with the old key over it, so the restore first finishes every pending save and then closes a gate: the
// vault and the 账号 stores refuse to write until the page reloads, or until a failed restore has put the old data back.
// Quitting waits for the same things (the 账号 queues and image writes) before the page answers the app.
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { applyPayload } from "../app/data-transfer.ts";
import { openImageStore, waitForImageWrites } from "../app/image-store.ts";
import { openSecretItemsStore, SECRET_ITEMS_KEY } from "../app/secret-items-store.ts";
import { drainAll, serialFor } from "../app/store-queue.ts";
import { onQuiesce, quiesceWrites, reopenWrites, writesClosed, WritesClosedError } from "../app/write-gate.ts";
import { pageHarness, seed } from "./helpers/page-harness.mjs";
import { memoryIndexedDB, memoryStorage } from "./helpers/memory-idb.mjs";

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

test.afterEach(() => reopenWrites());

test("drainAll waits for every store queue, including work added while it waits", async () => {
  const storage = {};
  const done = [];
  const first = serialFor(storage, "a");
  const second = serialFor(storage, "b");
  void first(async () => { await tick(20); done.push("a1"); first(async () => { await tick(10); done.push("a2"); }); });
  void second(async () => { await tick(5); throw new Error("a failed task still counts as finished"); }).catch(() => undefined);
  await drainAll();
  assert.deepEqual(done, ["a1", "a2"]);
  await drainAll(); // nothing waiting: resolves at once
});

test("waitForImageWrites resolves only after an image write under way has finished", async () => {
  const store = await openImageStore("device-key", { indexedDB: memoryIndexedDB(), makeThumb: async () => null });
  let finished = false;
  const adding = store.add(new Blob([Uint8Array.from([137, 80, 78, 71])], { type: "image/png" }), "图").then(() => { finished = true; });
  await waitForImageWrites();
  assert.equal(finished, true);
  await adding;
  assert.equal((await store.list()).length, 1);
});

test("quiesce runs the page's hooks while saving is still allowed, then closes; a failing hook does not stop it", async () => {
  const seen = [];
  const removeA = onQuiesce(async () => { await tick(10); seen.push(["slow", writesClosed()]); });
  const removeB = onQuiesce(() => { throw new Error("hook failed"); });
  try {
    await quiesceWrites();
  } finally {
    removeA();
    removeB();
  }
  assert.deepEqual(seen, [["slow", false]]);
  assert.equal(writesClosed(), true);
  reopenWrites();
  assert.equal(writesClosed(), false);
});

test("while the gate is closed the vault is not written, and a save already under way is dropped before it writes", async () => {
  const h = await pageHarness();
  const data = await seed(h);
  const before = h.storage.get("vault");
  const subtle = webcrypto.subtle;
  const encrypt = subtle.encrypt;
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let started = false;
  subtle.encrypt = async function (...args) { started = true; await held; return encrypt.apply(this, args); };
  try {
    const saving = h.c.storeVault({ ...data, items: [] });
    while (!started) await tick(1);
    await quiesceWrites();
    release();
    await assert.rejects(saving, WritesClosedError);
    assert.equal(h.storage.get("vault"), before);
    await assert.rejects(h.c.persist((current) => ({ ...current, items: [] })), /正在从备份恢复/);
    assert.equal(h.storage.get("vault"), before);
  } finally {
    subtle.encrypt = encrypt;
  }
  reopenWrites();
  await h.c.persist((current) => ({ ...current, items: [] }));
  assert.notEqual(h.storage.get("vault"), before);
});

test("while the gate is closed the 账号 stores do not write either", async () => {
  const storage = memoryStorage();
  const store = openSecretItemsStore("device-key", storage);
  await store.put({ id: "a" });
  const before = storage.getItem(SECRET_ITEMS_KEY);
  await quiesceWrites();
  await assert.rejects(store.put({ id: "b" }), WritesClosedError);
  assert.equal(storage.getItem(SECRET_ITEMS_KEY), before);
  reopenWrites();
  await store.put({ id: "b" });
  assert.deepEqual((await store.list()).map((item) => item.id), ["a", "b"]);
});

const payload = { localStorage: { "clipbox.vault.v1": "RESTORED", "clipbox.device-key.v1": "K2" }, indexedDB: {} };

test("a restore saves what is pending first, then writes the backup, and stays closed until the page reloads", async () => {
  const storage = memoryStorage({ "clipbox.vault.v1": "OLD", "clipbox.device-key.v1": "K1" });
  // the page's delayed save, still waiting when the restore starts
  const remove = onQuiesce(async () => { await tick(15); storage.setItem("clipbox.vault.v1", "PENDING"); });
  try {
    await applyPayload(payload, storage, memoryIndexedDB());
  } finally {
    remove();
  }
  assert.deepEqual(storage.snapshot(), { "clipbox.vault.v1": "RESTORED", "clipbox.device-key.v1": "K2" });
  assert.equal(writesClosed(), true);
});

test("a restore that fails and puts the old data back opens the gate again", async () => {
  const storage = memoryStorage({ "clipbox.vault.v1": "OLD" });
  const setItem = storage.setItem;
  let failures = 1;
  storage.setItem = (key, value) => { if (failures-- > 0) throw new DOMException("full", "QuotaExceededError"); setItem(key, value); };
  await assert.rejects(applyPayload(payload, storage, memoryIndexedDB()), /原样保留/);
  assert.equal(storage.getItem("clipbox.vault.v1"), "OLD");
  assert.equal(writesClosed(), false);
});

test("a restore that cannot copy the current data first changes nothing and leaves saving open", async () => {
  const broken = { databases: async () => [], open: () => { throw new Error("no database"); } };
  await assert.rejects(applyPayload(payload, memoryStorage({ "clipbox.vault.v1": "OLD" }), broken), /没能先备份/);
  assert.equal(writesClosed(), false);
});

test("a malformed backup is refused before the gate closes", async () => {
  await assert.rejects(applyPayload({ localStorage: { "other.key": "x" }, indexedDB: {} }, memoryStorage(), memoryIndexedDB()), /文件内容不对/);
  assert.equal(writesClosed(), false);
});
