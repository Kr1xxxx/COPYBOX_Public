import assert from "node:assert/strict";
import test from "node:test";
import {
  filterVaultForEdition,
  legacyVaultActionForEdition,
  prepareImportForEdition,
  resolveRuntimeCapabilities,
  viewPolicyForEdition,
} from "../app/clipbox-edition.ts";
import { STANDARD_SNIPPET_FOLDERS } from "../app/snippet-folders.ts";

const secret = (id, kind = "secret") => ({
  id,
  label: `秘密 ${id}`,
  secret: `secret-${id}`,
  note: "",
  color: "#fff",
  ...(kind ? { kind } : {}),
  folder: "工作",
  createdAt: 1,
  updatedAt: 1,
});

const snippet = (id, folder) => ({
  id,
  label: `话术 ${id}`,
  secret: `snippet-${id}`,
  note: "",
  color: "#fff",
  kind: "snippet",
  folder,
  createdAt: 1,
  updatedAt: 1,
});

const mixedVault = {
  items: [secret("legacy", ""), secret("explicit"), snippet("snippet-1", "客服"), snippet("snippet-2", "物流")],
  folders: { secret: ["工作", "个人"], snippet: ["物流", "客服"] },
  nextSnippetNumber: 37,
};

const safeWindowsCapabilities = {
  edition: "snippet-only",
  platform: "win32",
  supportsSecrets: false,
  supportsExport: false,
  supportsAutomation: false,
  globalShortcut: "",
};

test("selects full and snippet-only presentation policies", () => {
  assert.deepEqual(viewPolicyForEdition("full"), {
    defaultKind: "secret",
    showKindSwitcher: true,
    showExport: true,
    sidebarTitle: "",
  });
  assert.deepEqual(viewPolicyForEdition("snippet-only"), {
    defaultKind: "snippet",
    showKindSwitcher: false,
    showExport: false,
    sidebarTitle: "话术库",
  });
});

test("filters legacy and explicit secrets from snippet-only vaults", () => {
  const result = filterVaultForEdition(mixedVault, "snippet-only");

  assert.deepEqual(result.data.items.map((item) => item.id), ["snippet-1", "snippet-2"]);
  assert.deepEqual(result.data.folders, { secret: [], snippet: [...STANDARD_SNIPPET_FOLDERS, "物流", "客服"] });
  assert.equal(result.skippedSecretCount, 2);
  assert.equal(result.requiresRewrite, true);
  assert.equal(result.data.nextSnippetNumber, 39);
});

test("requires a Windows rewrite when only secret folder metadata was filtered", () => {
  const result = filterVaultForEdition({
    items: [],
    folders: { secret: ["银行密码"], snippet: [] },
  }, "snippet-only");

  assert.deepEqual(result.data, { items: [], folders: { secret: [], snippet: [...STANDARD_SNIPPET_FOLDERS] }, nextSnippetNumber: 1 });
  assert.equal(result.skippedSecretCount, 0);
  assert.equal(result.requiresRewrite, true);
});

test("keeps full-edition vault contents and reports no skipped secrets", () => {
  const result = filterVaultForEdition(mixedVault, "full");

  assert.deepEqual(result.data.items.map((item) => item.id), mixedVault.items.map((item) => item.id));
  assert.deepEqual(result.data.folders, { secret: ["工作", "个人"], snippet: [...STANDARD_SNIPPET_FOLDERS, "物流", "客服"] });
  assert.equal(result.data.nextSnippetNumber, 39);
  assert.equal(result.skippedSecretCount, 0);
  assert.equal(result.requiresRewrite, false);
});

test("imports only snippets from a mixed backup", () => {
  const current = {
    items: [snippet("existing", "客服")],
    folders: { secret: [], snippet: ["客服"] },
  };

  const result = prepareImportForEdition(current, mixedVault, "merge", "snippet-only", () => "fresh-id");

  assert.equal(result.shouldPersist, true);
  assert.equal(result.importedCount, 2);
  assert.equal(result.skippedSecretCount, 2);
  assert.deepEqual(result.data.items.map((item) => item.id), ["snippet-1", "snippet-2", "existing"]);
  assert.deepEqual(result.data.folders, { secret: [], snippet: [...STANDARD_SNIPPET_FOLDERS, "客服", "物流"] });
});

test("does not replace Windows data when a backup contains no snippets", () => {
  const current = {
    items: [snippet("existing", "客服")],
    folders: { secret: [], snippet: ["客服"] },
  };
  const secretOnly = {
    items: [secret("only")],
    folders: { secret: ["工作"], snippet: [] },
  };

  const result = prepareImportForEdition(current, secretOnly, "replace", "snippet-only", () => "fresh-id");

  assert.equal(result.shouldPersist, false);
  assert.equal(result.importedCount, 0);
  assert.equal(result.skippedSecretCount, 1);
  assert.deepEqual(result.data.items.map((item) => item.id), ["existing"]);
  assert.equal(result.data.nextSnippetNumber, 2);
});

test("preserves empty replace behavior for the full edition", () => {
  const result = prepareImportForEdition(
    mixedVault,
    { items: [], folders: { secret: [], snippet: [] } },
    "replace",
    "full",
    () => "fresh-id",
  );

  assert.equal(result.shouldPersist, true);
  assert.equal(result.importedCount, 0);
  assert.equal(result.skippedSecretCount, 0);
  assert.deepEqual(result.data, { items: [], folders: { secret: [], snippet: [...STANDARD_SNIPPET_FOLDERS] }, nextSnippetNumber: 1 });
});

test("Windows desktop capabilities fail closed when the preload bridge is missing", () => {
  assert.deepEqual(resolveRuntimeCapabilities("http:", undefined, true), {
    ok: false,
    error: "Clipbox Windows 安全组件未能加载，请重新安装应用。",
  });
});

test("ordinary browser sessions retain the full browser edition fallback", () => {
  const result = resolveRuntimeCapabilities("https:", undefined);

  assert.equal(result.ok, true);
  assert.equal(result.capabilities.edition, "full");
  assert.equal(result.capabilities.platform, "browser");
});

test("Windows desktop rejects capabilities that could enable secrets or export", () => {
  const unsafe = {
    edition: "full",
    platform: "win32",
    supportsSecrets: true,
    supportsExport: true,
    supportsAutomation: true,
    globalShortcut: "Ctrl+Alt+Space",
  };

  assert.equal(resolveRuntimeCapabilities("http:", unsafe, true).ok, false);
});

test("Windows desktop rejects a bridge that exposes automation", () => {
  assert.equal(resolveRuntimeCapabilities("http:", { ...safeWindowsCapabilities, supportsAutomation: true }, true).ok, false);
  assert.equal(resolveRuntimeCapabilities("http:", safeWindowsCapabilities, true).ok, true);
});

test("snippet-only scoped imports preserve numbering and reject secret-only backups", () => {
  const current = {
    items: [snippet("existing", "客服")],
    folders: { secret: [], snippet: ["客服"] },
    nextSnippetNumber: 41,
  };
  const secretOnly = {
    items: [secret("only")],
    folders: { secret: ["工作"], snippet: [] },
    nextSnippetNumber: 1,
  };

  const rejected = prepareImportForEdition(current, secretOnly, "merge", "snippet-only", () => "fresh-id", "secret");
  assert.equal(rejected.shouldPersist, false);
  assert.equal(rejected.data.nextSnippetNumber, 42);
});

test("Windows removes legacy vault archives while the full edition preserves them", () => {
  assert.equal(legacyVaultActionForEdition("snippet-only"), "remove");
  assert.equal(legacyVaultActionForEdition("full"), "preserve");
});
