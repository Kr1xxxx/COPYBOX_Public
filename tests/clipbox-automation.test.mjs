import assert from "node:assert/strict";
import test from "node:test";

let automation;
try {
  automation = await import("../app/clipbox-automation.ts");
} catch {
  automation = undefined;
}

const runtime = {
  createId: () => "generated-id",
  now: () => 2_000,
};

function snippet(overrides = {}) {
  return {
    id: "snippet-id",
    label: "Opening",
    secret: "Hello",
    note: "Existing note",
    color: "#ffcfa8",
    kind: "snippet",
    summary: "Greeting",
    folder: "询盘接待",
    pinned: true,
    snippetNumber: "CB-0001",
    snippetMeta: {
      stage: "询盘接待",
      scene: "首次联系",
      action: "询问需求",
      productGroups: ["镊子"],
      rawProduct: "镊子",
      chineseText: "你好",
      placeholders: [],
      requiredInputs: [],
      usageNote: "Keep concise",
      requiresVerification: false,
    },
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  };
}

function secret() {
  return {
    id: "secret-id",
    label: "Private",
    secret: "private account\nprivate password",
    secretSegments: ["private account", "private password"],
    note: "Never expose",
    color: "#dcd8ff",
    kind: "secret",
    createdAt: 1_000,
    updatedAt: 1_000,
  };
}

function vault() {
  return {
    items: [snippet(), secret()],
    folders: { snippet: ["询盘接待"], secret: [] },
    nextSnippetNumber: 2,
  };
}

test("lists and gets snippets without exposing secret entries", () => {
  assert.equal(typeof automation?.applySnippetAutomationCommand, "function");
  const listed = automation.applySnippetAutomationCommand(vault(), { action: "list" }, runtime);
  const fetched = automation.applySnippetAutomationCommand(vault(), { action: "get", number: "cb-0001" }, runtime);

  assert.deepEqual(listed.result.items.map((item) => item.number), ["CB-0001"]);
  assert.equal(JSON.stringify(listed.result).includes("private secret"), false);
  assert.equal(listed.changed, false);
  assert.equal(fetched.result.item.content, "Hello");
  assert.equal(fetched.result.item.chineseText, "你好");
  assert.equal(fetched.result.item.meta.stage, "询盘接待");
});

test("creates a stable encoded reference and resolves exactly one secret", () => {
  assert.equal(typeof automation?.formatSecretReference, "function");
  assert.equal(
    automation.formatSecretReference("secret/id 空"),
    "clipbox://secret/secret%2Fid%20%E7%A9%BA",
  );

  const outcome = automation.applySnippetAutomationCommand(
    vault(),
    { action: "secret-get", reference: "clipbox://secret/secret-id" },
    runtime,
  );

  assert.deepEqual(outcome.result, {
    action: "secret-get",
    secret: {
      reference: "clipbox://secret/secret-id",
      title: "Private",
      value: "private account\nprivate password",
      segments: ["private account", "private password"],
      folder: "",
      updatedAt: 1_000,
    },
  });
  assert.equal(outcome.changed, false);
});

test("hides trashed secrets from reference reads and verification", () => {
  const trashedVault = vault();
  trashedVault.items[1] = { ...trashedVault.items[1], deletedAt: 2_000 };

  assert.throws(
    () => automation.applySnippetAutomationCommand(
      trashedVault,
      { action: "secret-get", reference: "clipbox://secret/secret-id" },
      runtime,
    ),
    /未找到对应的秘密/,
  );
  assert.throws(
    () => automation.applySnippetAutomationCommand(
      trashedVault,
      { action: "secret-verify", reference: "clipbox://secret/secret-id", candidate: "synthetic" },
      runtime,
    ),
    /未找到对应的秘密/,
  );
});

test("classifies secret lookup as read-only renderer feedback", () => {
  assert.equal(typeof automation?.isAutomationReadAction, "function");
  assert.equal(automation.isAutomationReadAction("secret-get"), true);
  assert.equal(automation.isAutomationReadAction("get"), true);
  assert.equal(automation.isAutomationReadAction("update"), false);
});

