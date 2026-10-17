import assert from "node:assert/strict";
import test from "node:test";
import { STANDARD_SNIPPET_FOLDERS } from "../app/snippet-folders.ts";

const api = await import("../app/mcp-snippets.ts").catch(() => ({}));
const runtime = { createId: () => "unused", now: () => 2000 };
function vault() {
  return { items: [1, 2].map((n) => ({ id: `snippet-${n}`, kind: "snippet", snippetNumber: `CB-000${n}`, label: `Example ${n}`, secret: `Reply ${n}`, note: "", color: "#ffcfa8", folder: STANDARD_SNIPPET_FOLDERS[0], createdAt: 1000, updatedAt: 1000 })).concat({ id: "test-account", kind: "secret", label: "Synthetic account", secret: "synthetic-test-only", note: "", color: "#ffcfa8", createdAt: 1000, updatedAt: 1000 }), folders: { snippet: [...STANDARD_SNIPPET_FOLDERS], secret: [] }, nextSnippetNumber: 3 };
}
async function run(command, data = vault(), persist = async () => {}) {
  assert.equal(typeof api.runMcpSnippetCommand, "function");
  return api.runMcpSnippetCommand(data, command, runtime, persist);
}

test("MCP batch reads preserve requested order and never return account entries", async () => {
  const result = await run({ action: "get-many", numbers: ["CB-0002", "cb-0001"] });
  assert.deepEqual(result.items.map((x) => x.number), ["CB-0002", "CB-0001"]);
  assert.equal(result.items[0].content, "Reply 2");
  assert.equal(result.items[0].updatedAt, 1000);
  assert.equal(JSON.stringify(result).includes("synthetic-test-only"), false);
});

test("MCP directory counts include empty standard folders", async () => {
  const result = await run({ action: "snippet-folders" });
  assert.equal(result.folders.length, STANDARD_SNIPPET_FOLDERS.length);
  assert.equal(result.folders[0].count, 2);
  assert.equal(result.folders[1].count, 0);
});

test("MCP batch edits validate first and persist exactly once preserving unrelated data", async () => {
  const data = vault(); const original = structuredClone(data); const saved = [];
  const result = await run({ action: "update-many", updates: [{ number: "CB-0001", expectedUpdatedAt: 1000, content: "Revised reply" }, { number: "CB-0002", expectedUpdatedAt: 1000, folder: STANDARD_SNIPPET_FOLDERS[1] }] }, data, async (next) => { saved.push(next); });
  assert.equal(saved.length, 1);
  assert.equal(result.items[0].content, "Revised reply");
  assert.equal(result.items[1].folder, STANDARD_SNIPPET_FOLDERS[1]);
  assert.deepEqual(saved[0].items.find((x) => x.id === "test-account"), original.items.find((x) => x.id === "test-account"));
  assert.deepEqual(data, original);
});

test("one stale or invalid update rejects the entire snippet batch without saving", async () => {
  for (const invalid of [{ number: "CB-0002", expectedUpdatedAt: 999, content: "Stale" }, { number: "CB-0002", expectedUpdatedAt: 1000, content: " " }, { number: "CB-9999", expectedUpdatedAt: 1000, content: "Missing" }]) {
    let writes = 0;
    await assert.rejects(run({ action: "update-many", updates: [{ number: "CB-0001", expectedUpdatedAt: 1000, content: "Valid" }, invalid] }, vault(), async () => { writes++; }));
    assert.equal(writes, 0);
  }
});

test("bounded batch inputs reject duplicates, extra fields and missing conflict guards", async () => {
  for (const command of [
    { action: "get-many", numbers: [] }, { action: "get-many", numbers: Array(101).fill("CB-0001") },
    { action: "get-many", numbers: ["CB-0001", "cb-0001"] },
    { action: "snippet-folders", includeAccounts: true },
    { action: "update-many", updates: [{ number: "CB-0001", content: "No guard" }] },
    { action: "update-many", updates: [{ number: "CB-0001", expectedUpdatedAt: 1000, secret: "Wrong field" }] },
    { action: "update-many", updates: [{ number: "CB-0001", expectedUpdatedAt: 1000, title: "A" }, { number: "cb-0001", expectedUpdatedAt: 1000, title: "B" }] },
  ]) await assert.rejects(run(command));
});

test("a failed persist is reported as failure, never a successful batch", async () => {
  await assert.rejects(run({ action: "update-many", updates: [{ number: "CB-0001", expectedUpdatedAt: 1000, title: "Edited" }] }, vault(), async () => { throw new Error("synthetic write failure"); }), /synthetic write failure/);
});

