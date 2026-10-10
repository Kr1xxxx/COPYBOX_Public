import { useEffect, useState } from "react";
import "./desktop-bridge";

const DISMISSED_KEY = "clipbox.update-dismissed";
const RECHECK_MS = 24 * 60 * 60 * 1000;

function readDismissed() {
  try { return localStorage.getItem(DISMISSED_KEY) || ""; } catch { return ""; }
}

// Asks the desktop shell for a newer version on launch and then once a day. "稍后" hides that version only.
export function UpdateNotice() {
  const [update, setUpdate] = useState<{ version: string; notes: string[] } | null>(null);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    const desktop = window.clipboxDesktop;
    if (!desktop?.checkUpdate) return;
    let cancelled = false;
    const run = () => desktop.checkUpdate?.()
      .then((result) => { if (!cancelled) setUpdate(result.status === "available" ? { version: result.version, notes: result.notes } : null); })
      .catch(() => undefined);
    void run();
    const timer = window.setInterval(run, RECHECK_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  if (!update || update.version === dismissed) return null;

  function later() {
    if (!update) return;
    try { localStorage.setItem(DISMISSED_KEY, update.version); } catch { /* optional */ }
    setDismissed(update.version);
  }

  return (
    <div className="update-banner" role="status">
      <div className="update-text">
        <strong>有新版本 {update.version}</strong>
        {update.notes.length > 0 && <span>{update.notes.join("；")}</span>}
      </div>
      <button type="button" className="primary-button" onClick={() => void window.clipboxDesktop?.openUpdate?.()}>下载</button>
      <button type="button" className="ghost-button" onClick={later}>稍后</button>
    </div>
  );
}
