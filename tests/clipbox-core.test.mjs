import assert from "node:assert/strict";
import test from "node:test";
import * as core from "../app/clipbox-core.ts";

const {
  addFolder,
  attemptEditorSave,
  buildDirectoryShortcuts,
  canAddItemInFolder,
  canHandleHomeShortcuts,
  combineSecretSegments,
  DEFAULT_ITEM_KIND,
  isTrashedItem,
  limitChars,
  mergeFolderRegistries,
  mergeImportedVaultData,
  modalInteractionState,
  normalizeReferenceNote,
  normalizeVaultData,
  permanentlyDeleteTrashedItem,
  parseRefreshContext,
  normalizeSecretSegments,
  resolveAiRewrite,
  tidyText,
  resolveConnectedFocusTarget,
  resolveFocusWrapIndex,
  resolvePostCommitFocusTarget,
  resolveRefreshedActiveFolder,
  resolveRefreshedFolder,
  resolveSelectedFolder,
  restoreTrashedItem,
  selectItemsByTrashState,
  splitSecretSegments,
  synchronizeVaultData,
  vaultDataForBackupScope,
  moveItemToTrash,
  toggleItemKind,
} = core;

const legacyItems = [
  { id: "s1", label: "登录", secret: "alpha", note: "", color: "#fff", kind: "secret", folder: "工作", createdAt: 1, updatedAt: 1 },
  { id: "t1", label: "售后", secret: "hello", note: "", color: "#fff", kind: "snippet", folder: "客服", createdAt: 1, updatedAt: 1 },
];

const standardSnippetFolders = ["询盘接待", "产品样品", "报价成交", "定制生产", "客户跟进", "物流清关", "售后争议"];

test("opens snippets first and toggles between the two content kinds", () => {
  assert.equal(DEFAULT_ITEM_KIND, "snippet");
  assert.equal(toggleItemKind(DEFAULT_ITEM_KIND), "secret");
  assert.equal(toggleItemKind("secret"), "snippet");
});

test("limits summaries by Unicode code point", () => {
  assert.equal(limitChars("一二三四五六七八九十十一"), "一二三四五六七八九十");
  assert.equal(limitChars("😀😀😀", 2), "😀😀");
});

test("normalizes an encrypted secret reference note without splitting Unicode", () => {
  assert.equal(typeof normalizeReferenceNote, "function");
  assert.equal(normalizeReferenceNote("  Shopify API  "), "Shopify API");
  assert.equal(normalizeReferenceNote(`${"引".repeat(119)}😀尾`), `${"引".repeat(119)}😀`);
});

test("splits a secret at the first line break and recombines both segments without loss", () => {
  assert.equal(typeof splitSecretSegments, "function");
  assert.deepEqual(splitSecretSegments("账号@example.com\n密码123\n备用说明"), ["账号@example.com", "密码123\n备用说明"]);
  assert.deepEqual(splitSecretSegments("只有一段"), ["只有一段", ""]);
  assert.equal(combineSecretSegments(["账号@example.com", "密码123\n备用说明"]), "账号@example.com\n密码123\n备用说明");
});

test("keeps only an explicit pair of encrypted secret segments", () => {
  assert.equal(typeof normalizeSecretSegments, "function");
  assert.deepEqual(normalizeSecretSegments(["第一段", "第二段"]), ["第一段", "第二段"]);
  assert.equal(normalizeSecretSegments(["只有一段"]), undefined);
  assert.equal(normalizeSecretSegments("第一段\n第二段"), undefined);
});

test("returns an editor save error while preserving control after persistence fails", async () => {
  assert.equal(typeof attemptEditorSave, "function");
  assert.deepEqual(await attemptEditorSave(async () => undefined), { saved: true, error: "" });
  assert.deepEqual(
    await attemptEditorSave(async () => { throw new Error("disk full"); }),
    { saved: false, error: "保存失败，当前内容仍保留，请重试" },
  );
});

test("normalizes a legacy item array into per-kind encrypted folders", () => {
  const normalized = normalizeVaultData(legacyItems);
  assert.deepEqual(normalized, {
    items: [legacyItems[0], { ...legacyItems[1], snippetNumber: "CB-0001" }],
    folders: { secret: ["工作"], snippet: [...standardSnippetFolders, "客服"] },
    nextSnippetNumber: 2,
  });
});

test("normalizes and deduplicates a new vault payload", () => {
  const data = normalizeVaultData({
    items: legacyItems,
    folders: { secret: [" 工作 ", "工作", "个人"], snippet: ["客服"] },
  });
  assert.deepEqual(data.folders, { secret: ["工作", "个人"], snippet: [...standardSnippetFolders, "客服"] });
});

