// D-043: automatic backups keep each picture once (shared files named after a SHA-256 of their bytes), leave the
// thumbnails and the keys kept on this device only out, and still restore the files made before.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  AUTO_BACKUP_ERROR_KEY, autoBackupName, backupErrorMessage, backupFailureReason, backupFullSize, backupText, collectBackup, desktopStore,
  isImageFileName, readBackup, readBackupError, readBackupText, referencedImages, runAutoBackup, webStore,
} from "../app/auto-backup.ts";
import { applyPayload, collectPayload, countStoredImages, LOCAL_ONLY_KEYS, restoreStashedBackup, sealTransfer, transferFileParts } from "../app/data-transfer.ts";
import { fakeIndexedDB, fakeStorage } from "./helpers/fake-idb.mjs";

const day = (d) => new Date(2026, 9, d, 12, 0, 0);
const bytes = (...values) => Uint8Array.from(values).buffer;
const fileName = (buffer) => `${createHash("sha256").update(new Uint8Array(buffer)).digest("hex")}.bin`;
const PREMIGRATION = "clipbox.account-premigration.v1";

// A desktop backups folder in memory: day files and shared picture files, with the counts of what was written.
function memoryFolder() {
  const days = new Map();
  const images = new Map();
  const writes = { days: 0, images: 0, pruned: [] };
  const store = desktopStore({
    backupSave: async (name, data) => {
      writes.days += 1;
      days.set(name, new Uint8Array(data));
      for (const old of [...days.keys()].sort().reverse().slice(7)) days.delete(old);
    },
    backupList: async () => [...days].map(([name, data]) => ({ name, size: data.length })).sort((a, b) => b.name.localeCompare(a.name)),
    backupRead: async (name) => { if (!days.has(name)) throw new Error("missing"); return days.get(name); },
    backupImageSave: async (name, data) => { writes.images += 1; images.set(name, new Uint8Array(data)); },
    backupImageList: async () => [...images].map(([name, data]) => ({ name, size: data.length })),
    backupImageRead: async (name) => { if (!images.has(name)) throw new Error("missing"); return images.get(name); },
    backupImagePrune: async (keep) => { for (const name of [...images.keys()]) if (!keep.includes(name)) { images.delete(name); writes.pruned.push(name); } },
  });
  return { store, days, images, writes };
}

function pictures(...ids) {
  return {
    "clipbox-images": {
      meta: [{ id: "settings", salt: "s" }, ...ids.map((id) => ({ id, iv: "iv", ciphertext: `meta-${id}` }))],
      blobs: ids.map((id, index) => ({ id, iv: "iv", ciphertext: bytes(index + 1, 2, 3, 250) })),
    },
    "clipbox-image-thumbs": { thumbs: ids.map((id) => ({ id, bytes: bytes(9, 9), type: "image/webp" })) },
  };
}

test("the pre-migration copy and the last backup error never go into any backup; a restore drops the copy and keeps the error", async () => {
  assert.ok(LOCAL_ONLY_KEYS.has(PREMIGRATION));
  assert.ok(LOCAL_ONLY_KEYS.has(AUTO_BACKUP_ERROR_KEY));
  const storage = fakeStorage({ "clipbox.vault.v1": "V", [PREMIGRATION]: "device-key copy", [AUTO_BACKUP_ERROR_KEY]: "{}" });
  const full = await collectPayload(storage, fakeIndexedDB());
  assert.deepEqual(full.localStorage, { "clipbox.vault.v1": "V" });
  const auto = await collectBackup(undefined, storage, fakeIndexedDB());
  assert.deepEqual(auto.localStorage, { "clipbox.vault.v1": "V" });
  // The 完整备份 file seals the same settings.
  assert.ok(!(await sealTransfer(full, "long-enough")).ciphertext.includes("device-key"));

  // An older backup file that still carries a pre-migration copy restores without writing that copy back, and this device's
  // own copy goes too (it belongs to the data being replaced). The last backup error stays.
  const target = fakeStorage({ "clipbox.vault.v1": "NOW", [PREMIGRATION]: "this device's copy", [AUTO_BACKUP_ERROR_KEY]: "{}" });
  await applyPayload({ localStorage: { "clipbox.vault.v1": "OLD", [PREMIGRATION]: "old copy from the file" }, indexedDB: {} }, target, fakeIndexedDB());
  assert.deepEqual(target.snapshot(), { "clipbox.vault.v1": "OLD", [AUTO_BACKUP_ERROR_KEY]: "{}" });
  const fresh = fakeStorage();
  await applyPayload({ localStorage: { "clipbox.vault.v1": "OLD", [PREMIGRATION]: "old copy from the file" }, indexedDB: {} }, fresh, fakeIndexedDB());
  assert.deepEqual(fresh.snapshot(), { "clipbox.vault.v1": "OLD" });
});

