// With 1,000+ snippets the list worked out each row's ↑/↓ and each folder's count by scanning the whole list again
// (O(n²) per render). These lookups are built once per list and must answer exactly what the per-row scan did.
import assert from "node:assert/strict";
import test from "node:test";
import { buildCardMoveMap, countItemsByFolder } from "../app/clipbox-core.ts";

// The per-row rule the page used before (canMoveCard in page.tsx).
function canMoveCardByScan(filtered, item, delta) {
  const group = filtered.filter((entry) => Boolean(entry.pinned) === Boolean(item.pinned));
  return Boolean(group[group.findIndex((entry) => entry.id === item.id) + delta]);
}

function randomList(size, seed) {
  let state = seed;
  const next = () => { state = (state * 1_103_515_245 + 12_345) % 2_147_483_648; return state / 2_147_483_648; };
  const folders = ["询盘接待", "售后", "", "物流"];
  return Array.from({ length: size }, (_, index) => ({ id: `id-${index}`, pinned: next() < 0.2 ? true : next() < 0.1 ? false : undefined, folder: folders[Math.floor(next() * folders.length)] }));
}

test("each card's up / down answer matches the old per-row scan, pinned and unpinned kept apart", () => {
  for (const [size, seed] of [[0, 1], [1, 2], [2, 3], [7, 4], [60, 5], [400, 6]]) {
    const list = randomList(size, seed);
    const moves = buildCardMoveMap(list);
    for (const item of list) {
      assert.equal(moves.get(item.id).up, canMoveCardByScan(list, item, -1), `${size}/${item.id} up`);
      assert.equal(moves.get(item.id).down, canMoveCardByScan(list, item, 1), `${size}/${item.id} down`);
    }
  }
});

test("a pinned card at the end of its group cannot step into the unpinned ones", () => {
  const moves = buildCardMoveMap([{ id: "a", pinned: true }, { id: "b", pinned: true }, { id: "c" }, { id: "d", pinned: false }]);
  assert.deepEqual(moves.get("a"), { up: false, down: true });
  assert.deepEqual(moves.get("b"), { up: true, down: false });
  assert.deepEqual(moves.get("c"), { up: false, down: true });
  assert.deepEqual(moves.get("d"), { up: true, down: false });
});

test("folder counts match counting each folder separately", () => {
  const list = randomList(500, 9);
  const counts = countItemsByFolder(list);
  for (const folder of ["询盘接待", "售后", "物流", "", "没有这个目录"]) {
    assert.equal(counts.get(folder) ?? 0, list.filter((item) => item.folder === folder).length, folder);
  }
});

test("3,000 cards: the lookup is built in a few milliseconds, not the old hundreds", () => {
  const list = randomList(3000, 11);
  const started = performance.now();
  buildCardMoveMap(list);
  countItemsByFolder(list);
  assert.ok(performance.now() - started < 200, "generous bound; the old scan took ~200 ms per render at this size");
});