test("moves both content kinds to an encrypted trash view without losing their metadata", () => {
  const snippet = { ...legacyItems[1], folder: "售后争议", snippetNumber: "CB-0042", pinned: true };
  const source = [legacyItems[0], snippet];
  const withSecretTrashed = moveItemToTrash(source, "s1", 2_000);
  const withBothTrashed = moveItemToTrash(withSecretTrashed, "t1", 3_000);

  assert.equal(isTrashedItem(withBothTrashed[0]), true);
  assert.equal(isTrashedItem(withBothTrashed[1]), true);
  assert.equal(source[0].deletedAt, undefined);
  assert.deepEqual(
    selectItemsByTrashState(withBothTrashed, "secret", "trash").map((item) => item.id),
    ["s1"],
  );
  assert.deepEqual(
    selectItemsByTrashState(withBothTrashed, "snippet", "active").map((item) => item.id),
    [],
  );
  assert.equal(withBothTrashed[1].folder, "售后争议");
  assert.equal(withBothTrashed[1].snippetNumber, "CB-0042");
  assert.equal(withBothTrashed[1].pinned, true);
});

test("restores a trashed item exactly and permanently deletes only trashed items", () => {
  const trashed = moveItemToTrash(
    [{ ...legacyItems[1], folder: "客户跟进", snippetNumber: "CB-0016" }],
    "t1",
    4_000,
  );
  const restored = restoreTrashedItem(trashed, "t1");

  assert.equal(restored[0].deletedAt, undefined);
  assert.equal(restored[0].folder, "客户跟进");
  assert.equal(restored[0].snippetNumber, "CB-0016");
  assert.deepEqual(permanentlyDeleteTrashedItem(restored, "t1").map((item) => item.id), ["t1"]);
  assert.deepEqual(permanentlyDeleteTrashedItem(trashed, "t1"), []);
});

test("drops retired snippet priority while preserving legacy structured metadata", () => {
  const structured = {
    ...legacyItems[1],
    snippetMeta: {
      stage: "客服",
      scene: "售后",
      action: "回复",
      productGroups: ["通用"],
      rawProduct: "通用",
      chineseText: "您好",
      placeholders: [],
      requiredInputs: [],
      usageNote: "保持礼貌",
      priority: "高",
      requiresVerification: false,
      sourceRow: 2,
    },
  };

  const normalized = normalizeVaultData({ items: [structured], folders: { secret: [], snippet: ["客服"] } });
  assert.equal("priority" in normalized.items[0].snippetMeta, false);
  assert.equal(normalized.items[0].snippetMeta.action, "回复");
  assert.equal(normalized.items[0].snippetMeta.usageNote, "保持礼貌");
});

test("creates custom snippet directories after the fixed standard directories", () => {
  const first = addFolder({ secret: [], snippet: standardSnippetFolders }, "snippet", " VIP 客户 ");
  assert.deepEqual(first, {
    folders: { secret: [], snippet: [...standardSnippetFolders, "VIP 客户"] },
    folder: "VIP 客户",
    created: true,
  });
  assert.equal(addFolder(first.folders, "snippet", "VIP 客户").created, false);
  assert.equal(addFolder(first.folders, "snippet", "   ").folder, "");
});

test("merges folder registries without crossing content kinds", () => {
  assert.deepEqual(
    mergeFolderRegistries(
      { secret: ["工作"], snippet: ["售后"] },
      { secret: ["个人"], snippet: ["售后", "物流"] },
    ),
    { secret: ["工作", "个人"], snippet: [...standardSnippetFolders, "售后", "物流"] },
  );
});

test("merges imported items and per-kind folders without duplicate content", () => {
  const current = normalizeVaultData(legacyItems);
  const incoming = normalizeVaultData({
    items: [legacyItems[1], { ...legacyItems[0], id: "s1", label: "新秘密", secret: "beta", folder: "个人" }],
    folders: { secret: ["空秘密"], snippet: ["空话术"] },
  });
  const result = mergeImportedVaultData(current, incoming, "merge", () => "fresh-id");
  assert.equal(result.importedCount, 1);
  assert.deepEqual(result.data.items.map((item) => item.id), ["fresh-id", "s1", "t1"]);
  assert.deepEqual(result.data.folders, {
    secret: ["工作", "空秘密", "个人"],
    snippet: [...standardSnippetFolders, "客服", "空话术"],
  });
});

const mergeBase = { id: "m1", label: "地址", secret: "台北", note: "", color: "#fff", kind: "snippet", folder: "客服", createdAt: 1, updatedAt: 1 };

test("merge import restores a trashed entry whose identical copy is in the backup", () => {
  const current = normalizeVaultData({ items: [{ ...mergeBase, deletedAt: 50 }] });
  const incoming = normalizeVaultData({ items: [{ ...mergeBase, id: "other" }] });
  const result = mergeImportedVaultData(current, incoming, "merge", () => "fresh-id");
  assert.equal(result.importedCount, 1);
  assert.equal(result.data.items.length, current.items.length);
  const restored = result.data.items.find((item) => item.id === "m1");
  assert.ok(restored);
  assert.equal(isTrashedItem(restored), false);
  assert.equal("deletedAt" in restored, false);
  assert.equal(restored.snippetNumber, current.items[0].snippetNumber);
  assert.equal(restored.folder, "客服");
});