test("MCP creates a trimmed custom folder once without touching accounts or the source", async () => {
  const data = vault(); const before = structuredClone(data); const saved = [];
  const result = await run({ action: "snippet-folder-create", name: "  自定义话术  " }, data, async (next) => saved.push(next));
  assert.deepEqual(result, { action: "snippet-folder-create", name: "自定义话术", created: true });
  assert.equal(saved.length, 1);
  assert.ok(saved[0].folders.snippet.includes("自定义话术"));
  assert.deepEqual(saved[0].items, before.items);
  assert.deepEqual(data, before);
  assert.equal((await run({ action: "snippet-folder-create", name: "自定义话术" }, saved[0], async (next) => saved.push(next))).created, false);
  assert.equal(saved.length, 1);
});

test("MCP custom folder can receive new, moved and batch-edited snippets", async () => {
  const { applySnippetAutomationCommand } = await import("../app/clipbox-automation.ts");
  let data = vault(); const save = async (next) => { data = next; };
  await run({ action: "snippet-folder-create", name: "自定义话术" }, data, save);
  for (const command of [
    { action: "add", title: "New", content: "Synthetic reply", folder: "自定义话术" },
    { action: "move", number: "CB-0001", folder: "自定义话术" },
  ]) data = applySnippetAutomationCommand(data, command, runtime).data;
  await run({ action: "update-many", updates: [{ number: "CB-0002", expectedUpdatedAt: 1000, folder: "自定义话术" }] }, data, save);
  assert.equal((await run({ action: "snippet-folders" }, data)).folders.find((f) => f.name === "自定义话术").count, 3);
  assert.throws(() => applySnippetAutomationCommand(data, { action: "move", number: "CB-0001", folder: "不存在" }, runtime), { code: "INVALID_FOLDER" });
});

test("MCP rename moves active and trashed snippets, colors and short names while preserving accounts", async () => {
  const data = vault(); data.folders.snippet.push("自定义话术");
  data.items[0].folder = "自定义话术";
  data.items[1].folder = "自定义话术"; data.items[1].deletedAt = 1500;
  data.items[2].folder = "自定义话术"; data.folders.secret.push("自定义话术");
  data.folderColors = { snippet: { 自定义话术: "#ffcfa8" } };
  data.folderShortNames = { snippet: { 自定义话术: "自定" } };
  const before = structuredClone(data); const saved = [];
  const result = await run({ action: "snippet-folder-rename", from: "自定义话术", to: "  新的目录  " }, data, async (next) => saved.push(next));
  assert.deepEqual(result, { action: "snippet-folder-rename", from: "自定义话术", name: "新的目录" });
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].items.slice(0, 2).map((x) => x.folder), ["新的目录", "新的目录"]);
  assert.equal(saved[0].items[1].deletedAt, 1500);
  assert.deepEqual(saved[0].items[2], before.items[2]);
  assert.equal(saved[0].folderColors.snippet["新的目录"], "#ffcfa8");
  assert.equal(saved[0].folderShortNames.snippet["新的目录"], "自定");
  assert.equal(saved[0].folders.snippet.includes("自定义话术"), false);
  assert.deepEqual(data, before);
});

test("MCP folder validation and save failures never report success", async () => {
  const data = vault(); data.folders.snippet.push("Custom", "Other");
  for (const command of [
    { action: "snippet-folder-create", name: " " },
    { action: "snippet-folder-create", name: "字".repeat(31) },
    { action: "snippet-folder-create", name: "Custom", extra: true },
    { action: "snippet-folder-rename", from: STANDARD_SNIPPET_FOLDERS[0], to: "Changed" },
    { action: "snippet-folder-rename", from: "Missing", to: "Changed" },
    { action: "snippet-folder-rename", from: "Custom", to: "Other" },
    { action: "snippet-folder-rename", from: "Custom", to: " " },
    { action: "snippet-folder-rename", from: "Custom", to: "字".repeat(31) },
  ]) {
    let writes = 0;
    await assert.rejects(run(command, data, async () => { writes++; }));
    assert.equal(writes, 0);
  }
  for (const command of [{ action: "snippet-folder-create", name: "New" }, { action: "snippet-folder-rename", from: "Custom", to: "New" }]) {
    await assert.rejects(run(command, data, async () => { throw new Error("synthetic write failure"); }), /synthetic write failure/);
  }
});
