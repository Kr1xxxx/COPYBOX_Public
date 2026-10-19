import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_VALUES, FIXED_OPTIONS, NAME_OPTIONS, fixedOptions, isFixedOption, deleteValue, memoryOptions, moveOption, parsePinned, rememberValues, togglePin } from "../app/variable-memory.ts";

test("a block remembers its last three values, newest first", () => {
  let memory = {};
  for (const value of ["A", "B", "C", "D"]) memory = rememberValues(memory, { Name: value });
  assert.deepEqual(memory.Name, ["D", "C", "B"]);
  memory = rememberValues(memory, { Name: "B" });
  assert.deepEqual(memory.Name, ["B", "D", "C"]);
});

test("a pinned value is never pushed out", () => {
  let memory = rememberValues({}, { Name: "Old" });
  const pinned = togglePin(memory, {}, "Name", "Old");
  assert.equal(pinned.result, "pinned");
  memory = pinned.memory;
  for (const value of ["A", "B", "C", "D", "E"]) memory = rememberValues(memory, { Name: value }, pinned.pins);
  assert.ok(memory.Name.includes("Old"));
  assert.equal(memory.Name.length, 3);
  assert.deepEqual(memoryOptions(memory, pinned.pins, "Name")[0], "Old");
});

test("pinning twice unpins; an empty value cannot be pinned; three pinned values leave no room", () => {
  let state = { memory: {}, pins: {} };
  for (const value of ["A", "B", "C"]) { const next = togglePin(state.memory, state.pins, "Name", value); assert.equal(next.result, "pinned"); state = next; }
  assert.equal(togglePin(state.memory, state.pins, "Name", "D").result, "full");
  assert.equal(togglePin(state.memory, state.pins, "Name", " ").result, "empty");
  // with everything pinned a new value is not kept, and nothing pinned is lost
  const kept = rememberValues(state.memory, { Name: "D" }, state.pins);
  assert.deepEqual([...kept.Name].sort(), ["A", "B", "C"]);
  assert.equal(togglePin(state.memory, state.pins, "Name", "A").result, "unpinned");
});

test("Name starts with Beautiful, Friend and Lovely, and Friend is the default", () => {
  assert.deepEqual([...NAME_OPTIONS], ["Beautiful", "Friend", "Lovely"]);
  assert.equal(DEFAULT_VALUES.Name, "Friend");
});

test("pinned values come back after a reload, the recent ones do not", () => {
  const { pins } = togglePin({}, {}, "Name", "Amanda");
  const stored = JSON.stringify(pins);
  assert.deepEqual(parsePinned(stored), { Name: ["Amanda"] });
  assert.deepEqual(parsePinned("not json"), {});
  assert.deepEqual(parsePinned('{"Name":["a","a"," ",5,"b","c","d"]}'), { Name: ["a", "b", "c"] });
  assert.deepEqual(memoryOptions({}, pins, "Name"), ["Amanda"]);
});

test("a value can be deleted from the list and from the pinned ones", () => {
  let state = { memory: rememberValues({}, { Name: "A" }), pins: {} };
  state = { ...state, ...togglePin(state.memory, state.pins, "Name", "A") };
  state.memory = rememberValues(state.memory, { Name: "B" }, state.pins);
  const left = deleteValue(state.memory, state.pins, "Name", "A");
  assert.deepEqual(memoryOptions(left.memory, left.pins, "Name"), ["B"]);
  assert.deepEqual(left.pins.Name, []);
});

test("dragging moves a value inside its group only; pinned values stay in front", () => {
  let memory = {};
  for (const value of ["A", "B", "C"]) memory = rememberValues(memory, { Name: value });
  // newest first: C B A
  assert.deepEqual(memoryOptions(memory, {}, "Name"), ["C", "B", "A"]);
  let moved = moveOption(memory, {}, "Name", "A", "C");
  assert.deepEqual(memoryOptions(moved.memory, moved.pins, "Name"), ["A", "C", "B"]);
  const pinned = togglePin(moved.memory, moved.pins, "Name", "B");
  assert.deepEqual(memoryOptions(pinned.memory, pinned.pins, "Name"), ["B", "A", "C"]);
  // a pinned value cannot be dropped among the others, and the other way round
  assert.deepEqual(moveOption(pinned.memory, pinned.pins, "Name", "B", "C"), { memory: pinned.memory, pins: pinned.pins });
  assert.deepEqual(moveOption(pinned.memory, pinned.pins, "Name", "C", "B"), { memory: pinned.memory, pins: pinned.pins });
  const swapped = moveOption(pinned.memory, pinned.pins, "Name", "C", "A");
  assert.deepEqual(memoryOptions(swapped.memory, swapped.pins, "Name"), ["B", "C", "A"]);
  // two pinned values can swap places
  const two = togglePin(pinned.memory, pinned.pins, "Name", "A");
  const flipped = moveOption(two.memory, two.pins, "Name", "A", "B");
  assert.deepEqual(memoryOptions(flipped.memory, flipped.pins, "Name"), ["A", "B", "C"]);
});

