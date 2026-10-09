import assert from "node:assert/strict";
import test from "node:test";
import {
  IMAGE_VIEW_KEY,
  gridCardInsertIndex,
  parseImageView,
  readImageView,
  writeImageView,
} from "../app/image-view-core.ts";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    data,
  };
}

const broken = {
  getItem() { throw new Error("blocked"); },
  setItem() { throw new Error("blocked"); },
};

test("the stored key is clipbox.image-view", () => {
  assert.equal(IMAGE_VIEW_KEY, "clipbox.image-view");
});

test("only list means list; everything else is the grid", () => {
  assert.equal(parseImageView("list"), "list");
  assert.equal(parseImageView("grid"), "grid");
  for (const odd of [null, undefined, "", "LIST", "table", 1, {}]) assert.equal(parseImageView(odd), "grid");
});

test("the view is read from and written to storage", () => {
  const storage = memoryStorage();
  assert.equal(readImageView(storage), "grid");
  writeImageView("list", storage);
  assert.equal(storage.data.get(IMAGE_VIEW_KEY), "list");
  assert.equal(readImageView(storage), "list");
  writeImageView("grid", storage);
  assert.equal(readImageView(storage), "grid");
  assert.equal(readImageView(memoryStorage({ [IMAGE_VIEW_KEY]: "nonsense" })), "grid");
});

test("unavailable storage never throws and falls back to the grid", () => {
  assert.equal(readImageView(broken), "grid");
  assert.doesNotThrow(() => writeImageView("list", broken));
  assert.equal(readImageView(null), "grid");
  assert.doesNotThrow(() => writeImageView("list", null));
});

test("the detail card goes after the last tile of the selected tile's row", () => {
  // 10 tiles: rows are 0-2, 3-5, 6-8, 9.
  assert.deepEqual([0, 1, 2].map((i) => gridCardInsertIndex(i, 10)), [3, 3, 3]);
  assert.deepEqual([3, 4, 5].map((i) => gridCardInsertIndex(i, 10)), [6, 6, 6]);
  assert.deepEqual([6, 7, 8].map((i) => gridCardInsertIndex(i, 10)), [9, 9, 9]);
  assert.equal(gridCardInsertIndex(9, 10), 10);
});

test("the card position is clamped to a short last row and ignores a missing selection", () => {
  assert.equal(gridCardInsertIndex(0, 1), 1);
  assert.equal(gridCardInsertIndex(0, 2), 2);
  assert.equal(gridCardInsertIndex(4, 5), 5);
  assert.equal(gridCardInsertIndex(-1, 5), -1);
  assert.equal(gridCardInsertIndex(5, 5), -1);
  assert.equal(gridCardInsertIndex(0, 0), -1);
  assert.equal(gridCardInsertIndex(3, 7, 2), 4);
});
