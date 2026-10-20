import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPayload, hasStashedBackup, restoreStashedBackup, base64ToBytes, countImages, bytesToBase64, collectPayload, countPayload, decodeValue, encodeValue,
  openTransfer, parseTransferFile, sealTransfer,
} from "../app/data-transfer.ts";

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key),
    snapshot: () => Object.fromEntries(map),
  };
}

// Just enough IndexedDB for data-transfer.ts: open / stores / getAll / clear / put / transaction completion.
function fakeIndexedDB(seed = {}, { failPutIn } = {}) {
  const dbs = new Map(Object.entries(seed).map(([name, stores]) => [name, new Map(Object.entries(stores).map(([s, rows]) => [s, new Map(rows.map((r) => [r.id, structuredClone(r)]))]))]));
  const later = (fn) => setTimeout(fn, 0);
  const request = (run) => {
    const req = { result: undefined, error: null, onsuccess: null, onerror: null };
    later(() => { req.result = run(); req.onsuccess?.(); });
    return req;
  };
  return {
    dbs,
    databases: async () => [...dbs.keys()].map((name) => ({ name })),
    open(name) {
      const req = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      later(() => {
        const isNew = !dbs.has(name);
        if (isNew) dbs.set(name, new Map());
        const stores = dbs.get(name);
        req.result = {
          objectStoreNames: Object.assign([...stores.keys()], { contains: (s) => stores.has(s) }),
          createObjectStore: (s) => void stores.set(s, new Map()),
          close() {},
          transaction(names) {
            const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
            let pending = 0;
            const settle = () => later(() => { if (pending === 0) tx.oncomplete?.(); });
            tx.objectStore = (s) => ({
              getAll: () => { pending += 1; return request(() => { pending -= 1; return [...stores.get(s).values()].map((r) => structuredClone(r)); }); },
              clear: () => void stores.get(s).clear(),
              put: (row) => {
                if (failPutIn === name && !tx.rolledBack) throw new Error("QuotaExceededError");
                stores.get(s).set(row.id, structuredClone(row));
              },
            });
            void names;
            settle();
            return tx;
          },
        };
        if (isNew) {
          // Refresh the visible store list after the upgrade callback creates stores.
          req.onupgradeneeded?.();
          req.result.objectStoreNames = Object.assign([...stores.keys()], { contains: (s) => stores.has(s) });
        }
        req.onsuccess?.();
      });
      return req;
    },
  };
}

test("binary values survive encode/decode", () => {
  const buffer = Uint8Array.from([0, 1, 2, 250, 255]).buffer;
  const wire = encodeValue({ id: "a", bytes: buffer, nested: [{ view: new Uint8Array([9, 8]) }], n: 3, ok: true, none: undefined });
  assert.deepEqual(JSON.parse(JSON.stringify(wire)).bytes, { $b64: "AAEC+v8=" });
  const back = decodeValue(JSON.parse(JSON.stringify(wire)));
  assert.deepEqual(new Uint8Array(back.bytes), new Uint8Array([0, 1, 2, 250, 255]));
  assert.deepEqual(new Uint8Array(back.nested[0].view), new Uint8Array([9, 8]));
  assert.equal(back.none, null);
  assert.throws(() => encodeValue({ f: () => 1 }));
});

test("base64 handles large buffers", () => {
  const big = new Uint8Array(100_000).map((_, i) => i % 251);
  assert.deepEqual(base64ToBytes(bytesToBase64(big)), big);
});

test("the file is sealed with the password and nothing readable leaks", async () => {
  const payload = { localStorage: { "clipbox.vault.v1": "秘密-话术" }, indexedDB: {} };
  const file = await sealTransfer(payload, "correct horse battery", 1234);
  assert.equal(file.createdAt, 1234);
  assert.ok(!JSON.stringify(file).includes("话术"));
  assert.deepEqual(await openTransfer(parseTransferFile(JSON.stringify(file)), "correct horse battery"), payload);
  await assert.rejects(openTransfer(file, "wrong password"), /密码不对/);
  const tampered = { ...file, ciphertext: bytesToBase64(Uint8Array.from(base64ToBytes(file.ciphertext), (b, i) => (i === 3 ? b ^ 1 : b))) };
  await assert.rejects(openTransfer(tampered, "correct horse battery"), /密码不对/);
});

