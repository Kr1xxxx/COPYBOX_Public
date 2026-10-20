import assert from "node:assert/strict";
import test from "node:test";
import { isDue } from "../scripts/ci-due.mjs";

test("a push to main runs the checks only on every 5th preview version", () => {
  for (const version of ["2.40", "2.45", "2.50", "3.00", "2.4"]) assert.equal(isDue(version, "push"), true, version);
  for (const version of ["2.36", "2.41", "2.44", "2.49"]) assert.equal(isDue(version, "push"), false, version);
});

test("a run started by hand always goes ahead", () => {
  assert.equal(isDue("2.37", "workflow_dispatch"), true);
});