test("compares a clipboard candidate with a secret without returning either value", () => {
  const exactValue = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";
  const exactVault = vault();
  exactVault.items[1] = { ...exactVault.items[1], secret: exactValue };

  const matched = automation.applySnippetAutomationCommand(
    exactVault,
    { action: "secret-verify", reference: "clipbox://secret/secret-id", candidate: exactValue },
    runtime,
  );
  const mismatched = automation.applySnippetAutomationCommand(
    { ...exactVault, items: [exactVault.items[0], { ...exactVault.items[1], secret: "旧值" }] },
    { action: "secret-verify", reference: "clipbox://secret/secret-id", candidate: exactValue },
    runtime,
  );

  assert.deepEqual(matched.result, {
    action: "secret-verify",
    match: true,
    clipboard: { chars: 32, bytes: 32, ascii: true, appSecretFormat: true },
    stored: { chars: 32, bytes: 32, ascii: true, appSecretFormat: true },
  });
  assert.deepEqual(mismatched.result, {
    action: "secret-verify",
    match: false,
    clipboard: { chars: 32, bytes: 32, ascii: true, appSecretFormat: true },
    stored: { chars: 2, bytes: 6, ascii: false, appSecretFormat: false },
  });
  assert.equal(JSON.stringify(mismatched.result).includes(exactValue), false);
  assert.equal(matched.changed, false);
  assert.equal(automation.isAutomationReadAction("secret-verify"), true);
});

test("strictly parses commands and rejects unsupported fields", () => {
  assert.equal(typeof automation?.parseAutomationCommand, "function");
  assert.deepEqual(
    automation.parseAutomationCommand({ action: "update", number: "cb-0001", content: "Updated" }),
    { action: "update", number: "CB-0001", content: "Updated" },
  );
  assert.throws(
    () => automation.parseAutomationCommand({ action: "update", number: "CB-0001", content: "Updated", arbitrary: true }),
    /不支持的字段 arbitrary/,
  );
  assert.throws(() => automation.parseAutomationCommand({ action: "get", number: "1" }), /编号格式/);
});

test("accepts a confirmed assistant secret export without accepting extra fields", () => {
  assert.equal(automation.parseSecretExportCommand({ action: "status" }), null);
  assert.deepEqual(
    automation.parseSecretExportCommand({ action: "secret-export", password: "backup-password", confirmed: true }),
    { action: "secret-export", password: "backup-password", confirmed: true },
  );
  assert.throws(
    () => automation.parseSecretExportCommand({ action: "secret-export", password: "short", confirmed: true }),
    /至少需要 8 个字符/,
  );
  assert.throws(
    () => automation.parseSecretExportCommand({ action: "secret-export", password: "backup-password", confirmed: false }),
    /明确确认/,
  );
  assert.throws(
    () => automation.parseSecretExportCommand({ action: "secret-export", password: "backup-password", confirmed: true, path: "/tmp/out" }),
    /不支持的字段 path/,
  );
});

test("adds the next permanent number in a standard folder", () => {
  const outcome = automation.applySnippetAutomationCommand(
    vault(),
    { action: "add", title: "New", content: "New copy", summary: "Summary", folder: " 客户跟进 ", chineseText: "新话术" },
    runtime,
  );
  const added = outcome.data.items.find((item) => item.id === "generated-id");

  assert.equal(outcome.changed, true);
  assert.equal(outcome.result.item.number, "CB-0002");
  assert.equal(added.snippetNumber, "CB-0002");
  assert.equal(added.folder, "客户跟进");
  assert.equal(added.snippetMeta.chineseText, "新话术");
  assert.deepEqual(outcome.data.folders.snippet, ["询盘接待", "产品样品", "报价成交", "定制生产", "客户跟进", "物流清关", "售后争议"]);
  assert.equal(outcome.data.nextSnippetNumber, 3);
});

test("partially updates content while preserving fixed and structured fields", () => {
  const before = vault();
  const outcome = automation.applySnippetAutomationCommand(
    before,
    { action: "update", number: "CB-0001", content: "Updated", chineseText: "已更新" },
    runtime,
  );
  const after = outcome.data.items.find((item) => item.snippetNumber === "CB-0001");

  assert.equal(after.secret, "Updated");
  assert.equal(after.snippetMeta.chineseText, "已更新");
  assert.equal(after.snippetMeta.stage, "询盘接待");
  assert.equal(after.id, "snippet-id");
  assert.equal(after.createdAt, 1_000);
  assert.equal(after.pinned, true);
  assert.equal(after.snippetNumber, "CB-0001");
  assert.equal(after.updatedAt, 2_000);
});

test("updates a structured folder and Chinese text without losing the matching stage", () => {
  const outcome = automation.applySnippetAutomationCommand(
    vault(),
    { action: "update", number: "CB-0001", folder: "产品样品", chineseText: "新的中文" },
    runtime,
  );
  const after = outcome.result.item;

  assert.equal(after.folder, "产品样品");
  assert.equal(after.chineseText, "新的中文");
  assert.equal(after.meta.stage, "产品样品");
});

