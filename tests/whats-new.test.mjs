import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { parseSharedLibrary } from "../app/shared-library.ts";
import {
  WHATS_NEW_KEY, WHATS_NEW_MAX_ITEMS, appNotice, compareVersions, markNoticeSeen, parseContentNotice, takeAppNotice, takeContentNotice,
} from "../app/whats-new.ts";

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
beforeEach(() => store.clear());
const seen = () => JSON.parse(store.get(WHATS_NEW_KEY) || "{}");

const NOTES = [
  { version: "1.101.0", items: ["新增：话术可以分享给同事"] },
  { version: "1.100.0", items: ["新增 12 条话术", "新增 5 条 Tips"] },
  { version: "1.99.0", items: ["设置 → 数据 可以导入 Tips"] },
];

test("versions compare by number, so 1.100 is newer than 1.99", () => {
  assert.equal(compareVersions("1.100.0", "1.99.0"), 1);
  assert.equal(compareVersions("v1.99", "1.99.0"), 0);
  assert.equal(compareVersions("1.98.0", "1.99.0"), -1);
});

test("an update shows the lines of every version since the last one seen, newest first", () => {
  assert.deepEqual(appNotice(NOTES, "1.98.0", "1.100.0")?.items, ["新增 12 条话术", "新增 5 条 Tips", "设置 → 数据 可以导入 Tips"]);
  assert.equal(appNotice(NOTES, "1.100.0", "1.100.0"), null);
  assert.equal(appNotice(NOTES, undefined, "1.100.0")?.items.length, 2);
  assert.equal(appNotice(NOTES, "1.98.0", "网页测试版"), null);
  assert.equal(appNotice([], "1.98.0", "1.100.0"), null);
  const many = [{ version: "2.0.0", items: Array.from({ length: 9 }, (_, index) => `第 ${index} 条`) }];
  assert.equal(appNotice(many, "1.0.0", "2.0.0")?.items.length, WHATS_NEW_MAX_ITEMS);
});

test("a new install shows nothing; an update shows once, after 知道了 it is gone", () => {
  assert.equal(takeAppNotice(NOTES, "1.100.0", true), null);
  assert.equal(seen().version, "1.100.0");
  store.clear();

  // Updated from a build that never stored a version: only this version's lines.
  const first = takeAppNotice(NOTES, "1.100.0", false);
  assert.deepEqual(first?.items, ["新增 12 条话术", "新增 5 条 Tips"]);
  assert.equal(seen().version, undefined, "not seen until 知道了");
  assert.deepEqual(takeAppNotice(NOTES, "1.100.0", false), first, "asking again gives the same answer");
  markNoticeSeen(first);
  assert.equal(takeAppNotice(NOTES, "1.100.0", false), null);

  const next = takeAppNotice(NOTES, "1.101.0", false);
  assert.deepEqual(next?.items, ["新增：话术可以分享给同事"]);
  markNoticeSeen(next);
  // A version without lines (a fix release) is remembered silently.
  assert.equal(takeAppNotice(NOTES, "1.102.0", false), null);
  assert.equal(seen().version, "1.102.0");
});

test("a 同步码 notice needs an id and at least one line; long text is cut", () => {
  assert.equal(parseContentNotice({ items: ["新增 3 条话术"] }), null);
  assert.equal(parseContentNotice({ id: "x", items: ["", "  "] }), null);
  assert.equal(parseContentNotice("新增"), null);
  const notice = parseContentNotice({ id: "XS-1", items: ["  新增   3 条话术 ", 7, "字".repeat(200)] });
  assert.equal(notice.title, "公司话术有更新");
  assert.equal(notice.items[0], "新增 3 条话术");
  assert.equal(notice.items.length, 2);
  assert.equal(notice.items[1].length, 80);
});

test("a 同步码 notice shows once, and not on a device that is getting this library for the first time", () => {
  const notice = parseContentNotice({ id: "XS-202610151340", items: ["新增 3 条话术"] });
  assert.equal(takeContentNotice(notice, false), null);
  assert.equal(seen().content, notice.id);
  assert.equal(takeContentNotice(notice, true), null, "already remembered");
  store.clear();
  assert.equal(takeContentNotice(notice, true), notice);
  markNoticeSeen(notice);
  assert.equal(takeContentNotice(notice, true), null);
  assert.equal(takeContentNotice(null, true), null);
});

test("the library file carries the notice; a broken notice never breaks the 话术", () => {
  const file = (notice) => JSON.stringify({ format: "clipbox-shared-library", version: 1, notice, items: [{ id: "A", label: "L", secret: "Hi" }] });
  assert.deepEqual(parseSharedLibrary(file({ id: "n1", title: "新功能", items: ["话术可以分享了"] })).notice, { kind: "content", id: "n1", title: "新功能", items: ["话术可以分享了"] });
  const broken = parseSharedLibrary(file({ items: "oops" }));
  assert.equal(broken.notice, null);
  assert.equal(broken.items.length, 1);
  assert.equal(parseSharedLibrary(JSON.stringify([{ id: "A", label: "L", secret: "Hi" }])).notice, null);
});
