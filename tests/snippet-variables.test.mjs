import assert from "node:assert/strict";
import test from "node:test";
import { markVariable, unmarkVariable, variableAround } from "../app/snippet-variables.ts";

const text = "Hi dear friend, your order is ready.";

test("the selected words become a variable block; spaces at the edges stay outside", () => {
  const spaced = "Hi dear friend your order is ready.";
  const start = spaced.indexOf("dear friend");
  const edit = markVariable(spaced, start - 1, start + "dear friend".length + 1);
  assert.equal(edit.ok, true);
  assert.equal(edit.text, "Hi [dear friend] your order is ready.");
  assert.equal(edit.text.slice(edit.start, edit.end), "[dear friend]");
});

test("nothing selected, brackets, line breaks or too long a selection are refused", () => {
  assert.equal(markVariable(text, 3, 3).ok, false);
  assert.equal(markVariable(text, 3, 6 + 0).ok, true);
  assert.equal(markVariable("a [b] c", 0, 5).ok, false);
  assert.equal(markVariable("a\nb", 0, 3).ok, false);
  assert.equal(markVariable("x".repeat(60), 0, 60).ok, false);
});

test("words already inside a block cannot be marked again; the block can be unmarked from the caret", () => {
  const marked = "Hi [Name], thanks";
  assert.equal(markVariable(marked, 4, 8).ok, false);
  assert.deepEqual(variableAround(marked, 5, 5), { open: 3, close: 9 });
  const off = unmarkVariable(marked, 6, 6);
  assert.equal(off.ok, true);
  assert.equal(off.text, "Hi Name, thanks");
  assert.equal(unmarkVariable(marked, 0, 0).ok, false);
});

test("two blocks next to each other are kept apart", () => {
  const edit = markVariable("A B", 0, 1);
  assert.equal(edit.text, "[A] B");
  const next = markVariable(edit.text, 4, 5);
  assert.equal(next.text, "[A] [B]");
});