test("bad files get plain Chinese errors", () => {
  assert.throws(() => parseTransferFile("not json"), /不是完整备份文件/);
  assert.throws(() => parseTransferFile(JSON.stringify({ format: "clipbox-secure-backup" })), /不是完整备份文件/);
  assert.throws(() => parseTransferFile(JSON.stringify({ format: "clipbox-data-move", version: 9, salt: "", iv: "", ciphertext: "", iterations: 1 })), /版本太新/);
  assert.throws(() => parseTransferFile(JSON.stringify({ format: "clipbox-data-move", version: 1 })), /已损坏/);
});

test("collect takes only clipbox keys and never the plain-text web AI key", async () => {
  const storage = fakeStorage({ "clipbox.vault.v1": "V", "clipbox.theme": "dark", "clipbox.ai-key.web.v1": "secret", other: "x" });
  const payload = await collectPayload(storage, fakeIndexedDB());
  assert.deepEqual(payload.localStorage, { "clipbox.vault.v1": "V", "clipbox.theme": "dark" });
});

test("full round trip: Electron-side data lands intact in a fresh store", async () => {
  const bytes = Uint8Array.from([5, 6, 7, 200]).buffer;
  const oldIdb = fakeIndexedDB({
    "clipbox-images": { meta: [{ id: "settings", salt: "s" }, { id: "i1", iv: "iv", ciphertext: "ct" }], blobs: [{ id: "i1", iv: "iv", ciphertext: bytes }] },
    "clipbox-image-thumbs": { thumbs: [{ id: "i1", bytes, type: "image/jpeg" }] },
  });
  const oldStorage = fakeStorage({ "clipbox.vault.v1": "ENVELOPE", "clipbox.device-key.v1": "KEY", "clipbox.totp.v1": "T" });
  const payload = await collectPayload(oldStorage, oldIdb);
  assert.deepEqual(countPayload(payload), { settings: 3, records: 4 });

  const file = await sealTransfer(payload, "move-me-1234");
  const opened = await openTransfer(parseTransferFile(JSON.stringify(file)), "move-me-1234");

  const newStorage = fakeStorage({ "clipbox.vault.v1": "NEWER-EMPTY", "clipbox.theme": "dark", "clipbox.leftover": "x", unrelated: "keep" });
  const newIdb = fakeIndexedDB({ "clipbox-images": { meta: [{ id: "stale", iv: "", ciphertext: "" }], blobs: [] } });
  await applyPayload(opened, newStorage, newIdb);

  assert.deepEqual(newStorage.snapshot(), { "clipbox.vault.v1": "ENVELOPE", "clipbox.device-key.v1": "KEY", "clipbox.totp.v1": "T", unrelated: "keep" });
  const images = newIdb.dbs.get("clipbox-images");
  assert.deepEqual([...images.get("meta").keys()].sort(), ["i1", "settings"]);
  assert.deepEqual(new Uint8Array(images.get("blobs").get("i1").ciphertext), new Uint8Array([5, 6, 7, 200]));
  const thumbs = newIdb.dbs.get("clipbox-image-thumbs").get("thumbs").get("i1");
  assert.equal(thumbs.type, "image/jpeg");
});

test("a payload with foreign keys or databases is refused before anything is written", async () => {
  const storage = fakeStorage({ "clipbox.vault.v1": "KEEP" });
  const idb = fakeIndexedDB();
  await assert.rejects(applyPayload({ localStorage: { "evil.key": "x" }, indexedDB: {} }, storage, idb), /文件内容不对/);
  await assert.rejects(applyPayload({ localStorage: {}, indexedDB: { "other-db": {} } }, storage, idb), /文件内容不对/);
  await assert.rejects(applyPayload({ localStorage: { "clipbox.ai-key.web.v1": "x" }, indexedDB: {} }, storage, idb), /文件内容不对/);
  assert.deepEqual(storage.snapshot(), { "clipbox.vault.v1": "KEEP" });
  assert.equal(idb.dbs.size, 0);
});

