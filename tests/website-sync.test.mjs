import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  codesFromKeys,
  diffLibraries,
  emptyLibrary,
  historyKey,
  main,
  namespaceId,
  newCode,
  newestHistoryKey,
  normalizeCode,
  validateLibrary,
} from "../tools/website/sync.mjs";

const code = "XS-TEST0000";
const entry = (id, secret, extra = {}) => ({ id, label: `公司 · ${id}`, secret, ...extra });
const library = (...items) => JSON.stringify({ format: "clipbox-shared-library", version: 1, items });

function fakeKv(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async put(key, text) { store.set(key, text); },
    async remove(key) { store.delete(key); },
    async list(prefix) { return [...store.keys()].filter((key) => key.startsWith(prefix)).sort(); },
  };
}

function file(text) {
  const path = join(mkdtempSync(join(tmpdir(), "clipbox-sync-")), "snippets.json");
  writeFileSync(path, text);
  return path;
}

async function quiet(run) {
  const log = console.log;
  const lines = [];
  console.log = (...args) => lines.push(args.join(" "));
  try { await run(); } finally { console.log = log; }
  return lines;
}

test("sync codes: two letters, a dash and eight Crockford base32 characters from the RNG", () => {
  const code = newCode("xs");
  assert.match(code, /^XS-[0-9A-HJKMNP-TV-Z]{8}$/);
  assert.equal(newCode("AB", () => 0), "AB-00000000");
  assert.equal(newCode("AB", (n) => n - 1), "AB-ZZZZZZZZ");
  assert.notEqual(newCode("AB"), newCode("AB"));
  assert.throws(() => newCode("X"), /two letters/);
  assert.throws(() => newCode("X1"), /two letters/);
  assert.equal(normalizeCode(" xs-7kq2m9ab "), "XS-7KQ2M9AB");
  assert.throws(() => normalizeCode("ab"), /valid code/);
  assert.throws(() => normalizeCode("../../x"), /valid code/);
});

test("sync keys: history names sort by time, codes come from library keys only", () => {
  assert.equal(historyKey(code, Date.UTC(2026, 9, 14, 3, 4, 5)), `sync/${code}/history/snippets-2026-10-14T03:04:05.000Z.json`);
  const keys = [
    `sync/${code}/history/snippets-2026-10-14T03:00:00.000Z.json`,
    `sync/${code}/history/snippets-2026-10-15T01:00:00.000Z.json`,
    `sync/${code}/history/replaced-2026-10-16T01:00:00.000Z.json`,
  ];
  assert.equal(newestHistoryKey(keys, code), keys[1]);
  assert.equal(newestHistoryKey([], code), null);
  assert.deepEqual(codesFromKeys(["sync/B-123456/snippets.json", `sync/${code}/snippets.json`, ...keys, "index.html"]), ["B-123456", code]);
  assert.equal(namespaceId('{\n  // comment\n  "kv_namespaces": [{ "binding": "FILES", "id": "abc" }]\n}'), "abc");
});

test("sync validation uses the app's rules and refuses entries the app would skip", () => {
  assert.deepEqual(validateLibrary(emptyLibrary()), []);
  assert.equal(validateLibrary(library(entry("CO-1", "Hi"))).length, 1);
  assert.throws(() => validateLibrary(library(entry("CO-1", "Hi"), entry("CO-1", "Again"))), /1 entry/);
  assert.throws(() => validateLibrary(library({ id: "CO-2", label: "x" })), /missing id, label or secret/);
  assert.throws(() => validateLibrary("not json"), /有效的公司话术库文件/);
});

test("sync diff lists added, changed (text or folder) and removed ids", () => {
  const before = validateLibrary(library(entry("A", "one"), entry("B", "two"), entry("C", "three", { folder: "询盘接待" })));
  const after = validateLibrary(library(entry("A", "one"), entry("B", "two!"), entry("C", "three", { folder: "报价" }), entry("D", "four")));
  const diff = diffLibraries(before, after);
  assert.deepEqual(diff.added, ["D"]);
  assert.deepEqual(diff.removed, []);
  assert.ok(diff.changed.includes("B"));
  assert.deepEqual(diffLibraries(after, before).removed, ["D"]);
});

test("sync --new-code writes an empty library; --dry-run writes nothing", async () => {
  const dry = fakeKv();
  const lines = await quiet(() => main(["--new-code", "XS", "--dry-run"], dry));
  assert.equal(dry.store.size, 0);
  assert.match(lines[0], /^code XS-[0-9A-Z]{8} \(dry run/);
  const kv = fakeKv();
  await quiet(() => main(["--new-code", "XS"], kv));
  const [key] = kv.store.keys();
  assert.match(key, /^sync\/XS-[0-9A-Z]{8}\/snippets\.json$/);
  assert.equal(kv.store.get(key), emptyLibrary());
  assert.deepEqual(JSON.parse(kv.store.get(key)), { format: "clipbox-shared-library", version: 1, items: [] });
});

test("sync publish keeps the online version as history, then rollback restores it", async () => {
  const live = `sync/${code}/snippets.json`;
  const kv = fakeKv({ [live]: library(entry("A", "one")) });
  const next = library(entry("A", "one"), entry("B", "two"));

  const dry = await quiet(() => main(["--code", code.toLowerCase(), "--snippets", file(next), "--dry-run"], kv));
  assert.deepEqual(dry.slice(0, 3), ["added   1: B", "changed 0", "removed 0"]);
  assert.equal(kv.store.size, 1);

  const t1 = Date.UTC(2026, 9, 14, 1);
  await quiet(() => main(["--code", code, "--snippets", file(next)], kv, t1));
  assert.equal(kv.store.get(live), next);
  assert.equal(kv.store.get(historyKey(code, t1)), library(entry("A", "one")));

  await assert.rejects(main(["--code", code, "--snippets", file(library({ id: "X" }))], kv), /missing/);
  assert.equal(kv.store.get(live), next);

  const lines = await quiet(() => main(["--code", code, "--rollback"], kv, Date.UTC(2026, 9, 14, 2)));
  assert.equal(lines[2], "removed 1: B");
  assert.equal(kv.store.get(live), library(entry("A", "one")));
  assert.equal(kv.store.has(historyKey(code, t1)), false);
  assert.equal(kv.store.get(`sync/${code}/history/replaced-2026-10-14T02:00:00.000Z.json`), next);
  await assert.rejects(main(["--code", code, "--rollback"], kv), /no history/);
});

test("sync refuses unknown codes and lists codes for agents", async () => {
  const kv = fakeKv({ [`sync/${code}/snippets.json`]: emptyLibrary(), [`sync/${code}/history/snippets-x.json`]: emptyLibrary() });
  await assert.rejects(main(["--code", "AB-NOPE0000", "--snippets", file(emptyLibrary())], kv), /does not exist/);
  assert.deepEqual(await quiet(() => main(["--list-codes"], kv)), [code]);
});
