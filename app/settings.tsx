"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "./arc/motion-tokens";
import { AiSettingsSection } from "./ai-settings";
import { ImageCompressSettings } from "./image-compress-settings";
import { McpConnectRows } from "./mcp-connect-ui";
import { ArcSegmented } from "./arc/segmented";
import { formatBuildTime, formatTaipeiDate, type SecretItem } from "./clipbox-core";
import { UsageSection } from "./usage-section";
import { AutoBackupRows } from "./auto-backup-ui";
import { testPreviewText, type TestContentPreview } from "./sample-snippets";
import { DataMoveDialog } from "./data-move";
import { AccountLockSettings, RecoveryCloseConfirm, type LockChange } from "./account-lock-ui";
import type { LockMode } from "./account-lock";
import { PLAIN_NOTES, SECRET_WORD } from "./platform";
import { TRASH_DAY_OPTIONS, type CloseBehavior, type MiniHidePolicy, type ThemeChoice } from "./preferences";
import { SettingsFolders, type SettingsFolderGroup, type SettingsFolderKind } from "./settings-folders";
import { BrandWordmark } from "./brand-wordmark";
import { TipsImportRow } from "./tips-import";
import { AutoLockRow } from "./account-auto-lock-ui";
import type { AutoLockSeconds } from "./account-auto-lock";
import { AutomationTrustRows, automationCardShown, useTrustedCallers } from "./automation-trust-ui";

// The groups of the left column. Each section below carries the id of the group it belongs to.
const SETTINGS_TABS = [["look", "概览"], ["folders", "目录"], ["data", "数据"], ["security", "安全"], ["usage", "使用排行"], ["window", "窗口"], ["ai", "AI"], ["about", "关于"]] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number][0];

