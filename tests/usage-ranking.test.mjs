import assert from "node:assert/strict";
import test from "node:test";
import { rankUsage, recordCopy, USAGE_REPEAT_WINDOW_MS } from "../app/usage-ranking.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;
const snippet = (id, extra = {}) => ({ id, label: id, secret: "x", note: "", color: "", kind: "snippet", createdAt: 1, updatedAt: 1, ...extra });

test("recordCopy counts a first copy and later copies, but a repeat within a minute counts once", () => {
  const first = recordCopy(snippet("a"), NOW);
  assert.equal(first.useCount, 1);
  assert.equal(first.lastUsedAt, NOW);
  const again = recordCopy(first, NOW + 10_000);
  assert.equal(again, first);
  assert.equal(recordCopy(first, NOW + USAGE_REPEAT_WINDOW_MS - 1).useCount, 1);
  const later = recordCopy(first, NOW + USAGE_REPEAT_WINDOW_MS);
  assert.equal(later.useCount, 2);
  assert.equal(later.lastUsedAt, NOW + USAGE_REPEAT_WINDOW_MS);
});

test("recordCopy counts the first copy of an item that has an old time but no count", () => {
  assert.equal(recordCopy(snippet("a", { lastUsedAt: NOW }), NOW + 5).useCount, 1);
});

test("rankUsage: most used first, 30 days idle, never used; secrets and trash are left out", () => {
  const items = [
    snippet("often", { useCount: 9, lastUsedAt: NOW - DAY }),
    snippet("some", { useCount: 3, lastUsedAt: NOW - 2 * DAY }),
    snippet("old", { useCount: 1, lastUsedAt: NOW - 31 * DAY }),
    snippet("older", { useCount: 4, lastUsedAt: NOW - 60 * DAY }),
    snippet("edge", { useCount: 1, lastUsedAt: NOW - 30 * DAY }),
    snippet("fresh29", { useCount: 1, lastUsedAt: NOW - 29 * DAY }),
    snippet("new1", { createdAt: 5 }),
    snippet("new2", { createdAt: 9 }),
    snippet("gone", { useCount: 50, lastUsedAt: NOW, deletedAt: 7 }),
    { ...snippet("secret", { useCount: 70 }), kind: "secret" },
  ];
  const { top, stale, never } = rankUsage(items, NOW);
  assert.deepEqual(top.map((i) => i.id), ["often", "older", "some", "fresh29", "edge", "old"]);
  assert.deepEqual(stale.map((i) => i.id), ["older", "old", "edge"]);
  assert.deepEqual(never.map((i) => i.id), ["new2", "new1"]);
});

test("rankUsage keeps only the 10 most used", () => {
  const items = Array.from({ length: 15 }, (_, n) => snippet(`s${n}`, { useCount: n + 1, lastUsedAt: NOW }));
  const { top } = rankUsage(items, NOW);
  assert.equal(top.length, 10);
  assert.equal(top[0].id, "s14");
});
