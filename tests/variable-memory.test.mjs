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
