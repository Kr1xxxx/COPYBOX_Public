import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPayload, base64ToBytes, bytesToBase64, collectPayload, countPayload, decodeValue, encodeValue,
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
function fakeIndexedDB(seed = {}) {
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
              put: (row) => void stores.get(s).set(row.id, structuredClone(row)),
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
  assert.throws(() => parseTransferFile("not json"), /不是搬家文件/);
  assert.throws(() => parseTransferFile(JSON.stringify({ format: "clipbox-secure-backup" })), /不是搬家文件/);
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
