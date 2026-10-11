import assert from "node:assert/strict";
import test from "node:test";
import {
  countImagesByFolder,
  countPinnedImages,
  activeImages,
  trashedImages,
  expiredTrashedImages,
  IMAGE_FILTER_TRASH,
  pinnedFirst,
  filterImagesByFolder,
  folderOfImageFilter,
  imageFilterTitle,
  imageFolderColors,
  imageFolderFilter,
  resolveImageFilter,
} from "../app/image-folders-core.ts";

const image = (id, folder) => ({ id, title: id, type: "image/png", size: 1, width: 1, height: 1, createdAt: 1, updatedAt: 1, ...(folder ? { folder } : {}) });
const folders = [{ name: "收款码" }, { name: "价目表", color: "#4DBFC4" }];
const images = [image("a", "收款码"), image("b", "收款码"), image("c", "价目表"), image("d"), image("e", "已经不存在")];

test("a filter names all images, the uncategorized ones, or one folder", () => {
  assert.equal(imageFolderFilter("收款码"), "folder:收款码");
  assert.equal(folderOfImageFilter("folder:收款码"), "收款码");
  assert.equal(folderOfImageFilter("all"), null);
  assert.equal(folderOfImageFilter("uncategorized"), null);
  assert.equal(imageFilterTitle("all"), "全部图片");
  assert.equal(imageFilterTitle("uncategorized"), "未分类");
  assert.equal(imageFilterTitle("folder:价目表"), "价目表");
});

test("a folder that no longer exists falls back to all images", () => {
  assert.equal(resolveImageFilter("folder:收款码", folders), "folder:收款码");
  assert.equal(resolveImageFilter("folder:没有这个", folders), "all");
  assert.equal(resolveImageFilter("uncategorized", folders), "uncategorized");
  assert.equal(resolveImageFilter("whatever", folders), "all");
  assert.equal(resolveImageFilter("folder:收款码", []), "all");
});

test("收藏: its own filter, title and count; favourites go first and the rest keep their order", () => {
  const list = [{ id: "a" }, { id: "b", pinned: true }, { id: "c" }, { id: "d", pinned: true }];
  assert.equal(imageFilterTitle("pinned"), "收藏");
  assert.equal(resolveImageFilter("pinned", []), "pinned");
  assert.deepEqual(filterImagesByFolder(list, "pinned", []).map((value) => value.id), ["b", "d"]);
  assert.equal(countPinnedImages(list), 2);
  assert.deepEqual(pinnedFirst(list).map((value) => value.id), ["b", "d", "a", "c"]);
  assert.deepEqual(list.map((value) => value.id), ["a", "b", "c", "d"], "the input is not reordered");
});

test("filtering by folder keeps the order, and an unknown folder name counts as uncategorized", () => {
  assert.deepEqual(filterImagesByFolder(images, "all", folders).map((value) => value.id), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(filterImagesByFolder(images, "folder:收款码", folders).map((value) => value.id), ["a", "b"]);
  assert.deepEqual(filterImagesByFolder(images, "folder:价目表", folders).map((value) => value.id), ["c"]);
  assert.deepEqual(filterImagesByFolder(images, "uncategorized", folders).map((value) => value.id), ["d", "e"]);
  assert.deepEqual(filterImagesByFolder([], "folder:收款码", folders), []);
});

test("the counts of the folders and 未分类 add up to the total", () => {
  const counts = countImagesByFolder(images, folders);
  assert.deepEqual(counts, { total: 5, uncategorized: 2, byFolder: { 收款码: 2, 价目表: 1 } });
  assert.equal(counts.uncategorized + Object.values(counts.byFolder).reduce((sum, value) => sum + value, 0), counts.total);
  assert.deepEqual(countImagesByFolder([], folders), { total: 0, uncategorized: 0, byFolder: { 收款码: 0, 价目表: 0 } });
  assert.deepEqual(countImagesByFolder(images, []), { total: 5, uncategorized: 5, byFolder: {} });
});

test("a chosen colour wins over the automatic one", () => {
  const colors = imageFolderColors(folders);
  assert.equal(colors["价目表"], "#4DBFC4");
  assert.match(colors["收款码"], /^#[0-9A-F]{6}$/i);
  assert.notEqual(colors["收款码"], colors["价目表"]);
  assert.deepEqual(imageFolderColors([]), {});
});

test("回收站: active and trashed images are split, trashed ones are newest-deleted first, and expiry follows the chosen days", () => {
  const DAY = 86_400_000;
  const now = 100 * DAY;
  const images = [
    { id: "a", folder: "x" },
    { id: "b", deletedAt: now - 8 * DAY },
    { id: "c", deletedAt: now - 1 * DAY },
    { id: "d", deletedAt: now - 7 * DAY - 1 },
    { id: "e", deletedAt: now - 6 * DAY },
  ];
  assert.deepEqual(activeImages(images).map((image) => image.id), ["a"]);
  assert.deepEqual(trashedImages(images).map((image) => image.id), ["c", "e", "d", "b"]);
  assert.deepEqual(expiredTrashedImages(images, 7, now).map((image) => image.id), ["b", "d"], "only the ones past 7 days; active images never expire");
  assert.deepEqual(expiredTrashedImages(images, 0, now), [], "0 days = keep forever");
  assert.equal(resolveImageFilter(IMAGE_FILTER_TRASH, []), IMAGE_FILTER_TRASH);
  assert.equal(imageFilterTitle(IMAGE_FILTER_TRASH), "回收站");
});
