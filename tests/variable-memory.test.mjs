import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_VALUES, NAME_OPTIONS, memoryOptions, parsePinned, rememberValues, togglePin } from "../app/variable-memory.ts";

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

test("Name starts with beautiful, Friend and Lovely, and Friend is the default", () => {
  assert.deepEqual([...NAME_OPTIONS], ["beautiful", "Friend", "Lovely"]);
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
