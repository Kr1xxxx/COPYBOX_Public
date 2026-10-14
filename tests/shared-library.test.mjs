import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptSharedUpdate, contentHash, contentOf, describeSync, exportSharedLibrary, keepMySharedVersion, parseSharedLibrary, sharedMark, sharedSourceUrl, syncSharedLibrary,
} from "../app/shared-library.ts";

let counter = 0;
const options = (seen = []) => ({ createId: () => `local-${++counter}`, now: 1000, seen: new Set(seen) });
const entry = (id, over = {}) => ({ id, label: `L-${id}`, secret: `Hello [Name] ${id}`, folder: "询盘接待", ...over });
const file = (entries) => JSON.stringify({ format: "clipbox-shared-library", version: 1, items: entries });
const sync = (items, entries, seen) => syncSharedLibrary(items, parseSharedLibrary(file(entries)).items, 0, options(seen));
const mine = { id: "mine", label: "我自己的", secret: "personal text", note: "", color: "#fff", kind: "snippet", folder: "客户跟进", pinned: true, lastUsedAt: 5, createdAt: 1, updatedAt: 1 };

test("parsing reads a library file, fills in the gaps and skips broken or duplicate entries", () => {
  const { items, skipped } = parseSharedLibrary(file([entry("a"), entry("a"), { id: "x" }, entry("b", { folder: "不存在的目录" })]));
  assert.equal(items.length, 2);
  assert.equal(skipped, 2);
  assert.deepEqual(items[0].placeholders, ["Name"]);
  assert.equal(items[1].folder, "询盘接待");
  assert.throws(() => parseSharedLibrary("not json"), /公司话术库/);
  assert.throws(() => parseSharedLibrary("{}"), /公司话术库/);
});

test("the first sync adds every entry and leaves personal 话术 alone", () => {
  const result = sync([mine], [entry("a"), entry("b")]);
  assert.equal(result.summary.added, 2);
  assert.equal(result.items.length, 3);
  assert.deepEqual(result.items.find((item) => item.id === "mine"), mine);
  const added = result.items.find((item) => item.shared?.id === "a");
  assert.equal(added.kind, "snippet");
  assert.equal(added.snippetMeta.stage, "询盘接待");
  assert.equal(sharedMark(added), null);
});

test("syncing again with the same file changes nothing", () => {
  const first = sync([mine], [entry("a")]);
  const again = sync(first.items, [entry("a")], first.seen);
  assert.deepEqual(again.items, first.items);
  assert.equal(describeSync(again.summary), "已是最新，没有变化");
});

test("an entry the employee never touched is updated, keeping their folder, favourite and use time", () => {
  const first = sync([], [entry("a")]);
  const own = first.items[0];
  const arranged = [{ ...own, folder: "报价成交", pinned: true, lastUsedAt: 99 }];
  const result = sync(arranged, [entry("a", { secret: "New text [Name]", label: "New title" })], first.seen);
  assert.equal(result.summary.updated, 1);
  const updated = result.items[0];
  assert.equal(updated.secret, "New text [Name]");
  assert.equal(updated.label, "New title");
  assert.equal(updated.folder, "报价成交");
  assert.equal(updated.pinned, true);
  assert.equal(updated.lastUsedAt, 99);
  assert.equal(updated.id, own.id);
});

test("an entry the employee edited keeps their version; the company version waits and can be chosen later", () => {
  const first = sync([], [entry("a")]);
  const edited = [{ ...first.items[0], secret: "My own wording [Name]" }];
  const result = sync(edited, [entry("a", { secret: "Company v2 [Name]" })], first.seen);
  assert.equal(result.summary.keptMine, 1);
  assert.equal(result.summary.updated, 0);
  const item = result.items[0];
  assert.equal(item.secret, "My own wording [Name]");
  assert.equal(sharedMark(item), "update");
  assert.equal(item.shared.pending.content.secret, "Company v2 [Name]");
  // the same company version is not counted twice
  assert.equal(sync(result.items, [entry("a", { secret: "Company v2 [Name]" })], result.seen).summary.keptMine, 0);
  // choosing the company version applies it and clears the mark
  const accepted = acceptSharedUpdate(item, 2000);
  assert.equal(accepted.secret, "Company v2 [Name]");
  assert.equal(sharedMark(accepted), null);
  assert.equal(sync([accepted], [entry("a", { secret: "Company v2 [Name]" })], result.seen).summary.updated, 0);
});

