import assert from "node:assert/strict";
import test from "node:test";
import { openImageStore } from "../app/image-store.ts";
import { memoryIndexedDB } from "./helpers/memory-idb.mjs";

const api = await import("../app/mcp-images.ts").catch(() => ({}));
const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const file = (extra = {}) => ({ path: "/synthetic/picture.png", sourceName: "picture.png", mimeType: "image/png", data: Buffer.from(bytes).toString("base64"), ...extra });
async function harness() {
  let serial = 0, time = 1000;
  const store = await openImageStore("synthetic-test-key", { indexedDB: memoryIndexedDB(), now: () => ++time, createId: () => `image-${++serial}` });
  const library = {
    addImage: (...args) => store.add(...args), rename: (...args) => store.rename(...args),
    moveImage: async (...args) => { await store.moveImage(...args); return true; },
    createFolder: async (name) => { await store.createFolder(name); return name; },
    renameFolder: async (from, to) => { await store.renameFolder(from, to); return to; },
  };
  const deps = { store, library, validateImage: async () => {}, thumbnail: async () => new Blob([bytes], { type: "image/png" }) };
  const run = (command) => api.runMcpImageCommand(command, deps);
  return { store, library, deps, run };
}

test("MCP image import persists encrypted bytes and retry deduplicates without changing metadata", async () => {
  const { run, store } = await harness();
  await run({ action: "image-folder-create", name: "Products" });
  const first = await run({ action: "image-import", files: [file({ title: "Example", folder: "Products" })] });
  assert.equal(first.results[0].status, "imported");
  const second = await run({ action: "image-import", files: [file({ title: "Should not rename" })] });
  assert.equal(second.results[0].status, "duplicate");
  assert.equal(second.results[0].item.title, "Example");
  assert.equal((await store.list()).length, 1);
  assert.deepEqual(new Uint8Array(await (await store.getBlob(first.results[0].item.id)).arrayBuffer()), bytes);
});

test("MCP import reports per-file failures and keeps earlier successful imports", async () => {
  const { run, store, deps } = await harness();
  deps.validateImage = async (blob) => { if (blob.size === 1) throw new Error("invalid image"); };
  const out = await run({ action: "image-import", files: [file(), file({ path: "/synthetic/bad.png", data: "AA==" }), file({ path: "/synthetic/missing.png", folder: "Missing" }), { path: "/synthetic/not-found.png", error: { code: "INVALID_IMAGE_IMPORT", message: "无法读取图片文件" } }] });
  assert.deepEqual(out.results.map((x) => x.status), ["imported", "error", "error", "error"]);
  assert.equal(out.results[3].error.code, "INVALID_IMAGE_IMPORT");
  assert.equal((await store.list()).length, 1);
});

test("MCP image list paginates metadata, filters titles/folders, and excludes trash and bytes", async () => {
  const { run, store } = await harness();
  await store.createFolder("Products");
  const image = await store.add(new Blob([bytes], { type: "image/png" }), "First", "Products");
  const discarded = await store.add(new Blob([bytes], { type: "image/png" }), "Discarded");
  await store.trash(discarded.id);
  const out = await run({ action: "image-list", query: "first", folder: "Products", offset: 0, limit: 1 });
  assert.deepEqual(out.items.map((x) => x.id), [image.id]);
  assert.equal(out.total, 1); assert.equal(out.items[0].data, undefined);
  assert.equal((await run({ action: "image-list", offset: 1 })).items.length, 0);
  assert.deepEqual((await run({ action: "image-folders" })).folders, [{ name: "Products", count: 1 }]);
});

test("MCP image edits check fresh versions per entry and preserve successful entries", async () => {
  const { run, store } = await harness();
  const a = await store.add(new Blob([bytes], { type: "image/png" }), "A");
  const b = await store.add(new Blob([bytes], { type: "image/png" }), "B");
  const out = await run({ action: "image-update-many", updates: [{ id: a.id, expectedUpdatedAt: a.updatedAt, title: "Renamed" }, { id: b.id, expectedUpdatedAt: b.updatedAt - 1, title: "Stale" }] });
  assert.deepEqual(out.results.map((x) => x.status), ["updated", "error"]);
  assert.equal(out.results[1].error.code, "CONFLICT");
  assert.equal((await store.list()).find((x) => x.id === b.id).title, "B");
});

test("MCP rejects bad targets/fields before edits, and reports applied fields on a partial item failure", async () => {
  const { run, store, library } = await harness();
  await store.createFolder("Products");
  const a = await store.add(new Blob([bytes], { type: "image/png" }), "A");
  await assert.rejects(run({ action: "image-update-many", updates: [{ id: a.id, expectedUpdatedAt: a.updatedAt, title: "Changed" }, { id: a.id, expectedUpdatedAt: a.updatedAt, title: "Again" }] }));
  assert.equal((await store.list())[0].title, "A");
  library.moveImage = async () => false;
  const out = await run({ action: "image-update-many", updates: [{ id: a.id, expectedUpdatedAt: a.updatedAt, title: "Changed", folder: "Products" }] });
  assert.equal(out.results[0].status, "error");
  assert.deepEqual(out.results[0].appliedFields, ["title"]);
  assert.equal((await store.list())[0].title, "Changed");
});

test("MCP rechecks the image after async folder lookup and preserves a newer UI edit", async () => {
  const { run, store } = await harness();
  await store.createFolder("Products");
  const image = await store.add(new Blob([bytes], { type: "image/png" }), "Original");
  const listFolders = store.listFolders;
  store.listFolders = async () => { await store.rename(image.id, "Newer UI title"); return listFolders(); };
  const out = await run({ action: "image-update-many", updates: [{ id: image.id, expectedUpdatedAt: image.updatedAt, title: "Stale title", folder: "Products" }] });
  assert.equal(out.results[0].error.code, "CONFLICT");
  assert.deepEqual(out.results[0].appliedFields, []);
  assert.equal((await store.list())[0].title, "Newer UI title");
});

test("MCP thumbnail cannot fall back to original bytes and refuses trashed images", async () => {
  const { run, store, deps } = await harness();
  const a = await store.add(new Blob([bytes], { type: "image/png" }), "A");
  assert.equal((await run({ action: "image-thumbnail", id: a.id })).preview.mimeType, "image/png");
  deps.thumbnail = async () => new Blob([new Uint8Array(512 * 1024 + 1)], { type: "image/png" });
  await assert.rejects(run({ action: "image-thumbnail", id: a.id }), /预览/);
  deps.thumbnail = async () => null;
  await assert.rejects(run({ action: "image-thumbnail", id: a.id }), /预览/);
  await store.trash(a.id);
  await assert.rejects(run({ action: "image-thumbnail", id: a.id }), /图片/);
});

test("MCP validates bounds, extra fields and required guards without writing", async () => {
  const { run, store } = await harness();
  for (const cmd of [
    { action: "image-list", limit: 0 }, { action: "image-list", offset: -1 }, { action: "image-folders", includeSecrets: true },
    { action: "image-import", files: [] }, { action: "image-import", files: Array(11).fill(file()) },
    { action: "image-update-many", updates: [{ id: "x", title: "No guard" }] },
    { action: "image-update-many", updates: [{ id: "x", expectedUpdatedAt: 1, secret: "Wrong field" }] },
  ]) await assert.rejects(run(cmd));
  assert.deepEqual(await store.list(), []);
});