test("merge import still skips an entry that is already active", () => {
  const current = normalizeVaultData({ items: [mergeBase] });
  const incoming = normalizeVaultData({ items: [{ ...mergeBase, id: "other" }] });
  const result = mergeImportedVaultData(current, incoming, "merge", () => "fresh-id");
  assert.equal(result.importedCount, 0);
  assert.deepEqual(result.data.items.map((item) => item.id), ["m1"]);
});

test("merge import restores nothing when an active copy exists beside a trashed one", () => {
  const current = normalizeVaultData({ items: [mergeBase, { ...mergeBase, id: "m2", deletedAt: 50 }] });
  const incoming = normalizeVaultData({ items: [{ ...mergeBase, id: "other" }] });
  const result = mergeImportedVaultData(current, incoming, "merge", () => "fresh-id");
  assert.equal(result.importedCount, 0);
  assert.equal(isTrashedItem(result.data.items.find((item) => item.id === "m2")), true);
  assert.equal(isTrashedItem(result.data.items.find((item) => item.id === "m1")), false);
});

test("merge import keeps skipping a trashed incoming entry that matches a trashed current one", () => {
  const current = normalizeVaultData({ items: [{ ...mergeBase, deletedAt: 50 }] });
  const incoming = normalizeVaultData({ items: [{ ...mergeBase, id: "other", deletedAt: 60 }] });
  const result = mergeImportedVaultData(current, incoming, "merge", () => "fresh-id");
  assert.equal(result.importedCount, 0);
  assert.deepEqual(result.data.items.map((item) => [item.id, item.deletedAt]), [["m1", 50]]);
});

test("replace import discards current items and directories", () => {
  const incoming = normalizeVaultData({ items: [], folders: { secret: ["空秘密"], snippet: ["空话术"] } });
  const result = mergeImportedVaultData(normalizeVaultData(legacyItems), incoming, "replace", () => "unused");
  assert.deepEqual(result, { data: incoming, importedCount: 0 });
});

test("builds separate backup payloads without crossing secrets and snippets", () => {
  const current = normalizeVaultData({
    items: legacyItems,
    folders: { secret: ["工作", "个人"], snippet: ["询盘接待"] },
    nextSnippetNumber: 9,
  });

  const snippets = vaultDataForBackupScope(current, "snippet");
  const secrets = vaultDataForBackupScope(current, "secret");

  assert.deepEqual(snippets.items.map((item) => item.id), ["t1"]);
  assert.equal(JSON.stringify(snippets).includes("alpha"), false);
  assert.deepEqual(snippets.folders, { secret: [], snippet: [...standardSnippetFolders, "客服"] });
  assert.equal(snippets.nextSnippetNumber, 10);

  assert.deepEqual(secrets.items.map((item) => item.id), ["s1"]);
  assert.equal(JSON.stringify(secrets).includes("hello"), false);
  assert.deepEqual(secrets.folders, { secret: ["工作", "个人"], snippet: standardSnippetFolders });
  assert.equal(secrets.nextSnippetNumber, 1);
});

test("scoped replace import changes only the matching content kind", () => {
  const current = normalizeVaultData({
    items: legacyItems,
    folders: { secret: ["工作"], snippet: ["询盘接待"] },
    nextSnippetNumber: 8,
  });
  const incomingSnippet = normalizeVaultData({
    items: [{ ...legacyItems[1], id: "t2", label: "新话术", secret: "new copy" }],
    folders: { secret: [], snippet: ["产品样品"] },
    nextSnippetNumber: 12,
  });
  const incomingSecret = normalizeVaultData({
    items: [{ ...legacyItems[0], id: "s2", label: "新秘密", secret: "new secret", folder: "个人" }],
    folders: { secret: ["个人"], snippet: [] },
  });

  const snippetsReplaced = mergeImportedVaultData(current, incomingSnippet, "replace", () => "unused", "snippet").data;
  assert.deepEqual(snippetsReplaced.items.map((item) => item.id), ["t2", "s1"]);
  assert.equal(snippetsReplaced.items.find((item) => item.id === "s1").secret, "alpha");
  assert.deepEqual(snippetsReplaced.folders.secret, ["工作"]);
  assert.equal(snippetsReplaced.nextSnippetNumber, 13);

  const secretsReplaced = mergeImportedVaultData(current, incomingSecret, "replace", () => "unused", "secret").data;
  assert.deepEqual(secretsReplaced.items.map((item) => item.id), ["s2", "t1"]);
  assert.equal(secretsReplaced.items.find((item) => item.id === "t1").secret, "hello");
  assert.deepEqual(secretsReplaced.folders.secret, ["个人"]);
  assert.equal(secretsReplaced.nextSnippetNumber, 9);
});

