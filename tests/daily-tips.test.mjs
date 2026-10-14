import assert from "node:assert/strict";
import test from "node:test";
import { BUILT_IN_TIPS, TIPS_FORMAT, TIPS_KEY, TIPS_URL, mergeServerTips, mergeTips, parseTipsFile, pickTipForDay, readTipsState, tipsLibrary, todayKey, writeTipsState } from "../app/daily-tips.ts";

const fresh = () => ({ version: 1, extra: [], shownId: "", shownDate: "" });
const memory = (initial) => { const map = new Map(initial ? [[TIPS_KEY, initial]] : []); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), map }; };
const tip = (id, title = `标题${id}`, text = `内容${id}`) => ({ id, title, text });
const file = (items, extra = {}) => JSON.stringify({ format: TIPS_FORMAT, version: 1, items, ...extra });
const length = (text) => [...text].length;

test("the built-in tips: at least 25, stable unique ids, short titles and texts", () => {
  assert.ok(BUILT_IN_TIPS.length >= 25);
  assert.equal(new Set(BUILT_IN_TIPS.map((entry) => entry.id)).size, BUILT_IN_TIPS.length);
  BUILT_IN_TIPS.forEach((entry, index) => {
    assert.equal(entry.id, `T-${String(index + 1).padStart(3, "0")}`);
    assert.ok(entry.title.trim() && entry.text.trim(), entry.id);
    assert.ok(length(entry.title) <= 12, `${entry.id} title is ${length(entry.title)} long`);
    assert.ok(length(entry.text) <= 120, `${entry.id} text is ${length(entry.text)} long`);
  });
});

test("no tip advertises a key or shortcut (D-005), and English is limited to the product name and TinyPNG", () => {
  for (const entry of BUILT_IN_TIPS) {
    const words = `${entry.title} ${entry.text}`;
    for (const banned of ["Enter", "Esc", "Ctrl", "Cmd", "Shift", "Alt", "⌘", "快捷键", "按键", "回车", "方向键"]) assert.ok(!words.includes(banned), `${entry.id} mentions ${banned}`);
    const english = words.match(/[A-Za-z]{2,}/g) || [];
    for (const word of english) assert.ok(["Copyboxx", "TinyPNG", "AI", "tk"].includes(word), `${entry.id} uses ${word}`);
  }
});

test("online updates are off until the company address is filled in", () => {
  assert.equal(TIPS_URL, "");
  assert.equal(TIPS_KEY, "clipbox.tips.v1");
});

test("the same day keeps the same tip and the same state", () => {
  const first = pickTipForDay(fresh(), "2026-10-13");
  assert.equal(first.tip.id, BUILT_IN_TIPS[0].id);
  assert.equal(first.state.shownId, BUILT_IN_TIPS[0].id);
  assert.equal(first.state.shownDate, "2026-10-13");
  const again = pickTipForDay(first.state, "2026-10-13");
  assert.equal(again.tip.id, BUILT_IN_TIPS[0].id);
  assert.equal(again.state, first.state);
});

test("a new day moves exactly one step, however many days passed", () => {
  const state = { ...fresh(), shownId: "T-004", shownDate: "2026-10-01" };
  const next = pickTipForDay(state, "2026-10-13");
  assert.equal(next.tip.id, "T-005");
  assert.equal(next.state.shownDate, "2026-10-13");
  assert.equal(pickTipForDay(next.state, "2026-10-14").tip.id, "T-006");
});

test("after the last tip comes the first again", () => {
  const last = BUILT_IN_TIPS.at(-1).id;
  assert.equal(pickTipForDay({ ...fresh(), shownId: last, shownDate: "2026-10-12" }, "2026-10-13").tip.id, BUILT_IN_TIPS[0].id);
  // A server tip at the end of the library comes after the last built-in one, then the first again.
  const state = { ...fresh(), extra: [tip("S-1")], shownId: last, shownDate: "2026-10-12" };
  const server = pickTipForDay(state, "2026-10-13");
  assert.equal(server.tip.id, "S-1");
  assert.equal(pickTipForDay(server.state, "2026-10-14").tip.id, BUILT_IN_TIPS[0].id);
});

test("an unknown shown tip starts again at the first, even on the same day", () => {
  const picked = pickTipForDay({ ...fresh(), shownId: "gone", shownDate: "2026-10-13" }, "2026-10-13");
  assert.equal(picked.tip.id, BUILT_IN_TIPS[0].id);
  assert.equal(picked.state.shownId, BUILT_IN_TIPS[0].id);
});

test("a library of one tip shows it every day", () => {
  const original = BUILT_IN_TIPS.splice(0, BUILT_IN_TIPS.length, tip("only"));
  try {
    let state = fresh();
    for (const day of ["2026-10-13", "2026-10-14", "2026-10-20"]) {
      const picked = pickTipForDay(state, day);
      assert.equal(picked.tip.id, "only");
      state = picked.state;
    }
  } finally {
    BUILT_IN_TIPS.splice(0, BUILT_IN_TIPS.length, ...original);
  }
});

