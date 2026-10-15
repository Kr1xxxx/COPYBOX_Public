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
  withNotice,
} from "../tools/website/sync.mjs";
import { parseSharedLibrary } from "../app/shared-library.ts";

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

test("sync --notice puts the approved 更新通知 in the upload with a new id; without it no notice goes up", async () => {
  const live = `sync/${code}/snippets.json`;
  const kv = fakeKv({ [live]: library(entry("A", "one")) });
  const next = library(entry("A", "one"), entry("B", "two"));
  const notice = join(mkdtempSync(join(tmpdir(), "clipbox-notice-")), "notice.txt");
  writeFileSync(notice, "- 新增 1 条话术\n\n- 新增 2 条 Tips\n");
  const at = Date.UTC(2026, 9, 15, 13, 40);
  const lines = await quiet(() => main(["--code", code, "--snippets", file(next), "--notice", notice], kv, at));
  assert.equal(lines[0], "notice  公司话术有更新: 新增 1 条话术 / 新增 2 条 Tips");
  const uploaded = JSON.parse(kv.store.get(live));
  assert.deepEqual(uploaded.notice, { id: `${code}-202610151340`, title: "公司话术有更新", items: ["新增 1 条话术", "新增 2 条 Tips"] });
  assert.equal(parseSharedLibrary(kv.store.get(live)).notice?.id, `${code}-202610151340`);

  const json = withNotice(next, JSON.stringify({ title: "新功能", items: ["话术可以分享了"] }), code, at);
  assert.equal(json.notice.title, "新功能");
  assert.throws(() => withNotice(next, "  \n", code, at), /at least one line/);
  assert.throws(() => withNotice("[]", "新增 1 条", code, at), /bare list/);

  await quiet(() => main(["--code", code, "--snippets", file(next)], kv, at + 60_000));
  assert.equal(JSON.parse(kv.store.get(live)).notice, undefined);
});

test("sync --link-domain binds an email domain to a code, prints before and after; --dry-run writes nothing", async () => {
  const other = "AB-OTHER000";
  const kv = fakeKv({ [`sync/${code}/snippets.json`]: emptyLibrary(), [`sync/${other}/snippets.json`]: emptyLibrary() });

  const dry = await quiet(() => main(["--link-domain", " Company.COM ", "--code", code.toLowerCase(), "--dry-run"], kv));
  assert.deepEqual(dry, ["before  company.com → (not bound)", `after   company.com → ${code} (dry run, nothing uploaded)`]);
  assert.equal(kv.store.has("domains/company.com"), false);

  await quiet(() => main(["--link-domain", "company.com", "--code", code], kv));
  assert.equal(kv.store.get("domains/company.com"), code);

  const moved = await quiet(() => main(["--link-domain", "company.com", "--code", other], kv));
  assert.deepEqual(moved, [`before  company.com → ${code}`, `after   company.com → ${other}`]);
  assert.equal(kv.store.get("domains/company.com"), other);

  await quiet(() => main(["--link-domain", "shop.example.cn", "--code", code], kv));
  assert.deepEqual(await quiet(() => main(["--list-domains"], kv)), [`company.com → ${other}`, `shop.example.cn → ${code}`]);
  assert.deepEqual(codesFromKeys([...kv.store.keys()]), [other, code], "domain keys are not codes");
  assert.deepEqual(await quiet(() => main(["--list-codes"], kv)), [other, code]);
});

test("sync --link-domain refuses invalid and free-mail domains and codes without a library", async () => {
  const kv = fakeKv({ [`sync/${code}/snippets.json`]: emptyLibrary() });
  for (const domain of ["localhost", "company..com", "-x.com", "a@company.com"]) {
    await assert.rejects(main(["--link-domain", domain, "--code", code], kv), /Not a valid domain/, domain);
  }
  await assert.rejects(main(["--link-domain", "--code", code], kv), /Not a valid domain/);
  for (const domain of ["gmail.com", "QQ.com", "163.com", "hotmail.fr", "copyboxx.com"]) {
    await assert.rejects(main(["--link-domain", domain, "--code", code], kv), /free-mail/, domain);
  }
  await assert.rejects(main(["--link-domain", "company.com", "--code", "AB-NOPE0000"], kv), /has no library/);
  await assert.rejects(main(["--link-domain", "company.com", "--code", "../x"], kv), /valid code/);
  await assert.rejects(main(["--link-domain", "company.com"], kv), /valid code/);
  assert.deepEqual([...kv.store.keys()], [`sync/${code}/snippets.json`]);
});

test("sync --unlink-domain removes a binding; --dry-run keeps it; an unbound domain is an error", async () => {
  const kv = fakeKv({ [`sync/${code}/snippets.json`]: emptyLibrary(), "domains/company.com": code });
  const dry = await quiet(() => main(["--unlink-domain", "COMPANY.com", "--dry-run"], kv));
  assert.deepEqual(dry, [`unlink  company.com → ${code} (dry run, nothing uploaded)`]);
  assert.equal(kv.store.get("domains/company.com"), code);
  await quiet(() => main(["--unlink-domain", "company.com"], kv));
  assert.equal(kv.store.has("domains/company.com"), false);
  await assert.rejects(main(["--unlink-domain", "company.com"], kv), /not bound/);
  await assert.rejects(main(["--unlink-domain", "not a domain"], kv), /Not a valid domain/);
  assert.deepEqual(await quiet(() => main(["--list-domains"], kv)), []);
});

test("sync without a command names every option", async () => {
  const kv = fakeKv({ [`sync/${code}/snippets.json`]: emptyLibrary() });
  await assert.rejects(main(["--code", code], kv), /--snippets.*--link-domain.*--unlink-domain.*--list-domains/);
});
