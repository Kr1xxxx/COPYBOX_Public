import assert from "node:assert/strict";
import test from "node:test";
import {
  IMAGE_MAX_BYTES,
  IMAGE_TYPES,
  normalizeImageTitle,
  openImageStore,
  titleFromFileName,
  toPngBytes,
  validateImageFile,
} from "../app/image-store.ts";

// Minimal in-memory IndexedDB: only the calls app/image-store.ts makes. Events fire asynchronously like the real
// thing; a transaction completes once its requests have settled.
function fakeIndexedDB() {
  const databases = new Map();
  const later = (fn) => setTimeout(fn, 0);

  function makeRequest(tx, run) {
    const req = { result: undefined, error: null, onsuccess: null, onerror: null };
    if (tx) tx.pending += 1;
    later(() => {
      try {
        req.result = run();
        req.onsuccess?.({ target: req });
      } catch (error) {
        req.error = error;
        req.onerror?.({ target: req });
      }
      if (tx) {
        tx.pending -= 1;
        tx.settle();
      }
    });
    return req;
  }

  function makeTransaction(data, names, mode) {
    const tx = {
      pending: 0,
      error: null,
      oncomplete: null,
      onerror: null,
      onabort: null,
      settle() {
        later(() => {
          if (tx.pending === 0 && !tx.done) {
            tx.done = true;
            tx.oncomplete?.();
          }
        });
      },
      objectStore(name) {
        assert.ok(names.includes(name), `store ${name} not in transaction`);
        const rows = data.get(name);
        const write = (fn) => {
          assert.equal(mode, "readwrite", "write in a readonly transaction");
          assert.ok(!tx.done, "write after the transaction finished");
          return makeRequest(tx, fn);
        };
        return {
          get: (id) => makeRequest(tx, () => structuredClone(rows.get(id))),
          getAll: () => makeRequest(tx, () => [...rows.values()].map((row) => structuredClone(row))),
          put: (value) => write(() => (rows.set(value.id, structuredClone(value)), value.id)),
          delete: (id) => write(() => void rows.delete(id)),
        };
      },
    };
    tx.settle();
    return tx;
  }

  const factory = {
    databases,
    open(name, version) {
      const req = makeRequest(null, () => {
        let entry = databases.get(name);
        const isNew = !entry;
        if (isNew) databases.set(name, (entry = { version, data: new Map() }));
        const db = {
          objectStoreNames: { contains: (store) => entry.data.has(store) },
          createObjectStore: (store, options) => {
            assert.deepEqual(options, { keyPath: "id" });
            entry.data.set(store, new Map());
          },
          transaction: (stores, mode = "readonly") => makeTransaction(entry.data, [stores].flat(), mode),
        };
        req.result = db;
        if (isNew) req.onupgradeneeded?.({ target: req });
        return db;
      });
      req.onupgradeneeded = null;
      return req;
    },
  };
  return factory;
}

function setup(deviceKey = "device-key-1", factory = fakeIndexedDB()) {
  let clock = 1000;
  let counter = 0;
  const open = (key = deviceKey) =>
    openImageStore(key, { indexedDB: factory, now: () => (clock += 1), createId: () => `img-${(counter += 1)}` });
  return { factory, open, rows: (store) => factory.databases.get("clipbox-images").data.get(store) };
}

const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 250, 251, 252]);
const pngBlob = () => new Blob([pngBytes], { type: "image/png" });

test("image limits and Chinese messages", () => {
  assert.equal(IMAGE_MAX_BYTES, 10 * 1024 * 1024);
  assert.deepEqual(IMAGE_TYPES, ["image/png", "image/jpeg", "image/webp", "image/gif"]);
  for (const type of IMAGE_TYPES) assert.equal(validateImageFile({ size: 1, type }), null);
  assert.equal(validateImageFile({ size: IMAGE_MAX_BYTES, type: "image/png" }), null);
  assert.equal(validateImageFile({ size: IMAGE_MAX_BYTES + 1, type: "image/png" }), "图片太大，最多 10 MB");
  assert.equal(validateImageFile({ size: 10, type: "image/svg+xml" }), "只支持 PNG、JPG、WebP、GIF 图片");
  assert.equal(validateImageFile({ size: 10, type: "" }), "只支持 PNG、JPG、WebP、GIF 图片");
});

test("image titles are tidied, capped at 40 characters and fall back when empty", () => {
  assert.equal(normalizeImageTitle("  退款   流程\n图 ", "图片"), "退款 流程 图");
  assert.equal(normalizeImageTitle("   ", "图片"), "图片");
  assert.equal(normalizeImageTitle("", "  旧标题 "), "旧标题");
  assert.equal(normalizeImageTitle("图".repeat(50), "图片"), "图".repeat(40));
  assert.equal(Array.from(normalizeImageTitle("😀".repeat(41), "x")).length, 40);
  assert.equal(titleFromFileName("售后流程.png"), "售后流程");
  assert.equal(titleFromFileName("a.b.final.JPG"), "a.b.final");
  assert.equal(titleFromFileName("没有扩展名"), "没有扩展名");
});