test("mergeTips: known ids change in place, new ids go at the end, nothing is removed", () => {
  const current = [tip("a"), tip("b"), tip("c")];
  const merged = mergeTips(current, [tip("d"), tip("b", "新标题", "新内容"), tip("e")]);
  assert.deepEqual(merged.map((entry) => entry.id), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(merged[1], tip("b", "新标题", "新内容"));
  assert.deepEqual(current[1], tip("b"), "the input is not changed");
  assert.deepEqual(mergeTips(current, []).map((entry) => entry.id), ["a", "b", "c"]);
});

test("parseTipsFile accepts our file and skips bad or repeated entries", () => {
  const items = [
    { id: " A-1 ", title: " 第一条 ", text: " 内容一 " },
    { id: "A-2", title: "", text: "没有标题" },
    { id: "A-3", title: "标题太长了标题太长了标题太长", text: "内容" },
    { id: "A-4", title: "太长的内容", text: "字".repeat(201) },
    { id: "", title: "没有编号", text: "内容" },
    { id: "x".repeat(41), title: "编号太长", text: "内容" },
    { id: 5, title: "编号不是文字", text: "内容" },
    "不是对象",
    { id: "A-1", title: "重复", text: "重复的编号" },
    { id: "A-5", title: "长一点也行", text: "字".repeat(200) },
  ];
  const parsed = parseTipsFile(file(items));
  assert.deepEqual(parsed.map((entry) => entry.id), ["A-1", "A-5"]);
  assert.deepEqual(parsed[0], { id: "A-1", title: "第一条", text: "内容一" });
});

test("parseTipsFile throws on anything that is not a tips file", () => {
  assert.throws(() => parseTipsFile("不是 JSON"), /不是有效的 tips 文件/);
  assert.throws(() => parseTipsFile(JSON.stringify({ format: "clipbox-shared-library", version: 1, items: [] })), /不是有效的 tips 文件/);
  assert.throws(() => parseTipsFile(JSON.stringify({ format: TIPS_FORMAT, version: 1 })), /不是有效的 tips 文件/);
  assert.throws(() => parseTipsFile("null"), /不是有效的 tips 文件/);
  assert.throws(() => parseTipsFile(file([], { version: 2 })), /版本/);
});

test("readTipsState tolerates garbage and drops bad stored tips", () => {
  for (const stored of [null, "", "{", "[]", "42", JSON.stringify({ version: 2 }), JSON.stringify({ version: 1, extra: "x", shownId: 3, shownDate: "yesterday" })]) {
    assert.deepEqual(readTipsState(memory(stored)), fresh(), String(stored));
  }
  const state = readTipsState(memory(JSON.stringify({ version: 1, extra: [tip("S-1"), { id: "S-2" }, "x"], shownId: "T-002", shownDate: "2026-10-12", fetchedDate: "2026-10-12" })));
  assert.deepEqual(state, { version: 1, extra: [tip("S-1")], shownId: "T-002", shownDate: "2026-10-12", fetchedDate: "2026-10-12" });
  assert.deepEqual(readTipsState({ getItem: () => { throw new Error("blocked"); } }), fresh());
});

test("writeTipsState stores plain JSON under clipbox.tips.v1 and survives a blocked storage", () => {
  const storage = memory();
  const state = { ...fresh(), shownId: "T-003", shownDate: "2026-10-13" };
  writeTipsState(state, storage);
  assert.deepEqual(JSON.parse(storage.map.get("clipbox.tips.v1")), state);
  assert.deepEqual(readTipsState(storage), state);
  assert.doesNotThrow(() => writeTipsState(state, { setItem: () => { throw new Error("full"); } }));
});

test("mergeServerTips adds new tips, can rewrite a built-in tip, and notes the day", () => {
  const before = { ...fresh(), extra: [tip("S-1")], shownId: "T-001", shownDate: "2026-10-13" };
  const after = mergeServerTips(before, file([tip("T-002", "公司版标题", "公司版内容"), tip("S-1", "改过", "改过的内容"), tip("S-2")]), "2026-10-13");
  assert.equal(after.fetchedDate, "2026-10-13");
  assert.equal(after.shownId, "T-001");
  assert.deepEqual(after.extra.map((entry) => entry.id), ["S-1", "T-002", "S-2"]);
  const library = tipsLibrary(after);
  assert.equal(library.length, BUILT_IN_TIPS.length + 2);
  assert.deepEqual(library[1], tip("T-002", "公司版标题", "公司版内容"));
  assert.deepEqual(library.at(-2), tip("S-1", "改过", "改过的内容"));
  assert.throws(() => mergeServerTips(before, "{}", "2026-10-13"));
});

test("todayKey is the local calendar day", () => {
  assert.equal(todayKey(new Date(2026, 0, 5, 0, 0, 1)), "2026-01-05");
  assert.equal(todayKey(new Date(2026, 11, 31, 23, 59, 59)), "2026-12-31");
});
