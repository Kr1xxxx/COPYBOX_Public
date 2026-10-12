import assert from "node:assert/strict";
import test from "node:test";
import { applyImportSampleSnippets, isSampleSnippet, planClearSampleSnippets, planImportSampleSnippets, sampleSnippetSet, testPreviewText } from "../app/sample-snippets.ts";

const NOW = 1_000_000;
const mine = (id, label, secret = "x") => ({ id, label, secret, note: "", color: "", kind: "snippet", createdAt: 1, updatedAt: 1 });

test("the test set has stable ids with the sample mark", () => {
  const a = sampleSnippetSet(NOW).items;
  const b = sampleSnippetSet(NOW + 5).items;
  assert.ok(a.length >= 30);
  assert.deepEqual(a.map((item) => item.id), b.map((item) => item.id));
  assert.ok(a.every(isSampleSnippet));
});

test("importing twice adds nothing the second time", () => {
  const first = planImportSampleSnippets([], NOW);
  const list = applyImportSampleSnippets([], first);
  assert.equal(list.length, first.add.length);
  const second = planImportSampleSnippets(list, NOW);
  assert.equal(second.add.length, 0);
  assert.equal(second.revive.length, 0);
});

test("a 话术 of the user with the same text is not added again", () => {
  const sample = sampleSnippetSet(NOW).items[0];
  const own = mine("u1", sample.label, sample.secret);
  const plan = planImportSampleSnippets([own], NOW);
  assert.ok(!plan.add.some((item) => item.id === sample.id));
});

test("clear plans only untouched test 话术, never the user's own or edited ones", () => {
  const list = applyImportSampleSnippets([], planImportSampleSnippets([], NOW));
  const own = mine("u1", "我的话术");
  const edited = { ...list[0], updatedAt: list[0].createdAt + 10 };
  const current = [own, edited, ...list.slice(1)];
  const plan = planClearSampleSnippets(current);
  assert.equal(plan.ids.length, list.length - 1);
  assert.ok(!plan.ids.includes("u1"));
  assert.ok(!plan.ids.includes(edited.id));
  assert.equal(plan.keptEdited, 1);
});

test("a cleared (trashed) test 话术 comes back on import and is not counted by clear", () => {
  const list = applyImportSampleSnippets([], planImportSampleSnippets([], NOW));
  const trashed = list.map((item) => ({ ...item, deletedAt: 5 }));
  assert.equal(planClearSampleSnippets(trashed).ids.length, 0);
  const plan = planImportSampleSnippets(trashed, NOW);
  assert.equal(plan.revive.length, list.length);
  const back = applyImportSampleSnippets(trashed, plan);
  assert.ok(back.every((item) => item.deletedAt === undefined));
  assert.equal(back.length, list.length);
});

test("the confirmation text names how many of each kind go", () => {
  assert.equal(testPreviewText({ snippets: 3, accounts: 2, keptEdited: 1 }), "将清除：话术 3 条、账号 2 条；你改过的 1 条会保留");
  assert.equal(testPreviewText({ snippets: 3, accounts: null, keptEdited: 0 }), "将清除：话术 3 条");
  assert.equal(testPreviewText({ snippets: 0, accounts: 0, keptEdited: 0 }), "现在没有可清除的测试内容");
});
