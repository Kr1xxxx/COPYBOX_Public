import assert from "node:assert/strict";
import test from "node:test";
import { buildFlipTransitions } from "../app/reorder-animation.ts";

test("builds inverse translations for items that exchanged positions", () => {
  const before = new Map([
    ["a", { left: 20, top: 40 }],
    ["b", { left: 20, top: 100 }],
  ]);
  const after = new Map([
    ["b", { left: 20, top: 40 }],
    ["a", { left: 20, top: 100 }],
  ]);

  assert.deepEqual(buildFlipTransitions(before, after), [
    { id: "b", transform: "translate3d(0px, 60px, 0)" },
    { id: "a", transform: "translate3d(0px, -60px, 0)" },
  ]);
});

test("ignores stationary, newly inserted, and removed items", () => {
  const before = new Map([
    ["still", { left: 10, top: 10 }],
    ["removed", { left: 10, top: 50 }],
  ]);
  const after = new Map([
    ["still", { left: 10, top: 10 }],
    ["new", { left: 10, top: 50 }],
  ]);

  assert.deepEqual(buildFlipTransitions(before, after), []);
});