test("Name's three fixed options never take a place in the recent list", () => {
  const memory = rememberValues({}, { Name: "Friend" });
  assert.deepEqual(memory.Name || [], []);
  assert.deepEqual(rememberValues({}, { Name: "lovely" }).Name || [], []);
  const withAmanda = rememberValues(memory, { Name: "Amanda" });
  assert.deepEqual(memoryOptions(withAmanda, {}, "Name"), ["Amanda"]);
  assert.deepEqual(memoryOptions({ Name: ["Friend", "Amanda"] }, {}, "Name"), ["Amanda"]);
  // other variables are not touched
  assert.deepEqual(rememberValues({}, { Company: "Friend" }).Company, ["Friend"]);
});

test("fixed options are a general rule: any block listed in FIXED_OPTIONS keeps them out of the recent list", () => {
  FIXED_OPTIONS.Greeting = ["Hello"];
  try {
    assert.deepEqual(fixedOptions("Greeting"), ["Hello"]);
    assert.equal(isFixedOption("Greeting", " hello "), true);
    assert.deepEqual(rememberValues({}, { Greeting: "Hello" }).Greeting || [], []);
    assert.deepEqual(rememberValues({}, { Greeting: "Hi" }).Greeting, ["Hi"]);
    assert.deepEqual(memoryOptions({ Greeting: ["Hello", "Hi"] }, {}, "Greeting"), ["Hi"]);
    assert.equal(isFixedOption("Company", "Hello"), false);
  } finally { delete FIXED_OPTIONS.Greeting; }
});

test("mini window: an unfilled block copies its pinned value, then its default, then its own word; never a recent one", async () => {
  const { quickFillValues } = await import("../app/variable-memory.ts");
  const pins = { Carrier: ["DHL", "UPS"] };
  const result = quickFillValues(["Name", "Carrier", "Product", "Date"], { Date: " Monday " }, pins);
  assert.deepEqual(result.values, { Name: "Friend", Carrier: "DHL", Product: "Product", Date: "Monday" });
  assert.deepEqual(result.used.map((entry) => entry.name), ["Name", "Carrier", "Product"]);
  // A pinned name wins over Friend; what was typed wins over everything.
  assert.deepEqual(quickFillValues(["Name"], {}, { Name: ["Lovely"] }).values, { Name: "Lovely" });
  assert.deepEqual(quickFillValues(["Name"], { Name: "Anna" }, { Name: ["Lovely"] }), { values: { Name: "Anna" }, used: [] });
});

test("date blocks offer today, tomorrow, in 3 days and next Monday on the Taipei calendar", async () => {
  const { dateOptions, isDateVariable, quickOptions } = await import("../app/variable-memory.ts");
  // 2026-10-19 23:30 in Taipei is a Monday; the same instant is still Sunday in UTC.
  const now = Date.UTC(2026, 9, 19, 15, 30);
  assert.deepEqual(dateOptions("en", now), [
    { label: "今天", value: "Oct 19" }, { label: "明天", value: "Oct 20" }, { label: "3 天后", value: "Oct 22" }, { label: "下周一", value: "Oct 26" },
  ]);
  assert.deepEqual(dateOptions("zh", Date.UTC(2026, 11, 30, 4)).map((option) => option.value), ["12月30日", "12月31日", "1月2日", "1月4日"]);
  assert.equal(isDateVariable("日期"), true);
  assert.equal(isDateVariable("放假日期"), true);
  assert.equal(isDateVariable("Start Date"), true);
  assert.equal(isDateVariable("天数"), false);
  assert.deepEqual(quickOptions("Name", "en"), [{ value: "Beautiful" }, { value: "Friend" }, { value: "Lovely" }]);
  assert.deepEqual(quickOptions("Company", "en"), []);
});

test("today's quick dates stay out of the recent list; other dates are remembered", async () => {
  const { dateOptions } = await import("../app/variable-memory.ts");
  const today = dateOptions("en")[0].value;
  assert.equal(isFixedOption("日期", today), true);
  assert.equal(isFixedOption("Company", today), false);
  assert.deepEqual(rememberValues({}, { 日期: today, Date: "next spring" }), { Date: ["next spring"] });
});
