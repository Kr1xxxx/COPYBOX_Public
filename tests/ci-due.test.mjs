import assert from "node:assert/strict";
import test from "node:test";
import { isDue } from "../scripts/ci-due.mjs";

test("a push to main runs the checks when VERSION crosses a 0.05 step since the previous main", () => {
  for (const [previous, version] of [["2.39", "2.40"], ["2.39", "2.41"], ["2.44", "2.46"], ["2.99", "3.01"], ["2.36", "2.4"]]) {
    assert.equal(isDue(version, "push", previous), true, `${previous} → ${version}`);
  }
  for (const [previous, version] of [["2.36", "2.37"], ["2.40", "2.41"], ["2.41", "2.44"], ["2.40", "2.40"], ["2.41", "2.39"]]) {
    assert.equal(isDue(version, "push", previous), false, `${previous} → ${version}`);
  }
});

test("without the previous main VERSION a push runs only on an exact multiple of 0.05", () => {
  for (const version of ["2.40", "2.45", "3.00"]) assert.equal(isDue(version, "push", ""), true, version);
  for (const version of ["2.36", "2.41", "2.49"]) assert.equal(isDue(version, "push"), false, version);
});

test("a run started by hand always goes ahead", () => {
  assert.equal(isDue("2.37", "workflow_dispatch", "2.36"), true);
});