function backupAgeLabel(at: number) {
  if (!at) return "还没有导出过";
  const days = Math.floor((Date.now() - at) / 86_400_000);
  const clock = new Date(at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  return `上次导出 ${clock}${days >= 1 ? `（${days} 天前）` : ""}`;
}

export function SettingsDialog({ testTools = false, onPreviewTest, onImportTest, onClearTest, version, buildTime, isDesktop, refreshing, itemCount, trashCount, miniHidePolicy, onMiniHidePolicy, folderGroups, onFolderAdd, onFolderRename, onFolderDelete, onFolderColor, onFolderShortName, onFolderMove, onFolderReorder, closeBehavior, onCloseBehavior, trashDays, onTrashDays, onEmptyTrash, theme, onTheme, lastBackupAt, onOpenDataFolder, onClose, onExport, onExportSecret, accountLock, slideUnlock, autoLock, accountLocked, onImport, onImportSheet, onReload, onMini, onShowGuide, onOpenAccount, syncCode, sharedLibrary, usageItems, onShowItem }: {
  // 导入测试内容 / 清除测试内容: the page adds or removes the marked test entries; the preview says how many of each kind would go.
  // Shown only with testTools (the browser and the web preview), never in the installed app: employees don't need them.
  testTools?: boolean; onPreviewTest?: () => Promise<TestContentPreview>; onImportTest?: () => Promise<void>; onClearTest?: () => Promise<void>;
  usageItems: SecretItem[]; onShowItem: (item: SecretItem) => void;
  version: string; buildTime?: string; isDesktop: boolean; refreshing: boolean; itemCount: number; trashCount: number;
  miniHidePolicy: MiniHidePolicy; onMiniHidePolicy: (policy: MiniHidePolicy) => void;
  folderGroups: SettingsFolderGroup[];
  onFolderAdd: (kind: SettingsFolderKind, name: string) => Promise<string>;
  onFolderRename: (kind: SettingsFolderKind, from: string, to: string) => Promise<string>;
  onFolderDelete: (kind: SettingsFolderKind, folder: string) => Promise<string>;
  onFolderColor: (kind: SettingsFolderKind, folder: string, color: string | null) => void;
  onFolderShortName: (kind: SettingsFolderKind, folder: string, shortName: string | null) => Promise<string>;
  onFolderMove: (kind: SettingsFolderKind, folder: string, delta: -1 | 1) => void;
  onFolderReorder: (kind: SettingsFolderKind, source: string, target: string) => void;
  closeBehavior: CloseBehavior; onCloseBehavior: (behavior: CloseBehavior) => void;
  trashDays: number; onTrashDays: (days: number) => void; onEmptyTrash: () => Promise<void>;
  theme: ThemeChoice; onTheme: (theme: ThemeChoice) => void; lastBackupAt: number; onOpenDataFolder: () => void;
  onClose: () => void; onExport: () => void; onExportSecret: () => void; accountLock: { mode: LockMode; deviceKey: string; onChanged: LockChange }; slideUnlock: { on: boolean; onChange: (on: boolean) => void }; autoLock: { seconds: AutoLockSeconds; onChange: (seconds: AutoLockSeconds) => void }; accountLocked: boolean; onImport: () => void; onImportSheet: () => void; onReload: () => void; onMini: () => void; onShowGuide: () => void;
  // Settings home → 账号: close Settings and show the 账号 page.
  onOpenAccount: () => void;
  syncCode: ReactNode;
  sharedLibrary: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [tab, setTab] = useState<SettingsTab>("look");
  const reducedMotion = useReducedMotion() ?? false;
  function onTabKey(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = SETTINGS_TABS.findIndex(([id]) => id === tab);
    const next = SETTINGS_TABS[(index + step + SETTINGS_TABS.length) % SETTINGS_TABS.length][0];
    setTab(next);
    document.getElementById(`settings-tab-${next}`)?.focus();
  }
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Set<string>>(new Set());
  const searching = query.trim() !== "";
  const hideSection = (forTab: SettingsTab, id: string) => (searching ? !hits.has(id) : tab !== forTab);
  const runSearch = (value: string) => {
    setQuery(value);
    const body = document.getElementById("settings-panel");
    if (!body) return;
    const q = value.trim().toLowerCase();
    const found = new Set<string>();
    body.querySelectorAll<HTMLElement>(":scope > section").forEach((section) => {
      const id = section.getAttribute("aria-labelledby") ?? "";
      const rows = section.querySelectorAll<HTMLElement>(".settings-row, .settings-note");
      const sectionHit = !!q && (section.querySelector("h3")?.textContent ?? "").toLowerCase().includes(q);
      let any = sectionHit;
      rows.forEach((row) => {
        const hit = !q || sectionHit || (row.textContent ?? "").toLowerCase().includes(q);
        row.toggleAttribute("data-search-miss", !hit);
        if (hit && q) any = true;
      });
      if (!rows.length && q && (section.textContent ?? "").toLowerCase().includes(q)) any = true;
      if (any) found.add(id);
    });
    setHits(found);
  };
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  // null = not asking; otherwise the names a clear would remove, shown before anything is deleted.
  const [confirmClearTest, setConfirmClearTest] = useState<TestContentPreview | null>(null);
  const [versionCopied, setVersionCopied] = useState(false);
  const [dataMove, setDataMove] = useState<"export" | "import" | null>(null);
  const [openedAt] = useState(() => Date.now());
  const builtAt = formatBuildTime(buildTime);
  const trustedCallers = useTrustedCallers();
  const [aiAvailable] = useState(() => typeof window !== "undefined" && "LanguageModel" in window);
  const [launchAtLogin, setLaunchAtLogin] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    window.clipboxDesktop?.getLaunchAtLogin?.().then((value) => { if (!cancelled) setLaunchAtLogin(value); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  // onClose is a fresh closure on every render of the page, so keep it in a ref:
  // re-running the effect would pull focus back to the close button mid-typing.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  // A recovery code on screen that is not confirmed as saved: closing asks first instead of throwing it away (D-042).
  const codeShowingRef = useRef(false);
  const [askClose, setAskClose] = useState(false);
  const askCloseRef = useRef(false);
  useEffect(() => { askCloseRef.current = askClose; });
  const requestClose = () => { if (codeShowingRef.current) setAskClose(true); else onCloseRef.current(); };
  const requestCloseRef = useRef(requestClose);
  useEffect(() => { requestCloseRef.current = requestClose; });
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { if (askCloseRef.current) { event.stopPropagation(); setAskClose(false); return; } if ((event.target as HTMLElement | null)?.closest?.("[data-local-esc]") || document.querySelector(".backup-backdrop") || document.querySelector(".settings-folder.dragging")) return; event.stopPropagation(); requestCloseRef.current(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  // Settings home links to a card on another page: switch to it, then bring the card into view.
  const goToCard = (to: SettingsTab, id: string) => {
    setTab(to);
    requestAnimationFrame(() => document.querySelector(`[aria-labelledby="${id}"]`)?.scrollIntoView({ block: "start" }));
  };
  // Read on every render of the home page, so a sync done on the 数据 page shows up when coming back.
  const updatedOn = formatTaipeiDate(buildTime);
  const row = (title: string, hint: string, action: () => void, label: string, disabled = false) => (
    <div className="settings-row"><div><strong>{title}</strong><small>{hint}</small></div><button type="button" className="secondary-button" onClick={action} disabled={disabled}>{label}</button></div>
  );
  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header><h2 id="settings-title">设置</h2><button ref={closeRef} type="button" className="icon-button" onClick={requestClose} aria-label="关闭设置">×</button></header>
        <div className="settings-layout">
        <div className="settings-side">
        <label className="settings-search"><input type="search" aria-label="搜索设置" value={query} onChange={(event) => runSearch(event.target.value)} placeholder="搜索设置" /></label>
        <div className="settings-tabs" role="tablist" aria-orientation="vertical" aria-label="设置分类">
          {SETTINGS_TABS.map(([id, label]) => (
            <button key={id} id={`settings-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls="settings-panel" tabIndex={tab === id ? 0 : -1} onKeyDown={onTabKey} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              {tab === id && <motion.span className="settings-tab-pill" layoutId="settings-tab-pill" transition={reducedMotion ? { duration: 0 } : motionTokens.spring.snappy} />}
              <span className="settings-tab-label">{label}</span>
            </button>
          ))}
        </div>
        </div>
        <div className="settings-body" id="settings-panel" data-searching={searching ? "" : undefined} role="tabpanel" aria-labelledby={`settings-tab-${tab}`}>
          {/* The first page opens with the product name and its Chinese name (D-044). */}
          {!searching && tab === "look" && <div className="settings-brand"><BrandWordmark className="settings-brand-mark" /><span className="settings-brand-text"><strong lang="en">Copyboxx</strong><span>复制盒</span></span>
            <span className="settings-brand-version">{version ? `v${version}` : "开发版本"}{updatedOn && <span> · {updatedOn}更新</span>}</span></div>}
          {/* 概览 opens with the wordmark alone, no page title under it (owner, 2026-10-15). */}
          {(searching || tab !== "look") && <h2 className="settings-page-title" aria-hidden="true">{searching ? "搜索结果" : SETTINGS_TABS.find(([id]) => id === tab)?.[1]}</h2>}
          {searching && hits.size === 0 && <p className="settings-empty">没有找到「{query.trim()}」相关的设置</p>}
          <section className="settings-card" aria-labelledby="set-look" hidden={hideSection("look", "set-look")}><h3 id="set-look">外观</h3>
            <div className="settings-row"><div><strong>主题</strong><small>跟随系统会随系统的深浅色设置自动切换</small></div>
              <ArcSegmented className="settings-segment" mode="radio" label="主题" value={theme} onSelect={(value) => onTheme(value as ThemeChoice)}
                options={[["system", "跟随系统"], ["light", "浅色"], ["dark", "深色"]].map(([value, label]) => ({ value, label }))} />
            </div>
          </section>
          <section className="settings-card" aria-labelledby="set-home-account" hidden={hideSection("look", "set-home-account")}><h3 id="set-home-account">账号与同步</h3>
            <div className="settings-row"><div><strong>账号</strong></div>
              <div className="settings-inline-actions"><button type="button" className="secondary-button" onClick={() => goToCard("security", "set-security")}>安全设置</button><button type="button" className="secondary-button" onClick={onOpenAccount}>打开账号页</button></div></div>
            {syncCode}
          </section>
          <section className="settings-card" data-solo="" aria-labelledby="set-folders" hidden={hideSection("folders", "set-folders")}><h3 id="set-folders">目录</h3>
            <SettingsFolders groups={folderGroups} onAdd={onFolderAdd} onRename={onFolderRename} onDelete={onFolderDelete} onColor={onFolderColor} onShortName={onFolderShortName} onMove={onFolderMove} onReorder={onFolderReorder} />
          </section>
          <section className="settings-card" data-solo="" aria-labelledby="set-data" hidden={hideSection("data", "set-data")}><h3 id="set-data">数据</h3>
            {row("导出话术备份", `${PLAIN_NOTES ? "用独立密码加密，不含图片" : `用独立密码加密，不含${SECRET_WORD}和图片`} · ${backupAgeLabel(lastBackupAt)}`, onExport, "导出…")}
            {row(`导出${SECRET_WORD}备份`, accountLocked ? `先打开${SECRET_WORD}页、输入密码，才能导出` : `用独立密码加密，只包含${SECRET_WORD}，不包含话术`, onExportSecret, "导出…", accountLocked)}
            {testTools && onImportTest && row("导入测试内容", `放入一批带「范例」标记的假内容（话术${PLAIN_NOTES ? "" : `、${SECRET_WORD}`}），重复导入不会重复`, () => void onImportTest(), "导入")}
            {testTools && onClearTest && (
              <div className="settings-row"><div><strong>清除测试内容</strong><small>只清带「范例」标记、你没改过的内容，其他内容不动；话术会先进回收站</small>
                {confirmClearTest && <small className="settings-sample-list" role="status">{testPreviewText(confirmClearTest)}</small>}</div>
                {confirmClearTest
                  ? <div className="settings-inline-actions"><button type="button" className="secondary-button" onClick={() => setConfirmClearTest(null)}>取消</button>
                    {confirmClearTest.snippets + (confirmClearTest.accounts ?? 0) > 0 && <button type="button" className="secondary-button danger" onClick={() => { setConfirmClearTest(null); void onClearTest(); }}>确认清除</button>}</div>
                  : <button type="button" className="secondary-button" onClick={() => void (onPreviewTest?.() ?? Promise.resolve({ snippets: 0, accounts: null, keptEdited: 0 })).then(setConfirmClearTest)}>清除…</button>}
              </div>
            )}
            {row("导入备份", "读取话术备份或账号备份文件，可选择合并或覆盖", onImport, "选择文件…")}
            {row("导入话术表格", "读取表格（.xlsx / .csv）或话术文档（.md），只在本机解析", onImportSheet, "选择文件…")}
            <TipsImportRow />
            {row("完整备份", "话术、账号、图片和设置，全部打包成一个带密码的文件", () => setDataMove("export"), "导出…")}
            {row("从完整备份恢复", "读取完整备份文件，替换这里现有的全部内容，替换前会再问你一次", () => setDataMove("import"), "选择文件…")}
            <AutoBackupRows itemCount={itemCount} />
            {row("重新加载", "重新读取本地数据，不会改动内容", onReload, refreshing ? "加载中…" : "重新加载", refreshing)}
            {isDesktop
              ? row("数据位置", "在文件夹中打开 Copyboxx 的本机数据", onOpenDataFolder, "打开文件夹")
              : <div className="settings-row static"><div><strong>数据位置</strong><small>浏览器版保存在本站点的本地存储里，清除站点数据会一并删除</small></div></div>}
          </section>
          <section className="settings-card" aria-labelledby="set-trash" hidden={hideSection("data", "set-trash")}><h3 id="set-trash">回收站</h3>
            <div className="settings-row"><div><strong>自动清理</strong><small>超过期限的已删除内容会被永久删除</small></div>
              <ArcSegmented className="settings-segment" mode="radio" label="回收站自动清理" value={String(trashDays)} onSelect={(value) => onTrashDays(Number(value))}
                options={TRASH_DAY_OPTIONS.map((days) => ({ value: String(days), label: days === 0 ? "不清理" : `${days} 天` }))} />
            </div>
            <div className="settings-row"><div><strong>清空回收站</strong><small>{trashCount === 0 ? "回收站是空的" : `永久删除 ${trashCount} 条，无法恢复`}</small></div>
              {confirmEmpty
                ? <div className="settings-inline-actions"><button type="button" className="secondary-button" onClick={() => setConfirmEmpty(false)}>取消</button><button type="button" className="secondary-button danger" onClick={() => { setConfirmEmpty(false); void onEmptyTrash(); }}>确认清空</button></div>
                : <button type="button" className="secondary-button" disabled={trashCount === 0} onClick={() => setConfirmEmpty(true)}>清空…</button>}
            </div>
          </section>
          <section className="settings-card" data-solo="" aria-labelledby="set-security" hidden={hideSection("security", "set-security")}><h3 id="set-security">安全</h3>
            <AccountLockSettings mode={accountLock.mode} deviceKey={accountLock.deviceKey} onChanged={accountLock.onChanged} onCodeShowing={(showing) => { codeShowingRef.current = showing; }} />
            {/* D-051: the 账号 page is frosted until slid open; with 账号页密码 set, the password is the only gate. */}
            <div className="settings-row"><div><strong>打开账号页先滑动解锁</strong><small>{accountLock.mode !== "none" ? "已设账号页密码，现在只需输入密码" : "没滑开之前，账号内容是模糊的"}</small></div>
              <ArcSegmented className="settings-segment" mode="radio" label="打开账号页先滑动解锁" value={slideUnlock.on ? "on" : "off"} onSelect={(value) => slideUnlock.onChange(value === "on")}
                options={[{ value: "off", label: "关" }, { value: "on", label: "开" }]} />
            </div>
            {/* D-070: after it is opened, the 账号 page closes again once nobody has touched the app for this long. */}
            <AutoLockRow seconds={autoLock.seconds} hasLock={accountLock.mode !== "none" || slideUnlock.on} onChange={autoLock.onChange} />
            <p className="settings-note">内容用 AES-256 加密，只保存在这台设备上，不会上传。</p>
            <p className="settings-note">密钥也放在这台电脑里，请不要把整个数据文件夹拷给别人。自动备份和数据放在一起，保护程度一样；要带走备份，请用带密码的「完整备份」。{PLAIN_NOTES ? "" : `复制${SECRET_WORD}默认只给出引用。`}</p>
            <p className="settings-note">只有新添加的图片会在保存前发给压缩服务压缩，别的内容不会发出去。</p>
          </section>
          {automationCardShown(isDesktop, trustedCallers.length) && <section className="settings-card" aria-labelledby="set-automation" hidden={hideSection("security", "set-automation")}><h3 id="set-automation">始终允许的程序</h3>
            <AutomationTrustRows list={trustedCallers} />
            <p className="settings-note">「始终允许」按程序文件所在的位置认人。同一台电脑上别的程序也能冒用它，所以只给你信得过的工具。把秘密整份导出时，每次都会问。</p>
          </section>}
          <section className="settings-card" data-solo="" aria-labelledby="set-usage" hidden={hideSection("usage", "set-usage")}><h3 id="set-usage">使用排行</h3>
            <UsageSection items={usageItems} now={openedAt} onShow={onShowItem} />
          </section>
          <section className="settings-card" data-solo="" aria-labelledby="set-window" hidden={hideSection("window", "set-window")}><h3 id="set-window">窗口</h3>
            {row("迷你模式", "360×440，置顶显示，适合边聊边复制", onMini, "切换到迷你")}
            <div className="settings-row"><div><strong>迷你窗口复制后</strong><small>{isDesktop ? "选择复制后是否自动收起迷你窗口" : "仅桌面版生效"}</small></div>
              <ArcSegmented className="settings-segment" mode="radio" label="迷你窗口复制后" value={miniHidePolicy} onSelect={(value) => onMiniHidePolicy(value as MiniHidePolicy)}
                options={[["hotkey", "从托盘呼出时收起"], ["always", "总是收起"], ["never", "不收起"]].map(([value, label]) => ({ value, label }))} />
            </div>
            {isDesktop && launchAtLogin !== null && <div className="settings-row"><div><strong>开机自动启动</strong><small>登录系统后自动启动，并安静地收在托盘里</small></div>
              <ArcSegmented className="settings-segment" mode="radio" label="开机自动启动" value={launchAtLogin ? "on" : "off"}
                onSelect={(value) => { void window.clipboxDesktop?.setLaunchAtLogin?.(value === "on").then(setLaunchAtLogin).catch(() => undefined); }}
                options={[{ value: "off", label: "关" }, { value: "on", label: "开" }]} />
            </div>}
            {isDesktop && <div className="settings-row"><div><strong>点击窗口关闭按钮时</strong><small>{closeBehavior === "tray" ? "Copyboxx 继续在托盘里运行，可随时呼出" : closeBehavior === "taskbar" ? "窗口缩到任务栏，点任务栏上的图标就能再打开" : "直接退出 Copyboxx"}</small></div>
              <ArcSegmented className="settings-segment" mode="radio" label="点击窗口关闭按钮时" value={closeBehavior} onSelect={(value) => onCloseBehavior(value as CloseBehavior)}
                options={[["tray", "收到托盘"], ...(window.clipboxDesktop?.platform === "win32" ? [["taskbar", "缩到任务栏"]] : []), ["quit", "退出"]].map(([value, label]) => ({ value, label }))} />
            </div>}
            <p className="settings-note">完整窗口最小 680×620，可拖大；迷你窗口固定 360×440。</p>
          </section>
          <section className="settings-card" aria-labelledby="set-compress" hidden={hideSection("data", "set-compress")}><h3 id="set-compress">图片压缩</h3>
            <ImageCompressSettings />
          </section>
          <section className="settings-card" aria-labelledby="set-shared" hidden={hideSection("data", "set-shared")}><h3 id="set-shared">共享话术</h3>
            {sharedLibrary}
          </section>
          <section className="settings-card" data-solo="" aria-labelledby="set-ai" hidden={hideSection("ai", "set-ai")}><h3 id="set-ai">AI</h3>
            <AiSettingsSection localAiAvailable={aiAvailable} />
          </section>
          <section className="settings-card" aria-labelledby="set-mcp" hidden={hideSection("ai", "set-mcp")}><h3 id="set-mcp">连接 Codex 等工具</h3>
            <McpConnectRows />
          </section>
          <section className="settings-card" data-solo="" aria-labelledby="set-about" hidden={hideSection("about", "set-about")}><h3 id="set-about">关于</h3>
            <div className="settings-row"><div><strong>Copyboxx {version ? `v${version}` : "开发版本"}</strong><small>{itemCount} 条内容 · 回收站 {trashCount} 条 · 数据仅保存在本机</small></div>
              <button type="button" className="secondary-button" onClick={() => { void navigator.clipboard?.writeText(`Copyboxx ${version || "dev"}${builtAt ? ` · ${builtAt}` : ""} · ${navigator.userAgent}`).then(() => setVersionCopied(true)).catch(() => undefined); }}>{versionCopied ? "已复制" : "复制版本信息"}</button></div>
            {row("使用说明", "第一次打开时的几步介绍：话术、图片、账号和迷你窗口", onShowGuide, "再看一遍")}
            {/* The MiSans licence asks the app to say it uses MiSans (app/fonts/MiSans-License.pdf). */}
            <div className="settings-row static"><div><strong>字体</strong><small>设置和弹窗使用 MiSans（小米）、Poppins 和 Lora 字体</small></div></div>
            {builtAt && <div className="settings-row static"><div><strong>更新时间</strong><small className="settings-build-time">{builtAt}</small></div></div>}
          </section>
        </div>
        </div>
      </section>
      {askClose && <RecoveryCloseConfirm onCancel={() => setAskClose(false)} onConfirm={() => { setAskClose(false); onClose(); }} />}
      {dataMove && <DataMoveDialog mode={dataMove} itemCount={itemCount} onClose={() => setDataMove(null)} />}
    </div>
  );
}