test("the desktop backup writes each picture once, leaves thumbnails out, and restores them byte for byte", async () => {
  const idb = fakeIndexedDB(pictures("a", "b"));
  const storage = fakeStorage({ "clipbox.vault.v1": "V", "clipbox.device-key.v1": "K" });
  const folder = memoryFolder();
  const collect = (images) => collectBackup(images, storage, idb);
  assert.equal(await runAutoBackup(folder.store, true, day(1), collect, null), "saved");
  assert.equal(folder.writes.images, 2);
  assert.ok([...folder.images.keys()].every(isImageFileName));
  assert.deepEqual([...folder.images.keys()].sort(), [fileName(bytes(1, 2, 3, 250)), fileName(bytes(2, 2, 3, 250))].sort());

  const text = new TextDecoder().decode(folder.days.get(autoBackupName(day(1))));
  const file = JSON.parse(text);
  assert.equal(file.version, 2);
  assert.equal(file.imageBytes, 8);
  assert.ok(!text.includes("clipbox-image-thumbs"));
  assert.ok(!text.includes("$b64"), "no picture bytes inside the day file");
  assert.equal(await backupFullSize(folder.store, { name: autoBackupName(day(1)), size: 100 }), 108);

  // The next days write no picture again; a new picture is the only new file.
  assert.equal(await runAutoBackup(folder.store, true, day(2), collect, null), "saved");
  assert.equal(folder.writes.images, 2);
  idb.dbs.get("clipbox-images").get("meta").set("c", { id: "c", iv: "iv", ciphertext: "meta-c" });
  idb.dbs.get("clipbox-images").get("blobs").set("c", { id: "c", iv: "iv", ciphertext: bytes(7, 7, 7) });
  assert.equal(await runAutoBackup(folder.store, true, day(3), collect, null), "saved");
  assert.equal(folder.writes.images, 3);

  // Restoring day 1 into an empty place brings the pictures back exactly, and clears thumbnails so they are made again.
  const target = fakeIndexedDB({ "clipbox-image-thumbs": { thumbs: [{ id: "stale", bytes: bytes(1), type: "image/webp" }] } });
  const targetStorage = fakeStorage();
  await applyPayload(await readBackup(folder.store, autoBackupName(day(1))), targetStorage, target);
  const blobs = target.dbs.get("clipbox-images").get("blobs");
  assert.deepEqual([...blobs.keys()].sort(), ["a", "b"]);
  assert.deepEqual(new Uint8Array(blobs.get("b").ciphertext), new Uint8Array([2, 2, 3, 250]));
  assert.equal(target.dbs.get("clipbox-image-thumbs").get("thumbs").size, 0);
  assert.deepEqual(targetStorage.snapshot(), { "clipbox.vault.v1": "V", "clipbox.device-key.v1": "K" });
  assert.equal(await countStoredImages(target), 2);
});

