import assert from "node:assert/strict";
import test from "node:test";
import {
  IMAGE_FOLDER_MAX,
  IMAGE_FOLDER_NAME_MAX,
  IMAGE_MAX_BYTES,
  IMAGE_TYPES,
  normalizeFolderName,
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

test("folder names are tidied and capped at 20 characters", () => {
  assert.equal(IMAGE_FOLDER_MAX, 30);
  assert.equal(IMAGE_FOLDER_NAME_MAX, 20);
  assert.equal(normalizeFolderName("  收款   码\n "), "收款 码");
  assert.equal(normalizeFolderName("   "), "");
  assert.equal(normalizeFolderName("目".repeat(25)), "目".repeat(20));
  assert.equal(Array.from(normalizeFolderName("😀".repeat(21))).length, 20);
});

test("create, rename, recolour and delete folders with Chinese messages", async () => {
  const { open } = setup();
  const store = await open();
  assert.deepEqual(await store.listFolders(), []);
  assert.deepEqual(await store.createFolder("  收款码 "), [{ name: "收款码" }]);
  assert.deepEqual(await store.createFolder("Price"), [{ name: "收款码" }, { name: "Price" }]);
  await assert.rejects(store.createFolder("   "), { message: "目录名不能为空" });
  await assert.rejects(store.createFolder("目".repeat(21)), { message: "目录名最多 20 个字" });
  await assert.rejects(store.createFolder(" 收款码"), { message: "目录名已存在" });
  await assert.rejects(store.createFolder("price"), { message: "目录名已存在" }, "case-insensitive");
  assert.deepEqual((await store.createFolder("目".repeat(20))).length, 3);

  assert.deepEqual(await store.setFolderColor("收款码", "#1A2b3C"), [
    { name: "收款码", color: "#1A2b3C" }, { name: "Price" }, { name: "目".repeat(20) },
  ]);
  for (const bad of ["red", "#fff", "#12345g", "1a2b3c", "#1a2b3c0"]) {
    await assert.rejects(store.setFolderColor("收款码", bad), { message: "颜色不对" });
  }

  const renamed = await store.renameFolder("收款码", "付款码");
  assert.deepEqual(renamed[0], { name: "付款码", color: "#1A2b3C" }, "colour and position are kept");
  assert.deepEqual((await store.renameFolder("Price", "PRICE"))[1], { name: "PRICE" }, "case-only rename is allowed");
  assert.equal((await store.renameFolder("PRICE", "PRICE")).length, 3, "same name is a no-op");
  await assert.rejects(store.renameFolder("付款码", "price"), { message: "目录名已存在" });
  await assert.rejects(store.renameFolder("付款码", " "), { message: "目录名不能为空" });
  await assert.rejects(store.renameFolder("付款码", "名".repeat(21)), { message: "目录名最多 20 个字" });

  assert.deepEqual(await store.deleteFolder("PRICE"), [{ name: "付款码", color: "#1A2b3C" }, { name: "目".repeat(20) }]);
  assert.deepEqual((await store.listFolders()).map((folder) => folder.name), ["付款码", "目".repeat(20)]);

  for (const call of [
    () => store.renameFolder("没有", "新"),
    () => store.deleteFolder("没有"),
    () => store.setFolderColor("没有", "#000000"),
    () => store.deleteFolder("PRICE"),
  ]) {
    await assert.rejects(call(), { message: "找不到这个目录" });
  }
});

test("folder short names (D-048): set, kept on rename and recolour, cleared, dropped with the folder, and too long is refused", async () => {
  const { open } = setup();
  const store = await open();
  await store.createFolder("产品图片");
  await store.createFolder("Logo");
  assert.deepEqual(await store.setFolderShortName("产品图片", " 产品 "), [{ name: "产品图片", shortName: "产品" }, { name: "Logo" }]);
  await assert.rejects(store.setFolderShortName("产品图片", "产品图"), { message: "最多两个字" });
  await assert.rejects(store.setFolderShortName("Logo", "LOGOS"), { message: "最多两个字" });
  await assert.rejects(store.setFolderShortName("没有", "无"), { message: "找不到这个目录" });
  assert.equal((await store.listFolders())[0].shortName, "产品", "a refused value changes nothing");

  await store.setFolderColor("产品图片", "#112233");
  assert.deepEqual((await store.renameFolder("产品图片", "样品图片"))[0], { name: "样品图片", color: "#112233", shortName: "产品" });
  assert.deepEqual((await (await open()).listFolders())[0], { name: "样品图片", color: "#112233", shortName: "产品" }, "survives a new session");

  assert.deepEqual((await store.setFolderShortName("样品图片", null))[0], { name: "样品图片", color: "#112233" });
  await store.setFolderShortName("样品图片", "样品");
  assert.deepEqual((await store.setFolderShortName("样品图片", "  "))[0], { name: "样品图片", color: "#112233" }, "empty goes back to the default");

  await store.setFolderShortName("Logo", "LG");
  await store.deleteFolder("Logo");
  await store.createFolder("Logo");
  assert.deepEqual((await store.listFolders())[1], { name: "Logo" }, "a folder made again with the same name starts without the old short name");
});

test("folder short names travel in a full backup: the store's records copied as they are open with the short name", async () => {
  const { encodeValue, decodeValue } = await import("../app/data-transfer.ts");
  const { open, rows } = setup("device-key-backup");
  const store = await open();
  await store.createFolder("产品图片");
  await store.setFolderShortName("产品图片", "产品");
  await store.add(pngBlob(), "图", "产品图片");
  const copied = fakeIndexedDB();
  const restored = await openImageStore("device-key-backup", { indexedDB: copied });
  await restored.listFolders();
  // What a full backup does: every record of the store, written to the file and read back.
  const file = JSON.parse(JSON.stringify(encodeValue({ meta: [...rows("meta").values()], blobs: [...rows("blobs").values()] })));
  const tables = decodeValue(file);
  const target = copied.databases.get("clipbox-images").data;
  for (const [name, list] of Object.entries(tables)) for (const row of list) target.get(name).set(row.id, row);
  const reopened = await openImageStore("device-key-backup", { indexedDB: copied });
  assert.deepEqual(await reopened.listFolders(), [{ name: "产品图片", shortName: "产品" }]);
  assert.equal((await reopened.list())[0].folder, "产品图片");
});

test("at most 30 folders", async () => {
  const { open } = setup();
  const store = await open();
  for (let index = 1; index <= IMAGE_FOLDER_MAX; index += 1) await store.createFolder(`目录${index}`);
  await assert.rejects(store.createFolder("再来一个"), { message: "目录最多 30 个" });
  assert.equal((await store.listFolders()).length, 30);
  assert.equal((await store.listFolders())[0].name, "目录1", "creation order");
});

test("add into a folder, move images, and unknown folders are rejected", async () => {
  const { open, rows } = setup();
  const store = await open();
  await store.createFolder("产品图");
  await store.createFolder("价目表");
  const first = await store.add(pngBlob(), "主图", "产品图");
  assert.equal(first.folder, "产品图");
  const second = await store.add(pngBlob(), "散图", null);
  assert.equal("folder" in second, false);
  assert.equal("folder" in (await store.add(pngBlob(), "也散")), false);
  await assert.rejects(store.add(pngBlob(), "x", "没有"), { message: "找不到这个目录" });
  assert.equal(rows("blobs").size, 3, "a rejected add writes nothing");

  const moved = await store.moveImage("img-2", "价目表");
  assert.equal(moved.folder, "价目表");
  assert.ok(moved.updatedAt > second.updatedAt);
  const back = await store.moveImage("img-1", null);
  assert.equal("folder" in back, false, "null means 未分类");
  assert.ok(back.updatedAt > first.updatedAt);
  await assert.rejects(store.moveImage("img-1", "没有"), { message: "找不到这个目录" });
  await assert.rejects(store.moveImage("missing", "价目表"), { message: "找不到这张图片" });

  const byId = Object.fromEntries((await store.list()).map((image) => [image.id, image.folder]));
  assert.deepEqual(byId, { "img-1": undefined, "img-2": "价目表", "img-3": undefined });
});

test("renaming a folder rewrites its images; deleting moves them to 未分类 and keeps them", async () => {
  const { open, rows } = setup();
  const store = await open();
  await store.createFolder("收款码");
  await store.createFolder("物流单据");
  await store.add(pngBlob(), "微信", "收款码");
  await store.add(pngBlob(), "支付宝", "收款码");
  await store.add(pngBlob(), "运单", "物流单据");
  await store.add(pngBlob(), "散图");

  await store.renameFolder("收款码", "付款码");
  const folders = () => store.list().then((images) => Object.fromEntries(images.map((image) => [image.title, image.folder])));
  assert.deepEqual(await folders(), { 微信: "付款码", 支付宝: "付款码", 运单: "物流单据", 散图: undefined });

  await store.deleteFolder("付款码");
  assert.deepEqual(await folders(), { 微信: undefined, 支付宝: undefined, 运单: "物流单据", 散图: undefined });
  assert.equal((await store.list()).length, 4, "no image was deleted");
  assert.equal(rows("blobs").size, 4);
  assert.deepEqual(await store.listFolders(), [{ name: "物流单据" }]);
});

test("list and image calls ignore or refuse the settings and folders records", async () => {
  const { open, rows } = setup();
  const store = await open();
  assert.equal(rows("meta").has("folders"), false, "opening writes no folders record");
  await store.createFolder("收款码");
  await store.add(pngBlob(), "a");
  assert.deepEqual((await store.list()).map((image) => image.id), ["img-1"]);
  for (const id of ["settings", "folders"]) {
    await assert.rejects(store.getBlob(id), { message: "找不到这张图片" });
    await assert.rejects(store.rename(id, "x"), { message: "找不到这张图片" });
    await assert.rejects(store.markUsed(id), { message: "找不到这张图片" });
    await assert.rejects(store.moveImage(id, null), { message: "找不到这张图片" });
    await assert.rejects(store.remove(id), { message: "找不到这张图片" });
  }
  assert.equal(rows("meta").has("folders"), true, "remove refused, record kept");
});

test("the folders record is encrypted and survives reopening; a wrong key throws", async () => {
  const { open, rows } = setup();
  const store = await open();
  await store.createFolder("绝密目录");
  await store.setFolderColor("绝密目录", "#ff0000");
  await store.add(pngBlob(), "a", "绝密目录");

  const record = rows("meta").get("folders");
  assert.deepEqual(Object.keys(record).sort(), ["ciphertext", "id", "iv"]);
  const raw = JSON.stringify(record) + atob(record.ciphertext);
  for (const plain of ["绝密目录", "#ff0000", "name", "color"]) assert.ok(!raw.includes(plain), plain);
  const decoded = new TextDecoder().decode(Uint8Array.from(atob(record.ciphertext), (c) => c.charCodeAt(0)));
  assert.ok(!decoded.includes("绝密"));
  const imageText = atob(rows("meta").get("img-1").ciphertext);
  assert.ok(!new TextDecoder().decode(Uint8Array.from(imageText, (c) => c.charCodeAt(0))).includes("绝密"));

  const again = await open();
  assert.deepEqual(await again.listFolders(), [{ name: "绝密目录", color: "#ff0000" }]);
  assert.equal((await again.list())[0].folder, "绝密目录");

  const wrong = await open("another-device-key");
  await assert.rejects(wrong.listFolders(), /有图片无法读取，数据没有改动（folders）/);
  await assert.rejects(wrong.createFolder("新"), /有图片无法读取/);
  await assert.rejects(wrong.renameFolder("绝密目录", "新"), /有图片无法读取/);
  await assert.rejects(wrong.deleteFolder("绝密目录"), /有图片无法读取/);
  assert.deepEqual(rows("meta").get("folders"), record, "folders record not overwritten");
  assert.deepEqual(await again.listFolders(), [{ name: "绝密目录", color: "#ff0000" }]);
});

test("a folders record swapped onto an image id fails to decrypt", async () => {
  const { open, rows } = setup();
  const store = await open();
  await store.createFolder("a");
  rows("meta").set("img-7", { ...rows("meta").get("folders"), id: "img-7" });
  await assert.rejects(store.list(), /img-7/);
});

test("renaming a folder writes nothing when an image cannot be decrypted", async () => {
  const { open, rows } = setup();
  const store = await open();
  await store.createFolder("收款码");
  await store.add(pngBlob(), "a", "收款码");
  const before = structuredClone([...rows("meta").entries()]);
  rows("meta").set("img-9", { ...rows("meta").get("img-1"), id: "img-9" });
  await assert.rejects(store.renameFolder("收款码", "付款码"), /img-9/);
  await assert.rejects(store.deleteFolder("收款码"), /img-9/);
  rows("meta").delete("img-9");
  assert.deepEqual([...rows("meta").entries()], before);
});

test("old image records without a folder still list", async () => {
  const { open } = setup();
  const store = await open();
  await store.add(pngBlob(), "旧图");
  const [image] = await store.list();
  assert.equal("folder" in image, false);
  assert.deepEqual(await store.listFolders(), []);
});

// Thumbnails (D-024): a derived, encrypted copy in its own database; the originals are never touched.
function thumbSetup(makeThumb) {
  const factory = fakeIndexedDB();
  const calls = { made: 0 };
  const open = (key = "device-key-1") => openImageStore(key, {
    indexedDB: factory,
    createId: () => "img-1",
    makeThumb: async (blob) => { calls.made += 1; return makeThumb(blob); },
  });
  const thumbRows = () => factory.databases.get("clipbox-image-thumbs")?.data.get("thumbs");
  return { factory, open, calls, thumbRows, blobRows: () => factory.databases.get("clipbox-images").data.get("blobs") };
}
const smallBytes = Uint8Array.from([9, 8, 7, 6, 5, 4, 3, 2, 1, 77, 78, 79]);
const makeSmall = async () => new Blob([smallBytes], { type: "image/webp" });

test("getThumb makes the thumbnail once, keeps it as plain bytes (not encrypted), and later reads do not touch the original", async () => {
  const { open, calls, thumbRows, blobRows } = thumbSetup(makeSmall);
  const store = await open();
  await store.add(pngBlob(), "图", null);
  const originalBefore = JSON.stringify(Array.from(blobRows().values()).map((row) => [row.iv, Array.from(new Uint8Array(row.ciphertext))]));

  const first = await store.getThumb("img-1");
  assert.equal(first.type, "image/webp");
  assert.deepEqual(Array.from(new Uint8Array(await first.arrayBuffer())), Array.from(smallBytes));
  assert.equal(calls.made, 1);
  const stored = thumbRows().get("img-1");
  assert.ok(stored, "the thumbnail is stored");
  assert.deepEqual(Array.from(new Uint8Array(stored.bytes)), Array.from(smallBytes), "stored as plain bytes, readable without the key");
  assert.equal(stored.ciphertext, undefined);

  const second = await store.getThumb("img-1");
  assert.deepEqual(Array.from(new Uint8Array(await second.arrayBuffer())), Array.from(smallBytes));
  assert.equal(calls.made, 1, "the second read uses the stored thumbnail");
  // A new session with the same key reads it too.
  const again = await (await open()).getThumb("img-1");
  assert.equal(again.type, "image/webp");
  assert.equal(calls.made, 1);

  const originalAfter = JSON.stringify(Array.from(blobRows().values()).map((row) => [row.iv, Array.from(new Uint8Array(row.ciphertext))]));
  assert.equal(originalAfter, originalBefore, "the original image record is untouched");
  assert.deepEqual(Array.from(new Uint8Array(await (await store.getBlob("img-1")).arrayBuffer())), Array.from(pngBytes));
});

test("when no smaller copy can be made, getThumb returns the original and stores nothing", async () => {
  const { open, thumbRows } = thumbSetup(async () => null);
  const store = await open();
  await store.add(pngBlob(), "图", null);
  const thumb = await store.getThumb("img-1");
  assert.deepEqual(Array.from(new Uint8Array(await thumb.arrayBuffer())), Array.from(pngBytes));
  assert.equal(thumbRows()?.size ?? 0, 0);
});

test("a failing thumbnail maker never breaks reading the picture", async () => {
  const { open } = thumbSetup(async () => { throw new Error("canvas broke"); });
  const store = await open();
  await store.add(pngBlob(), "图", null);
  const thumb = await store.getThumb("img-1");
  assert.deepEqual(Array.from(new Uint8Array(await thumb.arrayBuffer())), Array.from(pngBytes));
});

test("remove also deletes the thumbnail, and a thumbnail that cannot be read is made again", async () => {
  const { open, calls, thumbRows } = thumbSetup(makeSmall);
  const store = await open();
  await store.add(pngBlob(), "图", null);
  await store.getThumb("img-1");
  // Corrupt the stored thumbnail: it is replaced by a fresh one instead of failing.
  thumbRows().set("img-1", { id: "img-1", bytes: new ArrayBuffer(0), type: "image/webp" });
  const repaired = await store.getThumb("img-1");
  assert.equal(repaired.type, "image/webp");
  assert.equal(calls.made, 2);
  await store.remove("img-1");
  assert.equal(thumbRows().has("img-1"), false);
});

test("an encrypted thumbnail row from the first version is ignored and replaced, never shown broken", async () => {
  const { open, calls, thumbRows } = thumbSetup(makeSmall);
  const store = await open();
  await store.add(pngBlob(), "图", null);
  await store.getThumb("img-1");
  thumbRows().set("img-1", { id: "img-1", iv: "AAAA", ciphertext: new Uint8Array([1, 2, 3, 4]).buffer, type: "image/webp" });
  const fresh = await store.getThumb("img-1");
  assert.deepEqual(Array.from(new Uint8Array(await fresh.arrayBuffer())), Array.from(smallBytes));
  assert.equal(calls.made, 2);
  const row = thumbRows().get("img-1");
  assert.ok(row.bytes && row.ciphertext === undefined, "the old row is replaced by a plain one");
});

test("收藏: setPinned keeps every other field, survives a new session, and records without the field are simply not favourites", async () => {
  const { open, rows } = setup();
  const store = await open();
  await store.createFolder("产品图");
  const meta = await store.add(pngBlob(), "主图", "产品图");
  const other = await store.add(pngBlob(), "副图", null);
  assert.equal("pinned" in meta, false, "a new or older record has no pinned field");
  const originalBefore = JSON.stringify(Array.from(rows("blobs").values()).map((row) => [row.iv, Array.from(new Uint8Array(row.ciphertext))]));

  const pinned = await store.setPinned(meta.id, true);
  assert.equal(pinned.pinned, true);
  assert.deepEqual({ ...pinned, pinned: undefined }, { ...meta, pinned: undefined }, "nothing else changed (title, folder, size, times)");
  const again = await (await open()).list();
  assert.equal(again.find((image) => image.id === meta.id).pinned, true, "a new session reads it back");
  assert.equal("pinned" in again.find((image) => image.id === other.id), false, "other images are untouched");

  const unpinned = await store.setPinned(meta.id, false);
  assert.equal("pinned" in unpinned, false, "unpinning removes the field again");
  await assert.rejects(store.setPinned("missing", true), { message: "找不到这张图片" });

  const originalAfter = JSON.stringify(Array.from(rows("blobs").values()).map((row) => [row.iv, Array.from(new Uint8Array(row.ciphertext))]));
  assert.equal(originalAfter, originalBefore, "the original image bytes are never touched");
});

test("reorderFolders moves a folder to another's place, keeps images and colours, and survives a new session", async () => {
  const { open, rows } = setup();
  const store = await open();
  for (const name of ["甲", "乙", "丙"]) await store.createFolder(name);
  await store.setFolderColor("乙", "#112233");
  const image = await store.add(pngBlob(), "图", "丙");
  const blobsBefore = JSON.stringify(Array.from(rows("blobs").values()).map((row) => [row.iv, Array.from(new Uint8Array(row.ciphertext))]));

  assert.deepEqual((await store.reorderFolders("甲", "丙")).map((folder) => folder.name), ["乙", "丙", "甲"]);
  assert.deepEqual((await store.reorderFolders("丙", "乙")).map((folder) => folder.name), ["丙", "乙", "甲"]);
  assert.deepEqual((await store.reorderFolders("乙", "乙")).map((folder) => folder.name), ["丙", "乙", "甲"], "same folder is a no-op");

  const again = await (await open()).listFolders();
  assert.deepEqual(again.map((folder) => folder.name), ["丙", "乙", "甲"]);
  assert.equal(again.find((folder) => folder.name === "乙").color, "#112233", "colours stay");
  assert.equal((await (await open()).list()).find((entry) => entry.id === image.id).folder, "丙", "images keep their folder");
  await assert.rejects(store.reorderFolders("没有", "甲"), { message: "找不到这个目录" });
  await assert.rejects(store.reorderFolders("甲", "没有"), { message: "找不到这个目录" });
  assert.equal(JSON.stringify(Array.from(rows("blobs").values()).map((row) => [row.iv, Array.from(new Uint8Array(row.ciphertext))])), blobsBefore, "image bytes untouched");
});

test("回收站: trash only marks the image; restore brings it back unchanged; remove (permanent) is separate and deletes just that one", async () => {
  const { open, rows } = setup();
  const store = await open();
  await store.createFolder("产品图");
  const a = await store.add(pngBlob(), "甲", "产品图");
  const b = await store.add(pngBlob(), "乙", null);
  const c = await store.add(pngBlob(), "丙", null);
  assert.equal("deletedAt" in a, false, "a new or older record has no deletedAt");
  const blobsBefore = JSON.stringify(Array.from(rows("blobs").values()).map((row) => [row.id, row.iv, Array.from(new Uint8Array(row.ciphertext))]));

  const trashed = await store.trash(a.id);
  assert.equal(typeof trashed.deletedAt, "number");
  assert.deepEqual({ ...trashed, deletedAt: undefined }, { ...a, deletedAt: undefined }, "only deletedAt changed");
  const list = await (await open()).list();
  assert.equal(list.length, 3, "still stored, a new session sees all three");
  assert.equal(typeof list.find((image) => image.id === a.id).deletedAt, "number");
  assert.equal("deletedAt" in list.find((image) => image.id === b.id), false, "other images are untouched");
  assert.equal(JSON.stringify(Array.from(rows("blobs").values()).map((row) => [row.id, row.iv, Array.from(new Uint8Array(row.ciphertext))])), blobsBefore, "trashing never touches the original bytes");
  assert.deepEqual(new Uint8Array(await (await store.getBlob(a.id)).arrayBuffer()), pngBytes, "the original can still be read while trashed");

  const restored = await store.restore(a.id);
  assert.equal("deletedAt" in restored, false);
  assert.deepEqual(restored, a, "restored exactly as before (folder, title, times)");

  // Permanent deletion removes only the chosen image.
  await store.trash(b.id);
  await store.trash(c.id);
  await store.remove(b.id);
  assert.deepEqual((await store.list()).map((image) => image.id).sort(), [a.id, c.id].sort());
  assert.equal(rows("blobs").has(b.id), false);
  assert.equal(rows("blobs").has(c.id), true, "the other trashed image is still there and can be restored");
  assert.equal("deletedAt" in (await store.restore(c.id)), false);

  await assert.rejects(store.trash("missing"), { message: "找不到这张图片" });
  await assert.rejects(store.restore("settings"), { message: "找不到这张图片" });
  await assert.rejects(store.trash("settings"), { message: "找不到这张图片" });
});

test("回收站: deleting a folder also clears the folder of trashed images, so a restored image lands in 未分类", async () => {
  const { open } = setup();
  const store = await open();
  await store.createFolder("产品图");
  const image = await store.add(pngBlob(), "甲", "产品图");
  await store.trash(image.id);
  await store.deleteFolder("产品图");
  const restored = await store.restore(image.id);
  assert.equal(restored.folder, undefined);
});
