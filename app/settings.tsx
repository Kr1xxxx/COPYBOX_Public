"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "./arc/motion-tokens";
import { AiSettingsSection } from "./ai-settings";
import { PLAIN_NOTES, SECRET_WORD } from "./platform";
import { TRASH_DAY_OPTIONS, type CloseBehavior, type MiniHidePolicy, type ThemeChoice } from "./preferences";
import { SettingsFolders, type SettingsFolderGroup, type SettingsFolderKind } from "./settings-folders";

// The groups of the left column. Each section below carries the id of the group it belongs to.
const SETTINGS_TABS = [["look", "外观"], ["folders", "目录"], ["data", "数据"], ["window", "窗口"], ["ai", "AI"], ["about", "关于"]] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number][0];

function backupAgeLabel(at: number) {
  if (!at) return "还没有导出过";
  const days = Math.floor((Date.now() - at) / 86_400_000);
  const clock = new Date(at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  return `上次导出 ${clock}${days >= 1 ? `（${days} 天前）` : ""}`;
}

export function SettingsDialog({ version, isDesktop, refreshing, itemCount, trashCount, miniHidePolicy, onMiniHidePolicy, folderGroups, onFolderAdd, onFolderRename, onFolderDelete, onFolderColor, onFolderMove, onFolderReorder, closeBehavior, onCloseBehavior, trashDays, onTrashDays, onEmptyTrash, theme, onTheme, lastBackupAt, onOpenDataFolder, onClose, onExport, onExportSecret, onImport, onImportSheet, onReload, onMini }: {
  version: string; isDesktop: boolean; refreshing: boolean; itemCount: number; trashCount: number;
  miniHidePolicy: MiniHidePolicy; onMiniHidePolicy: (policy: MiniHidePolicy) => void;
  folderGroups: SettingsFolderGroup[];
  onFolderAdd: (kind: SettingsFolderKind, name: string) => Promise<string>;
  onFolderRename: (kind: SettingsFolderKind, from: string, to: string) => Promise<string>;
  onFolderDelete: (kind: SettingsFolderKind, folder: string) => Promise<string>;
  onFolderColor: (kind: SettingsFolderKind, folder: string, color: string | null) => void;
  onFolderMove: (kind: SettingsFolderKind, folder: string, delta: -1 | 1) => void;
  onFolderReorder: (kind: SettingsFolderKind, source: string, target: string) => void;
  closeBehavior: CloseBehavior; onCloseBehavior: (behavior: CloseBehavior) => void;
  trashDays: number; onTrashDays: (days: number) => void; onEmptyTrash: () => Promise<void>;
  theme: ThemeChoice; onTheme: (theme: ThemeChoice) => void; lastBackupAt: number; onOpenDataFolder: () => void;
  onClose: () => void; onExport: () => void; onExportSecret: () => void; onImport: () => void; onImportSheet: () => void; onReload: () => void; onMini: () => void;
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
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [versionCopied, setVersionCopied] = useState(false);
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
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { if ((event.target as HTMLElement | null)?.closest?.("[data-local-esc]") || document.querySelector(".settings-folder.dragging")) return; event.stopPropagation(); onCloseRef.current(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  const row = (title: string, hint: string, action: () => void, label: string, disabled = false) => (
    <div className="settings-row"><div><strong>{title}</strong><small>{hint}</small></div><button type="button" className="secondary-button" onClick={action} disabled={disabled}>{label}</button></div>
  );
  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header><h2 id="settings-title">设置</h2><button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label="关闭设置">×</button></header>
        <div className="settings-layout">
        <div className="settings-tabs" role="tablist" aria-orientation="vertical" aria-label="设置分类">
          {SETTINGS_TABS.map(([id, label]) => (
            <button key={id} id={`settings-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls="settings-panel" tabIndex={tab === id ? 0 : -1} onKeyDown={onTabKey} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              {tab === id && <motion.span className="settings-tab-pill" layoutId="settings-tab-pill" transition={reducedMotion ? { duration: 0 } : motionTokens.spring.snappy} />}
              <span className="settings-tab-label">{label}</span>
            </button>
          ))}
        </div>
        <div className="settings-body" id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${tab}`}>
          <section aria-labelledby="set-look" hidden={tab !== "look"}><h3 id="set-look">外观</h3>
            <div className="settings-row"><div><strong>主题</strong><small>跟随系统会随系统的深浅色设置自动切换</small></div>
              <div className="settings-segment" role="radiogroup" aria-label="主题">
                {([["system", "跟随系统"], ["light", "浅色"], ["dark", "深色"]] as [ThemeChoice, string][]).map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={theme === value} className={theme === value ? "active" : ""} onClick={() => onTheme(value)}>{label}</button>)}
              </div>
            </div>
          </section>
          <section aria-labelledby="set-folders" hidden={tab !== "folders"}><h3 id="set-folders">目录</h3>
            <SettingsFolders groups={folderGroups} onAdd={onFolderAdd} onRename={onFolderRename} onDelete={onFolderDelete} onColor={onFolderColor} onMove={onFolderMove} onReorder={onFolderReorder} />
          </section>
          <section aria-labelledby="set-data" hidden={tab !== "data"}><h3 id="set-data">数据</h3>
            {row("导出话术备份", `${PLAIN_NOTES ? "用独立密码加密" : `用独立密码加密，不包含${SECRET_WORD}`} · ${backupAgeLabel(lastBackupAt)}`, onExport, "导出…")}
            {!PLAIN_NOTES && row(`导出${SECRET_WORD}备份`, `用独立密码加密，只包含${SECRET_WORD}，不包含话术`, onExportSecret, "导出…")}
            {row("导入备份", "支持新旧版备份，可选择合并或覆盖", onImport, "选择文件…")}
            {row("导入话术表格", "读取 .xlsx / .csv，只在本机解析", onImportSheet, "选择表格…")}
            {row("重新加载", "重新读取本地数据，不会改动内容", onReload, refreshing ? "加载中…" : "重新加载", refreshing)}
            {isDesktop
              ? row("数据位置", "在文件夹中打开 Clipbox 的本机数据", onOpenDataFolder, "打开文件夹")
              : <div className="settings-row static"><div><strong>数据位置</strong><small>浏览器版保存在本站点的本地存储里，清除站点数据会一并删除</small></div></div>}
          </section>
          <section aria-labelledby="set-trash" hidden={tab !== "data"}><h3 id="set-trash">回收站</h3>
            <div className="settings-row"><div><strong>自动清理</strong><small>超过期限的已删除内容会被永久删除</small></div>
              <div className="settings-segment" role="radiogroup" aria-label="回收站自动清理">
                {TRASH_DAY_OPTIONS.map((days) => <button key={days} type="button" role="radio" aria-checked={trashDays === days} className={trashDays === days ? "active" : ""} onClick={() => onTrashDays(days)}>{days === 0 ? "不清理" : `${days} 天`}</button>)}
              </div>
            </div>
            <div className="settings-row"><div><strong>清空回收站</strong><small>{trashCount === 0 ? "回收站是空的" : `永久删除 ${trashCount} 条，无法恢复`}</small></div>
              {confirmEmpty
                ? <div className="settings-inline-actions"><button type="button" className="secondary-button" onClick={() => setConfirmEmpty(false)}>取消</button><button type="button" className="secondary-button danger" onClick={() => { setConfirmEmpty(false); void onEmptyTrash(); }}>确认清空</button></div>
                : <button type="button" className="secondary-button" disabled={trashCount === 0} onClick={() => setConfirmEmpty(true)}>清空…</button>}
            </div>
          </section>
          <section aria-labelledby="set-security" hidden={tab !== "data"}><h3 id="set-security">安全</h3>
            <p className="settings-note">所有内容加密后只保存在这台电脑上，不会上传。密钥也放在这台电脑里，所以请不要把整个数据文件夹拷给别人。{PLAIN_NOTES ? "图片同样加密保存，不会进入话术备份。" : `${SECRET_WORD}不会进入话术备份，复制${SECRET_WORD}默认只给出引用。`}</p>
          </section>
          <section aria-labelledby="set-window" hidden={tab !== "window"}><h3 id="set-window">窗口</h3>
            {row("迷你模式", "360×440，置顶显示，适合边聊边复制", onMini, "切换到迷你")}
            <div className="settings-row"><div><strong>迷你窗口复制后</strong><small>{isDesktop ? "选择复制后是否自动收起迷你窗口" : "仅桌面版生效"}</small></div>
              <div className="settings-segment" role="radiogroup" aria-label="迷你窗口复制后">
                {([["hotkey", "从托盘呼出时收起"], ["always", "总是收起"], ["never", "不收起"]] as [MiniHidePolicy, string][]).map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={miniHidePolicy === value} className={miniHidePolicy === value ? "active" : ""} onClick={() => onMiniHidePolicy(value)}>{label}</button>)}
              </div>
            </div>
            {isDesktop && launchAtLogin !== null && <div className="settings-row"><div><strong>开机自动启动</strong><small>登录系统后自动启动，并安静地收在托盘里</small></div>
              <div className="settings-segment" role="radiogroup" aria-label="开机自动启动">
                {([[false, "关"], [true, "开"]] as [boolean, string][]).map(([value, label]) => <button key={label} type="button" role="radio" aria-checked={launchAtLogin === value} className={launchAtLogin === value ? "active" : ""} onClick={() => { void window.clipboxDesktop?.setLaunchAtLogin?.(value).then(setLaunchAtLogin).catch(() => undefined); }}>{label}</button>)}
              </div>
            </div>}
            {isDesktop && <div className="settings-row"><div><strong>点击窗口关闭按钮时</strong><small>{closeBehavior === "tray" ? "Clipbox 继续在托盘里运行，可随时呼出" : closeBehavior === "taskbar" ? "窗口缩到任务栏，点任务栏上的图标就能再打开" : "直接退出 Clipbox"}</small></div>
              <div className="settings-segment" role="radiogroup" aria-label="点击窗口关闭按钮时">
                {([["tray", "收到托盘"], ...(window.clipboxDesktop?.platform === "win32" ? [["taskbar", "缩到任务栏"]] : []), ["quit", "退出"]] as [CloseBehavior, string][]).map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={closeBehavior === value} className={closeBehavior === value ? "active" : ""} onClick={() => onCloseBehavior(value)}>{label}</button>)}
              </div>
            </div>}
            <p className="settings-note">完整窗口最小 680×620，可拖大；迷你窗口固定 360×440。</p>
          </section>
          <section aria-labelledby="set-ai" hidden={tab !== "ai"}><h3 id="set-ai">AI</h3>
            <AiSettingsSection localAiAvailable={aiAvailable} />
          </section>
          <section aria-labelledby="set-about" hidden={tab !== "about"}><h3 id="set-about">关于</h3>
            <div className="settings-row"><div><strong>Clipbox {version ? `v${version}` : "开发版本"}</strong><small>{itemCount} 条内容 · 回收站 {trashCount} 条 · 数据仅保存在本机</small></div>
              <button type="button" className="secondary-button" onClick={() => { void navigator.clipboard?.writeText(`Clipbox ${version || "dev"} · ${navigator.userAgent}`).then(() => setVersionCopied(true)).catch(() => undefined); }}>{versionCopied ? "已复制" : "复制版本信息"}</button></div>
          </section>
        </div>
        </div>
      </section>
    </div>
  );
}