test("moves a snippet to a standard destination folder", () => {
  const outcome = automation.applySnippetAutomationCommand(
    vault(),
    { action: "move", number: "CB-0001", folder: " 售后争议 " },
    runtime,
  );

  assert.equal(outcome.result.item.folder, "售后争议");
  assert.deepEqual(outcome.data.folders.snippet, ["询盘接待", "产品样品", "报价成交", "定制生产", "客户跟进", "物流清关", "售后争议"]);
  assert.equal(outcome.data.items[0].snippetNumber, "CB-0001");
});

test("moves exactly one confirmed numbered snippet to trash and hides it from reads", () => {
  const outcome = automation.applySnippetAutomationCommand(
    vault(),
    { action: "delete", number: "CB-0001", confirmed: true },
    runtime,
  );

  assert.equal(outcome.result.number, "CB-0001");
  assert.deepEqual(outcome.data.items.map((item) => item.id), ["snippet-id", "secret-id"]);
  assert.equal(outcome.data.items[0].deletedAt, 2_000);
  assert.deepEqual(
    automation.applySnippetAutomationCommand(outcome.data, { action: "list" }, runtime).result.items,
    [],
  );
  assert.equal(
    automation.applySnippetAutomationCommand(outcome.data, { action: "status" }, runtime).result.snippetCount,
    0,
  );
  assert.throws(
    () => automation.applySnippetAutomationCommand(outcome.data, { action: "get", number: "CB-0001" }, runtime),
    /未找到话术/,
  );
  assert.equal(outcome.data.nextSnippetNumber, 2);
});

test("rejects unsafe mutations without changing the input vault", () => {
  const original = vault();
  assert.throws(
    () => automation.parseAutomationCommand({ action: "delete", number: "CB-0001", confirmed: false }),
    /确认删除/,
  );
  assert.throws(
    () => automation.applySnippetAutomationCommand(original, { action: "update", number: "CB-9999", content: "Missing" }, runtime),
    /未找到话术/,
  );
  assert.throws(
    () => automation.applySnippetAutomationCommand(original, { action: "add", title: "", content: "Copy" }, runtime),
    /标题不能为空/,
  );
  assert.throws(
    () => automation.applySnippetAutomationCommand(original, { action: "update", number: "CB-0001", content: "" }, runtime),
    /英文内容不能为空/,
  );
  assert.throws(
    () => automation.applySnippetAutomationCommand(original, { action: "move", number: "CB-0001", folder: "客服" }, runtime),
    /只能使用标准目录/,
  );
  assert.equal(original.items[0].secret, "Hello");
});

test("a later command consumes the prior command result without reusing a number", () => {
  const first = automation.applySnippetAutomationCommand(
    vault(),
    { action: "add", title: "Second", content: "Two" },
    runtime,
  );
  const second = automation.applySnippetAutomationCommand(
    first.data,
    { action: "add", title: "Third", content: "Three" },
    { createId: () => "second-generated-id", now: () => 3_000 },
  );

  assert.deepEqual(
    second.data.items.filter((item) => item.kind === "snippet").map((item) => item.snippetNumber),
    ["CB-0003", "CB-0002", "CB-0001"],
  );
  assert.equal(first.result.item.folder, "询盘接待");
});

test("commits changed commands before returning success and skips writes for reads", async () => {
  assert.equal(typeof automation?.commitSnippetAutomationCommand, "function");
  const persisted = [];
  const changed = await automation.commitSnippetAutomationCommand(
    vault(),
    { action: "update", number: "CB-0001", content: "Durable" },
    runtime,
    async (data) => { persisted.push(data.items[0].secret); },
  );
  const read = await automation.commitSnippetAutomationCommand(
    changed.data,
    { action: "get", number: "CB-0001" },
    runtime,
    async () => { persisted.push("unexpected"); },
  );

  assert.deepEqual(persisted, ["Durable"]);
  assert.equal(changed.response.ok, true);
  assert.equal(changed.response.item.content, "Durable");
  assert.equal(read.response.item.content, "Durable");
});

test("does not report success when encrypted persistence fails", async () => {
  await assert.rejects(
    automation.commitSnippetAutomationCommand(
      vault(),
      { action: "move", number: "CB-0001", folder: "售后争议" },
      runtime,
      async () => { throw new Error("disk full"); },
    ),
    /disk full/,
  );
});
