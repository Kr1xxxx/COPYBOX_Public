import assert from "node:assert/strict";
import test from "node:test";
import { openImageStore } from "../app/image-store.ts";
import { applyPayload, collectPayload } from "../app/data-transfer.ts";
import { quiesceWrites, reopenWrites, WritesClosedError } from "../app/write-gate.ts";
import { memoryIndexedDB, memoryStorage } from "./helpers/memory-idb.mjs";

const picture = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
test.afterEach(() => reopenWrites());

for (const separate of [false, true]) {
  test(`overlapping image edits preserve both changes (${separate ? "separate stores" : "same store"})`, async () => {
    const indexedDB = memoryIndexedDB();
    let time = 0;
    const first = await openImageStore("synthetic-key", { indexedDB, now: () => ++time });
    const image = await first.add(picture(), "Original");
    const second = separate ? await openImageStore("synthetic-key", { indexedDB, now: () => ++time }) : first;
    await Promise.all([first.rename(image.id, "Changed"), second.markUsed(image.id)]);
    const [saved] = await first.list();
    assert.equal(saved.title, "Changed");
    assert.ok(saved.lastUsedAt > image.createdAt);
    await first.createFolder("Products");
    await first.moveImage(image.id, "Products");
    await Promise.all([first.renameFolder("Products", "Renamed"), second.markUsed(image.id)]);
    assert.equal((await first.list())[0].folder, "Renamed");
    const results = await Promise.allSettled([first.remove(image.id), second.markUsed(image.id)]);
    assert.equal(results[1].status, "rejected");
    assert.deepEqual(await first.list(), []);
    // A failed write must not poison subsequent work on the shared queue.
    await first.add(picture(), "After failure");
    assert.equal((await first.list())[0].title, "After failure");
  });
}

test("every image mutation refuses writes after restore protection closes", async () => {
  const indexedDB = memoryIndexedDB();
  const store = await openImageStore("synthetic-key", { indexedDB });
  await store.createFolder("Products");
  const image = await store.add(picture(), "Original", "Products");
  const before = await collectPayload(memoryStorage(), indexedDB);
  await quiesceWrites();
  const writes = [
    () => store.add(picture(), "Late"), () => store.rename(image.id, "Late"),
    () => store.remove(image.id), () => store.trash(image.id), () => store.restore(image.id),
    () => store.markUsed(image.id), () => store.moveImage(image.id, null), () => store.setPinned(image.id, true),
    () => store.createFolder("Late"), () => store.renameFolder("Products", "Late"),
    () => store.reorderFolders("Products", "Products"), () => store.setFolderColor("Products", "red"),
    () => store.setFolderShortName("Products", "P"), () => store.deleteFolder("Products"),
  ];
  for (const write of writes) await assert.rejects(write(), WritesClosedError);
  assert.deepEqual(await collectPayload(memoryStorage(), indexedDB), before);
  reopenWrites();
  await store.rename(image.id, "Allowed again");
  assert.equal((await store.list())[0].title, "Allowed again");
});

test("a late old-key image write cannot corrupt a restored backup with another key", async () => {
  const sourceDB = memoryIndexedDB();
  const source = await openImageStore("synthetic-backup-key", { indexedDB: sourceDB });
  await source.add(picture(), "Restored image");
  const backup = await collectPayload(memoryStorage({ "clipbox.device-key.v1": "synthetic-backup-key" }), sourceDB);
  const targetDB = memoryIndexedDB();
  const old = await openImageStore("synthetic-old-key", { indexedDB: targetDB });
  await old.add(picture(), "Old image");
  await applyPayload(backup, memoryStorage(), targetDB);
  await assert.rejects(old.add(picture(), "Late old image"), WritesClosedError);
  const restored = await openImageStore("synthetic-backup-key", { indexedDB: targetDB });
  assert.deepEqual((await restored.list()).map((image) => image.title), ["Restored image"]);
});

test("restore waits for an in-flight image import and every queued edit", async () => {
  const store = await openImageStore("synthetic-key", { indexedDB: memoryIndexedDB() });
  const image = await store.add(picture(), "Original");
  const originalDecoder = globalThis.createImageBitmap;
  let release, signal;
  const held = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { signal = resolve; });
  globalThis.createImageBitmap = async () => { signal(); await held; return { width: 1, height: 1, close() {} }; };
  try {
    const adding = store.add(picture(), "Pending");
    await started;
    const renaming = store.rename(image.id, "Queued");
    let closed = false;
    const closing = quiesceWrites().then(() => { closed = true; });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(closed, false);
    release();
    await Promise.all([adding, renaming, closing]);
    assert.deepEqual((await store.list()).map((meta) => meta.title).sort(), ["Pending", "Queued"]);
  } finally { release(); globalThis.createImageBitmap = originalDecoder; }
});

test("a delayed thumbnail is displayed but not cached after the restore gate closes", async () => {
  const indexedDB = memoryIndexedDB();
  let release, signal;
  const held = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { signal = resolve; });
  const store = await openImageStore("synthetic-key", { indexedDB, makeThumb: async () => { signal(); await held; return picture(); } });
  const image = await store.add(picture(), "Original");
  const making = store.getThumb(image.id);
  await started;
  await quiesceWrites();
  release();
  assert.equal((await making).type, "image/png");
  assert.equal(indexedDB.dbs.get("clipbox-image-thumbs").get("thumbs").size, 0);
});