test("keeping my version sets the company version aside until the company changes it again", () => {
  const first = sync([], [entry("a")]);
  const edited = [{ ...first.items[0], secret: "Mine [Name]" }];
  const held = sync(edited, [entry("a", { secret: "Company v2 [Name]" })], first.seen);
  const kept = keepMySharedVersion(held.items[0]);
  assert.equal(kept.secret, "Mine [Name]");
  assert.equal(sharedMark(kept), null);
  assert.equal(sync([kept], [entry("a", { secret: "Company v2 [Name]" })], first.seen).summary.keptMine, 0);
  assert.equal(sync([kept], [entry("a", { secret: "Company v3 [Name]" })], first.seen).summary.keptMine, 1);
});

test("a waiting company version is dropped when the company goes back to the text this device has", () => {
  const first = sync([], [entry("a")]);
  const edited = [{ ...first.items[0], secret: "Mine [Name]" }];
  const held = sync(edited, [entry("a", { secret: "Company v2 [Name]" })], first.seen);
  const back = sync(held.items, [entry("a")], first.seen);
  assert.equal(sharedMark(back.items[0]), null);
  assert.equal(back.items[0].secret, "Mine [Name]");
});

test("an entry the company removed is only marked 公司已停用, never deleted, and comes back if re-added", () => {
  const first = sync([mine], [entry("a"), entry("b")]);
  const result = sync(first.items, [entry("a")], first.seen);
  assert.equal(result.items.length, first.items.length);
  assert.equal(result.summary.retired, 1);
  const gone = result.items.find((item) => item.shared?.id === "b");
  assert.equal(sharedMark(gone), "retired");
  assert.equal(sync(result.items, [entry("a")], result.seen).summary.retired, 0);
  const back = sync(result.items, [entry("a"), entry("b")], result.seen);
  assert.equal(back.summary.restored, 1);
  assert.equal(sharedMark(back.items.find((item) => item.shared?.id === "b")), null);
  // an empty company file marks everything as stopped but still deletes nothing
  const empty = sync(first.items, [], first.seen);
  assert.equal(empty.items.length, first.items.length);
  assert.deepEqual(empty.items.find((item) => item.id === "mine"), mine);
});

test("a 话术 the employee deleted does not come back, whether it sits in the trash or was removed for good", () => {
  const first = sync([], [entry("a"), entry("b")]);
  const trashed = first.items.map((item) => item.shared.id === "a" ? { ...item, deletedAt: 5 } : item);
  const purged = trashed.filter((item) => item.shared.id !== "b");
  const result = sync(purged, [entry("a", { secret: "changed [Name]" }), entry("b")], first.seen);
  assert.equal(result.summary.added, 0);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].deletedAt, 5);
  assert.equal(result.items[0].secret, first.items.find((item) => item.shared.id === "a").secret);
});

test("exporting writes a library file that another app reads back as the same entries", () => {
  const first = sync([mine], [entry("a")]);
  const exported = exportSharedLibrary([...first.items, { ...first.items[0], id: "gone", deletedAt: 1 }], 7);
  const { items } = parseSharedLibrary(exported);
  // the trashed copy is left out; company entries keep their company id, own 话术 get their own id
  assert.deepEqual(items.map((item) => item.id).sort(), ["a", "mine"]);
  const a = items.find((item) => item.id === "a");
  assert.equal(contentHash(a), contentHash(contentOf(first.items.find((item) => item.shared?.id === "a"))));
});

test("a 同步码 picks its group's file on copyboxx.com; a full address is used as typed", () => {
  assert.equal(sharedSourceUrl(" xs-7kq2m9ab "), "https://copyboxx.com/sync/XS-7KQ2M9AB/snippets.json");
  assert.equal(sharedSourceUrl("https://company.example/library.json"), "https://company.example/library.json");
  assert.equal(sharedSourceUrl(""), "");
  // too short, or anything that could walk out of the folder, is not a code
  assert.equal(sharedSourceUrl("abc"), "abc");
  assert.equal(sharedSourceUrl("../admin"), "../admin");
});