test("picture files no kept day points at are removed, and only those", async () => {
  const idb = fakeIndexedDB(pictures("a"));
  const storage = fakeStorage({ "clipbox.vault.v1": "V" });
  const folder = memoryFolder();
  const collect = (images) => collectBackup(images, storage, idb);
  await runAutoBackup(folder.store, true, day(1), collect, null);
  const first = fileName(bytes(1, 2, 3, 250));
  // The picture is deleted on day 2: its file stays while day 1 is kept, and goes once day 1 is pruned.
  idb.dbs.get("clipbox-images").get("meta").delete("a");
  idb.dbs.get("clipbox-images").get("blobs").delete("a");
  for (let d = 2; d <= 7; d += 1) await runAutoBackup(folder.store, true, day(d), collect, null);
  assert.ok(folder.images.has(first));
  await runAutoBackup(folder.store, true, day(8), collect, null);
  assert.ok(!folder.days.has(autoBackupName(day(1))));
  assert.ok(!folder.images.has(first));
  assert.deepEqual(folder.writes.pruned, [first]);
});

test("a day file that cannot be read stops the tidying: nothing is removed", async () => {
  const idb = fakeIndexedDB(pictures("a"));
  const folder = memoryFolder();
  const collect = (images) => collectBackup(images, fakeStorage(), idb);
  await runAutoBackup(folder.store, true, day(1), collect, null);
  folder.days.set(autoBackupName(day(2)), new TextEncoder().encode("{broken"));
  idb.dbs.get("clipbox-images").get("blobs").clear();
  idb.dbs.get("clipbox-images").get("meta").clear();
  assert.equal(await runAutoBackup(folder.store, true, day(3), collect, null), "saved");
  assert.equal(folder.images.size, 1);
});

test("a missing or changed picture file stops the restore before anything is replaced", async () => {
  const idb = fakeIndexedDB(pictures("a"));
  const folder = memoryFolder();
  await runAutoBackup(folder.store, true, day(1), (images) => collectBackup(images, fakeStorage(), idb), null);
  const [name] = folder.images.keys();
  folder.images.set(name, new Uint8Array([1, 2, 3, 251]));
  await assert.rejects(readBackup(folder.store, autoBackupName(day(1))), /图片文件找不到或已损坏/);
  folder.images.delete(name);
  await assert.rejects(readBackup(folder.store, autoBackupName(day(1))), /图片文件找不到或已损坏/);
  // Without the picture commands (an older desktop shell) a version 2 file cannot be filled in either.
  const text = new TextDecoder().decode(folder.days.get(autoBackupName(day(1))));
  const plain = { list: async () => [], save: async () => {}, read: async () => text };
  await assert.rejects(readBackup(plain, "x"), /图片文件找不到或已损坏/);
});

test("files from before D-043 (pictures and thumbnails inside, version 1) still restore", async () => {
  const old = await collectPayload(fakeStorage({ "clipbox.vault.v1": "OLD" }), fakeIndexedDB(pictures("a")));
  const text = JSON.stringify({ format: "clipbox-auto-backup", version: 1, savedAt: 1, payload: old });
  const folder = memoryFolder();
  folder.days.set(autoBackupName(day(1)), new TextEncoder().encode(text));
  const target = fakeIndexedDB();
  const storage = fakeStorage();
  await applyPayload(await readBackup(folder.store, autoBackupName(day(1))), storage, target);
  assert.deepEqual(new Uint8Array(target.dbs.get("clipbox-images").get("blobs").get("a").ciphertext), new Uint8Array([1, 2, 3, 250]));
  assert.equal(target.dbs.get("clipbox-image-thumbs").get("thumbs").size, 1);
  assert.equal(storage.getItem("clipbox.vault.v1"), "OLD");
  // Picture files from a version 1 file are never asked for, so tidying keeps none for it.
  assert.equal(referencedImages(JSON.parse(text).payload).size, 0);
  assert.throws(() => readBackupText(JSON.stringify({ format: "clipbox-auto-backup", version: 3, payload: old })), /不是 Clipboxx 的备份文件/);
});

