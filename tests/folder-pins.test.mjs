import assert from "node:assert/strict";
import test from "node:test";
import {
  folderGroupNeighbour,
  parseFolderPins,
  pinnedFirst,
  renamePinnedName,
  sameFolderGroup,
  togglePinnedName,
} from "../app/folder-pins.ts";

const self = (name) => name;

test("pinned folders come first in the order they were pinned; the rest keep their saved order", () => {
  assert.deepEqual(pinnedFirst(["a", "b", "c", "d"], ["c", "a"], self), ["c", "a", "b", "d"]);
  assert.deepEqual(pinnedFirst(["a", "b"], [], self), ["a", "b"]);
  // A pin of a folder that is gone is ignored.
  assert.deepEqual(pinnedFirst(["a", "b"], ["x", "b"], self), ["b", "a"]);
  assert.deepEqual(pinnedFirst([{ name: "a" }, { name: "b" }], ["b"], (folder) => folder.name), [{ name: "b" }, { name: "a" }]);
});

test("pinning adds below earlier pins, pinning again removes it", () => {
  assert.deepEqual(togglePinnedName([], "a"), ["a"]);
  assert.deepEqual(togglePinnedName(["a"], "b"), ["a", "b"]);
  assert.deepEqual(togglePinnedName(["a", "b"], "a"), ["b"]);
});

test("a renamed folder keeps its pin and its place", () => {
  assert.deepEqual(renamePinnedName(["a", "b", "c"], "b", "x"), ["a", "x", "c"]);
  assert.deepEqual(renamePinnedName(["a"], "z", "x"), ["a"]);
});

test("folders only move inside their own group", () => {
  const shown = ["p1", "p2", "a", "b"];
  const pins = ["p1", "p2"];
  assert.equal(sameFolderGroup(pins, "p1", "a"), false);
  assert.equal(sameFolderGroup(pins, "a", "b"), true);
  assert.equal(folderGroupNeighbour(shown, pins, "p2", 1), "");
  assert.equal(folderGroupNeighbour(shown, pins, "p2", -1), "p1");
  assert.equal(folderGroupNeighbour(shown, pins, "a", -1), "");
  assert.equal(folderGroupNeighbour(shown, pins, "a", 1), "b");
  assert.equal(folderGroupNeighbour(shown, pins, "b", 1), "");
});

test("stored pins are read safely", () => {
  assert.deepEqual(parseFolderPins(null), {});
  assert.deepEqual(parseFolderPins("not json"), {});
  assert.deepEqual(parseFolderPins(JSON.stringify({ snippet: ["a", "a", 3, ""], image: "x", other: ["y"] })), { snippet: ["a"] });
});