test("synchronizes a newly saved folder while retaining empty scoped directories", () => {
  const data = synchronizeVaultData(
    [{ ...legacyItems[0], id: "s2", label: "账单", folder: "财务" }],
    { secret: ["空秘密"], snippet: ["空话术"] },
  );
  assert.deepEqual(data.folders, {
    secret: ["空秘密", "财务"],
    snippet: [...standardSnippetFolders, "空话术"],
  });
});

test("keeps supplied and item-derived custom snippet directories through normalization", () => {
  const data = normalizeVaultData({
    items: [{ ...legacyItems[1], folder: "重点客户" }],
    folders: { secret: [], snippet: ["产品样品", "团队专用"] },
  });

  assert.deepEqual(data.folders.snippet, [...standardSnippetFolders, "团队专用", "重点客户"]);
});

test("builds all and favorite shortcuts for the active content kind", () => {
  assert.equal(typeof buildDirectoryShortcuts, "function");
  const items = [
    { ...legacyItems[0], pinned: true },
    { ...legacyItems[1], pinned: true },
    { ...legacyItems[1], id: "t2", pinned: false },
    { ...legacyItems[1], id: "trash", pinned: true, deletedAt: 10 },
  ];

  assert.deepEqual(buildDirectoryShortcuts(items, "snippet"), [
    { id: "all", label: "全部话术", count: 2 },
    { id: "pinned", label: "收藏", count: 1 },
    { id: "recent", label: "最近", count: 0 },
  ]);
  assert.deepEqual(buildDirectoryShortcuts(items, "secret"), [
    { id: "all", label: "全部", count: 1 },
    { id: "pinned", label: "收藏", count: 1 },
    { id: "recent", label: "最近", count: 0 },
  ]);
});

test("keeps favorites after refresh and hides add controls in virtual directories", () => {
  assert.equal(typeof resolveRefreshedActiveFolder, "function");
  assert.equal(resolveRefreshedActiveFolder("snippet", standardSnippetFolders, "pinned"), "pinned");
  assert.equal(resolveRefreshedActiveFolder("snippet", standardSnippetFolders, "uncategorized"), "all");
  assert.equal(resolveRefreshedActiveFolder("secret", [], "uncategorized"), "uncategorized");
  assert.equal(canAddItemInFolder("all"), true);
  assert.equal(canAddItemInFolder("folder:团队专用"), true);
  assert.equal(canAddItemInFolder("pinned"), false);
  assert.equal(canAddItemInFolder("trash"), false);
});

test("accepts only an available directory selection", () => {
  assert.equal(resolveSelectedFolder(["售后", "物流"], "物流"), "物流");
  assert.equal(resolveSelectedFolder(["售后", "物流"], "不存在"), "");
});

test("accepts and normalizes a handwritten directory when custom folders are enabled", () => {
  assert.equal(resolveSelectedFolder(["工作"], "  新项目  ", true), "新项目");
  assert.equal(resolveSelectedFolder(["工作"], "一".repeat(31), true), "一".repeat(30));
  assert.equal(resolveSelectedFolder(["工作"], "   ", true), "");
});

test("preserves valid special and custom folders after refresh", () => {
  assert.equal(resolveRefreshedFolder(["报价", "售后"], "folder:售后"), "folder:售后");
  assert.equal(resolveRefreshedFolder(["报价"], "folder:已删除"), "all");
  assert.equal(resolveRefreshedFolder([], "pinned"), "pinned");
  assert.equal(resolveRefreshedFolder([], "uncategorized"), "uncategorized");
  assert.equal(resolveRefreshedFolder([], "trash"), "trash");
});

test("parses the one-shot view context used by an application refresh", () => {
  assert.deepEqual(parseRefreshContext(JSON.stringify({
    activeKind: "snippet",
    activeFolder: "folder:开发",
    productFilter: "镊子",
    query: "tweezer",
  })), {
    activeKind: "snippet",
    activeFolder: "folder:开发",
    productFilter: "镊子",
    query: "tweezer",
  });
});

test("rejects malformed or invalid application refresh context", () => {
  assert.equal(parseRefreshContext("{"), null);
  assert.equal(parseRefreshContext(JSON.stringify({ activeKind: "account", activeFolder: "all", productFilter: "全部产品", query: "" })), null);
  assert.equal(parseRefreshContext(JSON.stringify({ activeKind: "secret", activeFolder: 7, productFilter: "全部产品", query: "" })), null);
});

test("tidyText cleans spacing and blank lines but keeps [变量]", () => {
  assert.equal(tidyText("Hi  [name] ,thanks!We   will  follow up.\r\n\r\n\r\n\r\n 您好  ，请查收 [quote] 。 "), "Hi [name], thanks! We will follow up.\n\n您好，请查收 [quote]。");
  assert.equal(tidyText("We will reply soon . Thanks ."), "We will reply soon. Thanks.");
  assert.equal(tidyText("你 好 世 界 {order}"), "你好世界 {order}");
  assert.equal(tidyText("https://a.com/x 10:30"), "https://a.com/x 10:30");
});