test("add, list, rename, markUsed and getBlob round-trip through the encrypted store", async () => {
  const { open } = setup();
  const store = await open();
  assert.deepEqual(await store.list(), []);

  const first = await store.add(pngBlob(), "  售后 流程 ");
  assert.deepEqual(first, {
    id: "img-1", title: "售后 流程", type: "image/png", size: pngBytes.length,
    width: 0, height: 0, createdAt: first.createdAt, updatedAt: first.createdAt,
  });
  const second = await store.add(new Blob([Uint8Array.of(1, 2, 3)], { type: "image/gif" }), "");
  assert.equal(second.title, "图片");
  assert.deepEqual((await store.list()).map((image) => image.id), ["img-2", "img-1"], "newest first");

  const renamed = await store.rename("img-1", "新名字");
  assert.equal(renamed.title, "新名字");
  assert.ok(renamed.updatedAt > first.updatedAt);
  assert.equal(renamed.createdAt, first.createdAt);
  assert.equal((await store.rename("img-1", "  ")).title, "新名字", "empty rename keeps the old title");

  await store.markUsed("img-1");
  const listed = (await store.list()).find((image) => image.id === "img-1");
  assert.equal(listed.title, "新名字");
  assert.equal(typeof listed.lastUsedAt, "number");

  const blob = await store.getBlob("img-1");
  assert.equal(blob.type, "image/png");
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), pngBytes);
  assert.equal((await store.getBlob("img-2")).type, "image/gif");

  await assert.rejects(store.rename("missing", "x"), /找不到这张图片/);
  await assert.rejects(store.getBlob("settings"), /找不到这张图片/);
});

test("remove deletes both the meta and the blob record", async () => {
  const { open, rows } = setup();
  const store = await open();
  await store.add(pngBlob(), "a");
  await store.add(pngBlob(), "b");
  await store.remove("img-1");
  assert.deepEqual((await store.list()).map((image) => image.id), ["img-2"]);
  assert.equal(rows("meta").has("img-1"), false);
  assert.equal(rows("blobs").has("img-1"), false);
  assert.equal(rows("blobs").has("img-2"), true);
  assert.equal(rows("meta").has("settings"), true, "salt is kept");
});

test("stored records hold no plaintext title or image bytes", async () => {
  const { open, rows } = setup();
  const store = await open();
  await store.add(pngBlob(), "绝密客户名单");

  const settings = rows("meta").get("settings");
  assert.deepEqual(Object.keys(settings).sort(), ["id", "salt"]);
  assert.equal(atob(settings.salt).length, 16);

  const meta = rows("meta").get("img-1");
  assert.deepEqual(Object.keys(meta).sort(), ["ciphertext", "id", "iv"]);
  assert.equal(typeof meta.ciphertext, "string");
  assert.equal(atob(meta.iv).length, 12);
  const metaText = JSON.stringify(meta) + atob(meta.ciphertext);
  for (const plain of ["绝密客户名单", "image/png", "title"]) assert.ok(!metaText.includes(plain), plain);
  assert.ok(!new TextDecoder().decode(Uint8Array.from(atob(meta.ciphertext), (c) => c.charCodeAt(0))).includes("绝密"));

  const blob = rows("blobs").get("img-1");
  assert.deepEqual(Object.keys(blob).sort(), ["ciphertext", "id", "iv"]);
  assert.ok(blob.ciphertext instanceof ArrayBuffer, "blob ciphertext stays binary");
  const stored = new Uint8Array(blob.ciphertext);
  assert.equal(stored.length, pngBytes.length + 16, "AES-GCM adds a 16-byte tag");
  assert.notDeepEqual(stored.subarray(0, pngBytes.length), pngBytes);
  assert.notEqual(meta.iv, blob.iv, "fresh IV per record");

  const before = meta.iv;
  await store.rename("img-1", "另一个");
  assert.notEqual(rows("meta").get("img-1").iv, before, "fresh IV per write");
});

test("reopening with the same device key reads the data; a different key throws instead of returning empty", async () => {
  const { open, rows } = setup();
  const store = await open();
  await store.add(pngBlob(), "保留");
  const salt = rows("meta").get("settings").salt;

  const again = await open();
  assert.equal(rows("meta").get("settings").salt, salt, "salt is created once");
  assert.deepEqual((await again.list()).map((image) => image.title), ["保留"]);
  assert.deepEqual(new Uint8Array(await (await again.getBlob("img-1")).arrayBuffer()), pngBytes);

  const wrong = await open("another-device-key");
  await assert.rejects(wrong.list(), /有图片无法读取，数据没有改动/);
  await assert.rejects(wrong.getBlob("img-1"), /有图片无法读取/);
  await assert.rejects(wrong.rename("img-1", "x"), /有图片无法读取/);
  assert.equal(rows("meta").has("img-1"), true, "nothing was dropped");
  assert.deepEqual((await again.list()).map((image) => image.title), ["保留"], "nothing was overwritten");
});

test("a record moved onto another id fails to decrypt", async () => {
  const { open, rows } = setup();
  const store = await open();
  await store.add(pngBlob(), "a");
  rows("meta").set("img-9", { ...rows("meta").get("img-1"), id: "img-9" });
  await assert.rejects(store.list(), /img-9/);
});

test("add rejects files that are too big or not a supported image", async () => {
  const { open, rows } = setup();
  const store = await open();
  const big = { size: IMAGE_MAX_BYTES + 1, type: "image/png", arrayBuffer: async () => new ArrayBuffer(0) };
  await assert.rejects(store.add(big, "大图"), { message: "图片太大，最多 10 MB" });
  await assert.rejects(store.add(new Blob(["<svg/>"], { type: "image/svg+xml" }), "矢量"), {
    message: "只支持 PNG、JPG、WebP、GIF 图片",
  });
  assert.equal(rows("meta").size, 1, "only the settings record exists");
  assert.equal(rows("blobs").size, 0);
});

test("toPngBytes returns PNG bytes unchanged", async () => {
  assert.deepEqual(await toPngBytes(pngBlob()), pngBytes);
});
