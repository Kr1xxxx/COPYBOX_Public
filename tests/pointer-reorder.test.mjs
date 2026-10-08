import assert from "node:assert/strict";
import test from "node:test";
import { pointerDragReducer } from "../app/pointer-reorder.ts";

test("does not activate before the movement threshold", () => {
  const started = pointerDragReducer(null, { type: "start", id: "a", pointerId: 3, x: 10, y: 10 });
  const moved = pointerDragReducer(started, { type: "move", pointerId: 3, x: 12, y: 12, overId: "b" });
  assert.equal(moved?.active, false);
  assert.equal(moved?.overId, "a");
});

test("activates after five pixels and tracks the current target", () => {
  const started = pointerDragReducer(null, { type: "start", id: "a", pointerId: 3, x: 10, y: 10 });
  const moved = pointerDragReducer(started, { type: "move", pointerId: 3, x: 10, y: 16, overId: "b" });
  assert.deepEqual({ active: moved?.active, overId: moved?.overId }, { active: true, overId: "b" });
});

test("keeps the last valid target when the pointer crosses empty space", () => {
  const started = pointerDragReducer(null, { type: "start", id: "a", pointerId: 3, x: 0, y: 0 });
  const active = pointerDragReducer(started, { type: "move", pointerId: 3, x: 0, y: 6, overId: "b" });
  const empty = pointerDragReducer(active, { type: "move", pointerId: 3, x: 0, y: 12, overId: "" });
  assert.equal(empty?.overId, "b");
});

test("ignores a different pointer and cancels cleanly", () => {
  const started = pointerDragReducer(null, { type: "start", id: "a", pointerId: 3, x: 0, y: 0 });
  assert.equal(pointerDragReducer(started, { type: "move", pointerId: 4, x: 20, y: 20, overId: "b" }), started);
  assert.equal(pointerDragReducer(started, { type: "cancel" }), null);
});