test("restoring a backup without image databases removes existing pictures and thumbnails", async () => {
  const idb = fakeIndexedDB({
    "clipbox-images": { meta: [{ id: "settings" }, { id: "old-picture" }], blobs: [{ id: "old-picture" }] },
    "clipbox-image-thumbs": { thumbs: [{ id: "old-picture" }] },
  });
  const storage = fakeStorage({ "clipbox.device-key.v1": "current-key" });
  await applyPayload({ localStorage: { "clipbox.device-key.v1": "backup-key" }, indexedDB: {} }, storage, idb);
  assert.equal(countImages(await collectPayload(storage, idb)), 0);
  for (const name of ["clipbox-images", "clipbox-image-thumbs"]) for (const rows of idb.dbs.get(name).values()) assert.equal(rows.size, 0);
  assert.equal(storage.getItem("clipbox.device-key.v1"), "backup-key");
});

test("a missing table in a backup is cleared rather than retaining its previous rows", async () => {
  const idb = fakeIndexedDB({ "clipbox-images": { meta: [{ id: "old" }], blobs: [{ id: "old" }] } });
  const storage = fakeStorage();
  await applyPayload({ localStorage: {}, indexedDB: { "clipbox-images": { meta: [] } } }, storage, idb);
  assert.equal(idb.dbs.get("clipbox-images").get("blobs").size, 0);
});

test("rollback to a backup without images clears pictures created by the failed import", async () => {
  const idb = fakeIndexedDB();
  const storage = fakeStorage({ "clipbox.device-key.v1": "old-key" });
  const set = storage.setItem;
  let fail = true;
  storage.setItem = (key, value) => { if (fail) { fail = false; throw new Error("disk full"); } set(key, value); };
  await assert.rejects(() => applyPayload({ localStorage: { "clipbox.device-key.v1": "new-key" }, indexedDB: {
    "clipbox-images": { meta: [{ id: "new" }], blobs: [{ id: "new" }] },
    "clipbox-image-thumbs": { thumbs: [{ id: "new" }] },
  } }, storage, idb), /原样保留/);
  assert.equal(countImages(await collectPayload(storage, idb)), 0);
  assert.equal(idb.dbs.get("clipbox-image-thumbs").get("thumbs").size, 0);
  assert.equal(storage.getItem("clipbox.device-key.v1"), "old-key");
});

test("a failure half-way puts the old data back (images and settings)", async () => {
  const oldImages = { "clipbox-images": { meta: [{ id: "settings", salt: "s" }, { id: "old1", iv: "a", ciphertext: "b" }, { id: "old2", iv: "a", ciphertext: "b" }], blobs: [{ id: "old1", iv: "a", ciphertext: Uint8Array.from([1]).buffer }] } };
  const payload = {
    localStorage: { "clipbox.vault.v1": "NEW" },
    indexedDB: { "clipbox-images": { meta: [{ id: "new1", iv: "a", ciphertext: "b" }], blobs: [] }, "clipbox-image-thumbs": { thumbs: [{ id: "new1", bytes: Uint8Array.from([2]).buffer, type: "image/png" }] } },
  };
  // Disk full while writing the second database: the first one is already replaced by then.
  const idb = fakeIndexedDB({ ...oldImages, "clipbox-image-thumbs": { thumbs: [] } }, { failPutIn: "clipbox-image-thumbs" });
  const storage = fakeStorage({ "clipbox.vault.v1": "OLD", "clipbox.device-key.v1": "K" });
  await assert.rejects(applyPayload(payload, storage, idb), /现有内容已经原样保留/);
  assert.deepEqual(storage.snapshot(), { "clipbox.vault.v1": "OLD", "clipbox.device-key.v1": "K" });
  assert.deepEqual([...idb.dbs.get("clipbox-images").get("meta").keys()].sort(), ["old1", "old2", "settings"]);
  assert.equal(idb.dbs.get("clipbox-images").get("blobs").size, 1);
});