test("accepts an AI rewrite only while the content is unchanged", () => {
  assert.deepEqual(resolveAiRewrite("原内容", "原内容", "  润色后  "), { text: "润色后", stale: false, error: "" });
  assert.deepEqual(resolveAiRewrite("原内容", "手动改过", "润色后"), { text: "手动改过", stale: true, error: "" });
  assert.deepEqual(resolveAiRewrite("原内容", "原内容", ""), { text: "原内容", stale: false, error: "暂时无法生成，内容没有改动" });
  assert.deepEqual(resolveAiRewrite("原内容", "原内容", "原内容"), { text: "原内容", stale: false, error: "已经很整齐了，没有需要改的地方" });
});

test("disables Home shortcuts while any modal owns interaction", () => {
  assert.equal(canHandleHomeShortcuts(false, false, false), true);
  assert.equal(canHandleHomeShortcuts(true, false, false), false);
  assert.equal(canHandleHomeShortcuts(false, true, false), false);
  assert.equal(canHandleHomeShortcuts(false, false, true), false);
});

test("keeps the background inert for every modal state", () => {
  assert.deepEqual(modalInteractionState(false, false, false), { homeShortcutsEnabled: true, backgroundInert: false });
  assert.deepEqual(modalInteractionState(true, false, false), { homeShortcutsEnabled: false, backgroundInert: true });
  assert.deepEqual(modalInteractionState(false, true, false), { homeShortcutsEnabled: false, backgroundInert: true });
  assert.deepEqual(modalInteractionState(false, false, true), { homeShortcutsEnabled: false, backgroundInert: true });
});

test("wraps modal focus in both directions and recovers from outside focus", () => {
  assert.equal(resolveFocusWrapIndex(0, 6, true), 5);
  assert.equal(resolveFocusWrapIndex(5, 6, false), 0);
  assert.equal(resolveFocusWrapIndex(-1, 6, false), 0);
  assert.equal(resolveFocusWrapIndex(-1, 6, true), 5);
  assert.equal(resolveFocusWrapIndex(2, 6, false), -1);
});

test("restores focus only to a connected opener, then a connected logical fallback", () => {
  const connectedOpener = { id: "row", isConnected: true };
  const removedOpener = { id: "deleted-row", isConnected: false };
  const searchFallback = { id: "search", isConnected: true };
  assert.equal(resolveConnectedFocusTarget(connectedOpener, searchFallback), connectedOpener);
  assert.equal(resolveConnectedFocusTarget(removedOpener, searchFallback), searchFallback);
  assert.equal(resolveConnectedFocusTarget(removedOpener, { id: "gone", isConnected: false }), null);
});

test("waits for modal teardown before resolving a disconnected opener fallback", () => {
  const connectedOpener = { id: "row", isConnected: true };
  const removedOpener = { id: "deleted-row", isConnected: false };
  const searchFallback = { id: "search", isConnected: true };

  assert.equal(resolvePostCommitFocusTarget({ trigger: removedOpener }, true, true, searchFallback), null);
  assert.equal(resolvePostCommitFocusTarget({ trigger: removedOpener }, false, true, searchFallback), null);
  assert.equal(resolvePostCommitFocusTarget(null, false, false, searchFallback), null);
  assert.equal(resolvePostCommitFocusTarget({ trigger: removedOpener }, false, false, searchFallback), searchFallback);
  assert.equal(resolvePostCommitFocusTarget({ trigger: connectedOpener }, false, false, searchFallback), connectedOpener);
});

test("the trash view lists trashed entries from every folder", () => {
  const items = [
    { id: "a", label: "A", secret: "a", note: "", color: "", kind: "snippet", folder: "售后争议", deletedAt: 5, createdAt: 1, updatedAt: 1 },
    { id: "b", label: "B", secret: "b", note: "", color: "", kind: "snippet", folder: "", deletedAt: 6, createdAt: 1, updatedAt: 1 },
    { id: "c", label: "C", secret: "c", note: "", color: "", kind: "snippet", folder: "售后争议", createdAt: 1, updatedAt: 1 },
  ];
  const trashed = core.selectItemsByTrashState(items, "snippet", "trash");
  assert.deepEqual(trashed.filter((item) => core.itemMatchesActiveFolder(item, "trash")).map((item) => item.id), ["a", "b"]);
  assert.equal(core.itemMatchesActiveFolder(items[2], "folder:售后争议"), true);
  assert.equal(core.itemMatchesActiveFolder(items[2], "folder:询盘接待"), false);
  assert.equal(core.itemMatchesActiveFolder(items[1], "uncategorized"), true);
  assert.equal(core.itemMatchesActiveFolder({ ...items[2], pinned: true }, "pinned"), true);
});

