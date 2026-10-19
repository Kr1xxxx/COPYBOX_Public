import { useEffect, useState } from "react";
import type { UpdateInstallResult, UpdateProgress } from "./desktop-bridge";
import "./desktop-bridge";

const DISMISSED_KEY = "clipbox.update-dismissed";
const RECHECK_MS = 24 * 60 * 60 * 1000;

type Phase =
  | { kind: "idle" }
  | { kind: "downloading"; received: number; total: number }
  | { kind: "installing" }
  | { kind: "error"; reason: string }
  // 下载 opened the new version in the browser; the person installs it by hand (older shells, or a manifest without a
  // checksum; D-073).
  | { kind: "opened" };

function readDismissed() {
  try { return localStorage.getItem(DISMISSED_KEY) || ""; } catch { return ""; }
}

// Plain words for why 立即更新 did not work (the reasons come from src-tauri/src/update.rs).
export function updateErrorText(reason: string) {
  switch (reason) {
    case "network": return "网络连不上或断了";
    case "incomplete": return "下载的文件不完整";
    case "disk": return "电脑上存不下安装文件";
    case "start": return "新版本没能装上";
    case "unavailable": return "这个版本请去网站下载";
    default: return "出了点问题";
  }
}

function megabytes(bytes: number) {
  return (Math.max(0, bytes) / (1024 * 1024)).toFixed(1);
}

// How to finish a browser download by hand. The Mac app is unsigned, so the first open of a new copy may be stopped (D-073).
export function manualInstallHint(platform: string | undefined) {
  return platform === "darwin"
    ? "下载好后打开它，把 Copyboxx 拖进「应用程序」替换旧版，内容都会保留。被拦住时，到「系统设置 › 隐私与安全性」点「仍要打开」。"
    : "下载好后打开安装文件装上，内容都会保留。";
}

// Asks the desktop shell for a newer version on launch and then once a day. 「立即更新」 downloads it with a progress bar
// and installs it over this app (Windows D-047, Mac D-078); older shells and a manifest without a checksum offer 「下载」
// in the browser and then say how to install it (D-073). 「稍后」 hides that version only; 「知道了」 hides it until the
// app opens again.
export function UpdateNotice() {
  const [update, setUpdate] = useState<{ version: string; notes: string[]; installable: boolean } | null>(null);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [closedFor, setClosedFor] = useState("");

  useEffect(() => {
    const desktop = window.clipboxDesktop;
    if (!desktop?.checkUpdate) return;
    let cancelled = false;
    const run = () => desktop.checkUpdate?.()
      .then((result) => {
        if (cancelled) return;
        setUpdate(result.status === "available" ? { version: result.version, notes: result.notes, installable: result.installable !== false } : null);
      })
      .catch(() => undefined);
    void run();
    const timer = window.setInterval(run, RECHECK_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const subscribe = window.clipboxDesktop?.onUpdateProgress;
    if (!subscribe) return;
    return subscribe((progress: UpdateProgress) => {
      setPhase((current) => {
        if (current.kind !== "downloading") return current;
        const total = progress.total > 0 ? progress.total : current.total;
        // Everything is in: the shell checks the file, lets the page save and starts the installer.
        if (total > 0 && progress.received >= total) return { kind: "installing" };
        return { kind: "downloading", received: progress.received, total };
      });
    });
  }, []);

  const busy = phase.kind === "downloading" || phase.kind === "installing";
  if (!update || ((update.version === dismissed || update.version === closedFor) && !busy)) return null;

  const desktop = window.clipboxDesktop;
  const canInstall = Boolean(desktop?.installUpdate) && update.installable;

  function later() {
    if (!update) return;
    try { localStorage.setItem(DISMISSED_KEY, update.version); } catch { /* optional */ }
    setDismissed(update.version);
  }

  // From the error state the banner stays as it is, so 重试 is still there.
  function openSite(showHint = false) {
    void window.clipboxDesktop?.openUpdate?.()
      .then((opened) => { if (opened && showHint) setPhase({ kind: "opened" }); })
      .catch(() => undefined);
  }

  function install() {
    const start = window.clipboxDesktop?.installUpdate;
    if (!start || busy) return;
    setPhase({ kind: "downloading", received: 0, total: 0 });
    start()
      .then((result: UpdateInstallResult) => {
        if (result.status === "installing") setPhase({ kind: "installing" });
        else if (result.status === "error") setPhase({ kind: "error", reason: result.reason });
      })
      .catch(() => setPhase({ kind: "error", reason: "" }));
  }

  if (phase.kind === "downloading" || phase.kind === "installing") {
    const fraction = phase.kind === "installing" ? 1 : phase.total > 0 ? Math.min(1, phase.received / phase.total) : 0;
    const percent = Math.floor(fraction * 100);
    return (
      <div className="update-banner update-banner-progress" role="status" data-phase={phase.kind}>
        <div className="update-text">
          <strong>{phase.kind === "installing" ? "正在安装，马上自动重新打开" : `正在下载新版本 ${update.version}`}</strong>
          <div className="update-progress">
            <div className="update-bar" role="progressbar" aria-label="下载进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
              <i style={{ transform: `scaleX(${fraction})` }} />
            </div>
            <span className="update-figures" aria-hidden="true">
              {phase.kind === "installing"
                ? "100%"
                : `${percent}%${phase.total > 0 ? ` · 已下载 ${megabytes(phase.received)} / ${megabytes(phase.total)} MB` : ""}`}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (phase.kind === "error") {
    return (
      <div className="update-banner update-banner-error" role="status" data-phase="error">
        <div className="update-text">
          <strong>更新没成功：{updateErrorText(phase.reason)}</strong>
          <span>{phase.reason === "unavailable" ? `去网站下载新版本 ${update.version}` : `可以重试，或去网站下载新版本 ${update.version}`}</span>
        </div>
        {phase.reason !== "unavailable" && <button type="button" className="primary-button" onClick={install}>重试</button>}
        <button type="button" className={phase.reason === "unavailable" ? "primary-button" : "ghost-button"} onClick={() => openSite()}>去网站下载</button>
      </div>
    );
  }

  if (phase.kind === "opened") {
    return (
      <div className="update-banner update-banner-opened" role="status" data-phase="opened">
        <div className="update-text">
          <strong>正在浏览器里下载新版本 {update.version}</strong>
          <span>{manualInstallHint(desktop?.platform)}</span>
        </div>
        <button type="button" className="ghost-button" onClick={() => setClosedFor(update.version)}>知道了</button>
      </div>
    );
  }

  return (
    <div className="update-banner" role="status" data-phase="idle">
      <div className="update-text">
        <strong>有新版本 {update.version}</strong>
        {update.notes.length > 0 && <span>{update.notes.join("；")}</span>}
      </div>
      {canInstall
        ? <button type="button" className="primary-button" onClick={install}>立即更新</button>
        : <button type="button" className="primary-button" onClick={() => openSite(true)}>下载</button>}
      <button type="button" className="ghost-button" onClick={later}>稍后</button>
    </div>
  );
}