test("a failing settings write also rolls the images back", async () => {
  const idb = fakeIndexedDB({ "clipbox-images": { meta: [{ id: "old1", iv: "a", ciphertext: "b" }], blobs: [] } });
  const storage = fakeStorage({ "clipbox.vault.v1": "OLD" });
  const real = storage.setItem;
  let failures = 1;
  storage.setItem = (key, value) => { if (failures-- > 0) throw new Error("QuotaExceededError"); real(key, value); };
  const payload = { localStorage: { "clipbox.vault.v1": "NEW" }, indexedDB: { "clipbox-images": { meta: [{ id: "new1", iv: "a", ciphertext: "b" }], blobs: [] } } };
  await assert.rejects(applyPayload(payload, storage, idb), /原样保留/);
  assert.equal(storage.getItem("clipbox.vault.v1"), "OLD");
  assert.deepEqual([...idb.dbs.get("clipbox-images").get("meta").keys()], ["old1"]);
});

test("image counts ignore the two bookkeeping rows", () => {
  const payload = { localStorage: {}, indexedDB: { "clipbox-images": { meta: [{ id: "settings" }, { id: "folders" }, { id: "a" }, { id: "b" }], blobs: [] } } };
  assert.equal(countImages(payload), 2);
  assert.equal(countImages({ localStorage: {}, indexedDB: {} }), 0);
});

test("new files use 600000 PBKDF2 rounds", async () => {
  assert.equal((await sealTransfer({ localStorage: {}, indexedDB: {} }, "long-enough-pass")).iterations, 600_000);
});

test("a copy of the old data is kept on disk during the import and removed after it", async () => {
  const idb = fakeIndexedDB({ "clipbox-images": { meta: [{ id: "old1", iv: "a", ciphertext: "b" }], blobs: [] } });
  const storage = fakeStorage({ "clipbox.vault.v1": "OLD" });
  assert.equal(await hasStashedBackup(idb), false);
  await applyPayload({ localStorage: { "clipbox.vault.v1": "NEW" }, indexedDB: {} }, storage, idb);
  assert.equal(storage.getItem("clipbox.vault.v1"), "NEW");
  assert.equal(await hasStashedBackup(idb), false);
});

test("after a power cut mid-import the leftover copy brings the old data back", async () => {
  const idb = fakeIndexedDB({ "clipbox-images": { meta: [{ id: "old1", iv: "a", ciphertext: "b" }], blobs: [] } });
  const storage = fakeStorage({ "clipbox.vault.v1": "OLD" });
  // Model the cut: the copy was written to disk, then the images were replaced and the settings half-written.
  const copy = await collectPayload(storage, idb);
  const db = await new Promise((resolve) => { const r = idb.open("clipbox-import-backup"); r.onupgradeneeded = () => r.result.createObjectStore("backup"); r.onsuccess = () => resolve(r.result); });
  const tx = db.transaction("backup", "readwrite");
  tx.objectStore("backup").put({ id: "last", json: JSON.stringify(copy) });
  idb.dbs.get("clipbox-images").get("meta").clear();
  storage.setItem("clipbox.vault.v1", "HALF-WRITTEN");
  assert.equal(await hasStashedBackup(idb), true);
  assert.equal(await restoreStashedBackup(storage, idb), true);
  assert.equal(storage.getItem("clipbox.vault.v1"), "OLD");
  assert.deepEqual([...idb.dbs.get("clipbox-images").get("meta").keys()], ["old1"]);
  assert.equal(await hasStashedBackup(idb), false);
  assert.equal(await restoreStashedBackup(storage, idb), false);
});

test("restoring a backup keeps this computer signed in but forgets the last sync (D-096)", async () => {
  const idb = fakeIndexedDB();
  const storage = fakeStorage({ "clipbox.vault.v1": "OLD", "clipbox.cloud-account.v1": '{"email":"me@example.com"}', "clipbox.cloud-session.v1": "TOKEN", "clipbox.cloud-sync-base.v1": "BASE" });
  // A backup made on another computer may carry its own sign-in; it never replaces this one.
  await applyPayload({ localStorage: { "clipbox.vault.v1": "NEW", "clipbox.cloud-session.v1": "OTHER" }, indexedDB: {} }, storage, idb);
  assert.equal(storage.getItem("clipbox.vault.v1"), "NEW");
  assert.equal(storage.getItem("clipbox.cloud-account.v1"), '{"email":"me@example.com"}');
  assert.equal(storage.getItem("clipbox.cloud-session.v1"), "TOKEN");
  assert.equal(storage.getItem("clipbox.cloud-sync-base.v1"), null);
});