const mk = (id, kind, folder, extra = {}) => ({ id, label: id, secret: "x", note: "", color: "#fff", kind, folder, createdAt: 1, updatedAt: 1, ...extra });
const baseVault = () => core.normalizeVaultData({
  items: [mk("s1", "secret", "AWS"), mk("s2", "secret", "AWS", { deletedAt: 5 }), mk("s3", "secret", ""), mk("n1", "snippet", "询盘接待")],
  folders: { secret: ["AWS", "GitHub"], snippet: [...standardSnippetFolders, "自定义"] },
});

test("renames a folder everywhere, including colors and trashed items", () => {
  const colored = core.setFolderColor(baseVault(), "secret", "AWS", "#F06F7D");
  const { data, error } = core.renameFolder(colored, "secret", "AWS", " 云服务 ");
  assert.equal(error, undefined);
  assert.deepEqual(data.folders.secret, ["云服务", "GitHub"]);
  assert.equal(data.items.find((i) => i.id === "s1").folder, "云服务");
  assert.equal(data.items.find((i) => i.id === "s2").folder, "云服务");
  assert.equal(data.folderColors.secret["云服务"], "#f06f7d");
  assert.equal(data.folderColors.secret.AWS, undefined);
  assert.match(core.renameFolder(colored, "secret", "AWS", "GitHub").error, /同名/);
  assert.match(core.renameFolder(colored, "snippet", "询盘接待", "新名").error, /标准话术目录/);
});

test("deleting a secret folder moves its items to uncategorized; snippet folders must be empty", () => {
  const { data, moved } = core.deleteFolder(baseVault(), "secret", "AWS");
  assert.equal(moved, 2);
  assert.deepEqual(data.folders.secret, ["GitHub"]);
  assert.equal(data.items.find((i) => i.id === "s1").folder, "");
  const withSnippet = core.normalizeVaultData({ ...baseVault(), items: [...baseVault().items, mk("n2", "snippet", "自定义")] });
  assert.match(core.deleteFolder(withSnippet, "snippet", "自定义").error, /还有 1 条/);
  assert.deepEqual(core.deleteFolder(baseVault(), "snippet", "自定义").data.folders.snippet, standardSnippetFolders);
  assert.match(core.deleteFolder(baseVault(), "snippet", "询盘接待").error, /标准话术目录/);
});

test("folder colors survive normalization, scoped backups and merges but drop for missing folders", () => {
  const vault = core.setFolderColor(core.setFolderColor(baseVault(), "snippet", "询盘接待", "#62C483"), "secret", "GitHub", "#4DBFC4");
  assert.equal(core.normalizeVaultData(vault).folderColors.snippet["询盘接待"], "#62c483");
  assert.deepEqual(core.vaultDataForBackupScope(vault, "secret").folderColors, { secret: { GitHub: "#4dbfc4" }, snippet: {} });
  const merged = core.mergeImportedVaultData(baseVault(), core.vaultDataForBackupScope(vault, "secret"), "merge", () => "id").data;
  assert.equal(merged.folderColors.secret.GitHub, "#4dbfc4");
  assert.equal(core.setFolderColor(vault, "secret", "GitHub", null).folderColors?.secret?.GitHub, undefined);
  assert.equal(core.normalizeVaultData({ ...vault, folders: { ...vault.folders, secret: [] } }).folderColors?.secret?.GitHub, undefined);
  assert.equal("folderColors" in baseVault(), false);
});

// D-049: short names for own folders on the mini window.
const set = (data, kind, folder, value) => {
  const result = core.setFolderShortName(data, kind, folder, value);
  assert.equal(result.error, undefined, `${kind}/${folder}=${value}`);
  return result.data;
};

test("folder short names: set, clear, rejected when too long, never for standard 话术 folders", () => {
  const vault = set(set(baseVault(), "snippet", "自定义", " 跟单 "), "secret", "GitHub", "GH");
  assert.deepEqual(vault.folderShortNames, { snippet: { 自定义: "跟单" }, secret: { GitHub: "GH" } });
  const tooLong = core.setFolderShortName(vault, "snippet", "自定义", "跟单员");
  assert.equal(tooLong.error, "最多两个字");
  assert.equal(tooLong.data, vault, "nothing changes");
  assert.match(core.setFolderShortName(vault, "snippet", "询盘接待", "新客").error, /固定/);
  assert.match(core.setFolderShortName(vault, "snippet", "没有", "新客").error, /目录不存在/);
  const cleared = set(vault, "snippet", "自定义", "");
  assert.deepEqual(cleared.folderShortNames, { secret: { GitHub: "GH" } }, "a kind without short names is left out");
  const none = set(cleared, "secret", "GitHub", null);
  assert.equal("folderShortNames" in none, false, "no field once the last one is cleared");
});