test("the browser trial keeps pictures inside its day file (version 1) and restores them", async () => {
  const idb = fakeIndexedDB(pictures("a"));
  const store = webStore(fakeStorage());
  assert.equal(await runAutoBackup(store, true, day(1), (images) => collectBackup(images, fakeStorage({ "clipbox.x": "1" }), idb), null), "saved");
  const text = await store.read(autoBackupName(day(1)));
  assert.equal(JSON.parse(text).version, 1);
  assert.ok(!text.includes("clipbox-image-thumbs"));
  const payload = await readBackup(store, autoBackupName(day(1)));
  const target = fakeIndexedDB();
  await applyPayload(payload, fakeStorage(), target);
  assert.deepEqual(new Uint8Array(target.dbs.get("clipbox-images").get("blobs").get("a").ciphertext), new Uint8Array([1, 2, 3, 250]));
});

test("a failed backup is remembered with a plain reason until the next one succeeds", async () => {
  const prefs = fakeStorage();
  const folder = memoryFolder();
  assert.equal(await runAutoBackup(folder.store, true, day(13), async () => { throw new Error("No space left on device (os error 28)"); }, prefs), "failed");
  assert.deepEqual(readBackupError(prefs), { at: day(13).getTime(), reason: "space" });
  assert.match(backupErrorMessage(readBackupError(prefs)), /最近一次自动备份没有成功（10月13日）：空间不够/);
  assert.equal(await runAutoBackup(folder.store, true, day(13), async () => { throw new Error("broken"); }, prefs), "failed");
  assert.equal(readBackupError(prefs).reason, "other");
  assert.equal(backupErrorMessage(readBackupError(prefs)), "最近一次自动备份没有成功（10月13日）。会自动再试，也可以用「完整备份」手动存一份。");
  assert.equal(await runAutoBackup(folder.store, true, day(13), async () => ({ localStorage: {}, indexedDB: {} }), prefs), "saved");
  assert.equal(readBackupError(prefs), null);
  for (const text of ["QuotaExceededError", "too-large", "RangeError Invalid string length", "There is not enough space on the disk. (os error 112)"]) {
    assert.equal(backupFailureReason(new Error(text)), "space", text);
  }
  assert.equal(backupFailureReason(new Error("name")), "other");
  assert.equal(readBackupError(fakeStorage({ [AUTO_BACKUP_ERROR_KEY]: "not json" })), null);
});

test("the 完整备份 file text is the same as before, in pieces", async () => {
  const sealed = await sealTransfer({ localStorage: { "clipbox.vault.v1": "V" }, indexedDB: {} }, "long-enough-pass", 5);
  assert.equal(transferFileParts(sealed).join(""), JSON.stringify(sealed));
});

test("the copy kept during a restore is stored as an object and still brings the old data back after a cut", async () => {
  const idb = fakeIndexedDB({ "clipbox-images": { meta: [{ id: "old1", iv: "a", ciphertext: "b" }], blobs: [] } });
  const storage = fakeStorage({ "clipbox.vault.v1": "OLD" });
  const copy = await collectPayload(storage, idb);
  const db = await new Promise((resolve) => { const r = idb.open("clipbox-import-backup"); r.onupgradeneeded = () => r.result.createObjectStore("backup"); r.onsuccess = () => resolve(r.result); });
  db.transaction("backup", "readwrite").objectStore("backup").put({ id: "last", payload: copy });
  storage.setItem("clipbox.vault.v1", "HALF-WRITTEN");
  assert.equal(await restoreStashedBackup(storage, idb), true);
  assert.equal(storage.getItem("clipbox.vault.v1"), "OLD");
});

test("backupText writes version 2 only when the file points at picture files", () => {
  const plain = { localStorage: { "clipbox.x": "1" }, indexedDB: {} };
  assert.equal(JSON.parse(backupText(plain, 1)).version, 1);
  const shared = { localStorage: {}, indexedDB: { "clipbox-images": { blobs: [{ id: "a", ciphertext: { $ref: `${"a".repeat(64)}.bin`, size: 3 } }] } } };
  assert.equal(JSON.parse(backupText(shared, 1)).version, 2);
  assert.deepEqual(readBackupText(backupText(shared, 1)), shared);
});