test("folder short names: invalid stored values are dropped on load; a vault without them is unchanged", () => {
  const loaded = core.normalizeVaultData({
    ...baseVault(),
    folderShortNames: {
      snippet: { 自定义: "跟单", 询盘接待: "新客", 没有这个目录: "无", 未分类: "未" },
      secret: { AWS: "云服务器", GitHub: "  ", "": "空" },
      other: { x: "y" },
    },
  });
  assert.deepEqual(loaded.folderShortNames, { snippet: { 自定义: "跟单" } });
  assert.equal("folderShortNames" in core.normalizeVaultData({ ...baseVault(), folderShortNames: "跟单" }), false);
  assert.equal("folderShortNames" in core.normalizeVaultData({ ...baseVault(), folderShortNames: { snippet: { 自定义: 12 } } }), false);
  // An old vault (no field) saves byte for byte as before.
  const old = { items: baseVault().items, folders: baseVault().folders, nextSnippetNumber: baseVault().nextSnippetNumber };
  assert.equal(JSON.stringify(core.normalizeVaultData(old)), JSON.stringify(baseVault()));
  assert.equal(JSON.stringify(core.synchronizeVaultData(old.items, old.folders, old.nextSnippetNumber)).includes("folderShortNames"), false);
});

test("folder short names move with a rename and go with a delete", () => {
  const vault = set(set(baseVault(), "secret", "AWS", "云"), "snippet", "自定义", "跟单");
  const renamed = core.renameFolder(vault, "secret", "AWS", "云服务").data;
  assert.deepEqual(renamed.folderShortNames.secret, { 云服务: "云" });
  assert.deepEqual(renamed.folderShortNames.snippet, { 自定义: "跟单" }, "the other kind is untouched");
  const deleted = core.deleteFolder(renamed, "snippet", "自定义").data;
  assert.equal(deleted.folderShortNames.snippet, undefined);
  assert.deepEqual(core.deleteFolder(deleted, "secret", "云服务").data.folderShortNames, undefined);
  // A new folder that reuses a deleted name does not inherit the old short name.
  const again = core.normalizeVaultData({ ...deleted, folders: addFolder(deleted.folders, "snippet", "自定义").folders });
  assert.equal(again.folderShortNames?.snippet, undefined);
});

test("folder short names survive scoped backups (JSON round trip), merges and replaces; old backups still import", () => {
  const vault = set(set(baseVault(), "secret", "GitHub", "GH"), "snippet", "自定义", "跟单");
  const fileOf = (scope) => JSON.parse(JSON.stringify(core.vaultDataForBackupScope(vault, scope)));
  assert.deepEqual(fileOf("snippet").folderShortNames, { snippet: { 自定义: "跟单" } });
  assert.deepEqual(fileOf("secret").folderShortNames, { secret: { GitHub: "GH" } });

  // Restoring into an empty vault brings them back.
  const empty = core.normalizeVaultData({ items: [], folders: { secret: [], snippet: [] } });
  const replaced = core.mergeImportedVaultData(empty, core.normalizeVaultData(fileOf("snippet")), "replace", () => "id", "snippet").data;
  assert.deepEqual(replaced.folderShortNames, { snippet: { 自定义: "跟单" } });
  const merged = core.mergeImportedVaultData(empty, core.normalizeVaultData(fileOf("secret")), "merge", () => "id", "secret").data;
  assert.deepEqual(merged.folderShortNames, { secret: { GitHub: "GH" } });
  const whole = core.mergeImportedVaultData(empty, core.normalizeVaultData(JSON.parse(JSON.stringify(vault))), "replace", () => "id").data;
  assert.deepEqual(whole.folderShortNames, vault.folderShortNames);

  // Merging: what is here wins over the backup.
  const here = set(baseVault(), "snippet", "自定义", "客");
  assert.deepEqual(core.mergeImportedVaultData(here, core.normalizeVaultData(fileOf("snippet")), "merge", () => "id", "snippet").data.folderShortNames, { snippet: { 自定义: "客" } });

  // An old backup has no short names: merge keeps the ones here; replacing one kind keeps the other kind's.
  const oldBackup = JSON.parse(JSON.stringify(core.vaultDataForBackupScope(baseVault(), "snippet")));
  assert.equal("folderShortNames" in oldBackup, false);
  assert.deepEqual(core.mergeImportedVaultData(vault, core.normalizeVaultData(oldBackup), "merge", () => "id", "snippet").data.folderShortNames, vault.folderShortNames);
  const replacedOld = core.mergeImportedVaultData(vault, core.normalizeVaultData(oldBackup), "replace", () => "id", "snippet").data;
  assert.deepEqual(replacedOld.folderShortNames, { secret: { GitHub: "GH" } });
  assert.equal(replacedOld.items.filter((item) => item.kind === "secret").length, 3);
});

test("bulk helpers move, trash and restore only the chosen active items", () => {
  const items = baseVault().items;
  const moved = core.moveItemsToFolder(items, ["s1", "s2", "n1"], "GitHub", 9);
  assert.equal(moved.find((i) => i.id === "s1").folder, "GitHub");
  assert.equal(moved.find((i) => i.id === "s2").folder, "AWS");
  assert.equal(moved.find((i) => i.id === "n1").snippetMeta, undefined);
  const trashed = core.moveItemsToTrash(items, ["s1", "s3"], 7);
  assert.equal(trashed.filter((i) => i.deletedAt === 7).length, 2);
  assert.equal(core.restoreTrashedItems(trashed, ["s1"]).find((i) => i.id === "s1").deletedAt, undefined);
});

test("recent folder lists used items and search highlighting splits on every term", () => {
  assert.equal(core.itemMatchesActiveFolder(mk("a", "secret", "", { lastUsedAt: 3 }), "recent"), true);
  assert.equal(core.itemMatchesActiveFolder(mk("a", "secret", ""), "recent"), false);
  assert.equal(core.canAddItemInFolder("recent"), false);
  assert.deepEqual(core.splitSearchHighlight("Quote follow-up", "quote UP"), [
    { text: "Quote", hit: true }, { text: " follow-", hit: false }, { text: "up", hit: true },
  ]);
  assert.deepEqual(core.splitSearchHighlight("abc", ""), [{ text: "abc", hit: false }]);
});

test("the company ids already received live in the vault, survive normalising and travel in snippet backups", async () => {
  const core = await import("../app/clipbox-core.ts");
  const data = core.normalizeVaultData({ items: [], folders: { secret: [], snippet: [] }, nextSnippetNumber: 1, sharedSeen: ["a", "b", "a", "", 5] });
  assert.deepEqual(data.sharedSeen, ["a", "b"]);
  assert.equal("sharedSeen" in core.normalizeVaultData({ items: [] }), false);
  assert.deepEqual(core.vaultDataForBackupScope(data, "snippet").sharedSeen, ["a", "b"]);
  assert.equal(core.vaultDataForBackupScope(data, "secret").sharedSeen, undefined);
  assert.deepEqual(core.synchronizeVaultData([], data.folders, 1, undefined, ["x"]).sharedSeen, ["x"]);
});

test("importing a backup keeps both sets of received company ids, so a deleted company 话术 stays gone", async () => {
  const core = await import("../app/clipbox-core.ts");
  const base = { items: [], folders: { secret: [], snippet: [] }, nextSnippetNumber: 1 };
  const merged = core.mergeImportedVaultData(core.normalizeVaultData({ ...base, sharedSeen: ["a"] }), core.normalizeVaultData({ ...base, sharedSeen: ["b", "a"] }), "merge", () => "id");
  assert.deepEqual(merged.data.sharedSeen?.sort(), ["a", "b"]);
  const replaced = core.mergeImportedVaultData(core.normalizeVaultData({ ...base, sharedSeen: ["a"] }), core.normalizeVaultData({ ...base, sharedSeen: ["b"] }), "replace", () => "id", "snippet");
  assert.deepEqual(replaced.data.sharedSeen?.sort(), ["a", "b"]);
});

test("formatBuildTime shows date and time to the minute, empty when missing or invalid", () => {
  assert.equal(core.formatBuildTime("2026-10-10T21:37:00"), "2026-10-10 21:37");
  assert.equal(core.formatBuildTime("2026-01-02T03:04:59"), "2026-01-02 03:04");
  assert.equal(core.formatBuildTime(""), "");
  assert.equal(core.formatBuildTime(undefined), "");
  assert.equal(core.formatBuildTime("not a date"), "");
});

test("snippet folders keep a saved order that has every standard folder (D-035); incomplete lists are rebuilt standard-first as before", () => {
  const standard = ["询盘接待", "产品样品", "报价成交", "定制生产", "客户跟进", "物流清关", "售后争议"];
  const reordered = ["产品样品", "自定义", "询盘接待", "报价成交", "定制生产", "客户跟进", "物流清关", "售后争议"];
  assert.deepEqual(normalizeVaultData({ items: [], folders: { secret: [], snippet: reordered } }).folders.snippet, reordered, "a full saved list keeps its order, standard folders included");
  assert.deepEqual(normalizeVaultData({ items: [], folders: { secret: [], snippet: ["自定义", "产品样品"] } }).folders.snippet, [...standard, "自定义"], "an incomplete list is rebuilt: standard first, then the others");
  assert.deepEqual(normalizeVaultData({ items: [], folders: { secret: [], snippet: [] } }).folders.snippet, standard, "a fresh vault starts in the standard order");
  // Normalizing twice changes nothing.
  const once = normalizeVaultData({ items: [], folders: { secret: [], snippet: reordered } });
  assert.deepEqual(normalizeVaultData(once).folders.snippet, reordered);
});

test("snippet numbers are shown as #001 while the stored CB-0001 value stays", async () => {
  const { displaySnippetNumber, formatSnippetNumber } = await import("../app/clipbox-order.ts");
  assert.equal(displaySnippetNumber("CB-0001"), "#001");
  assert.equal(displaySnippetNumber("CB-0014"), "#014");
  assert.equal(displaySnippetNumber("CB-1000"), "#1000");
  assert.equal(displaySnippetNumber(undefined), "");
  assert.equal(formatSnippetNumber(1), "CB-0001");
});
