"use client";

import { useEffect, useRef, useState } from "react";
import { ArcSegmented } from "./arc/segmented";
import { AUTO_BACKUP_KEEP, backupDateLabel, backupSizeLabel, describeBackup, getBackupStore, readAutoBackupEnabled, readBackupText, runAutoBackup, writeAutoBackupEnabled, type BackupFile } from "./auto-backup";
import { applyPayload, collectPayload, countImages, TransferError, type TransferPayload } from "./data-transfer";

const FIRST_RUN_DELAY_MS = 8_000;
const RECHECK_MS = 30 * 60 * 1000;

// Called once by the page when the data is open: takes today's backup a few seconds after start, and again whenever
// the app has been left open past midnight. Does nothing when the switch in 设置 is off.
export function useAutoBackup(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const run = () => { void runAutoBackup(getBackupStore(), readAutoBackupEnabled()); };
    const first = window.setTimeout(run, FIRST_RUN_DELAY_MS);
    const again = window.setInterval(run, RECHECK_MS);
    return () => { window.clearTimeout(first); window.clearInterval(again); };
  }, [ready]);
}

// The two rows in 设置 → 数据: the switch, and the way back from one of the saved days.
export function AutoBackupRows({ itemCount }: { itemCount: number }) {
  const [enabled, setEnabled] = useState(() => readAutoBackupEnabled());
  const [files, setFiles] = useState<BackupFile[] | null>(null);
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void getBackupStore().list().then((list) => { if (!cancelled) setFiles(list); }).catch(() => { if (!cancelled) setFiles([]); });
    return () => { cancelled = true; };
  }, [restoring]);
  const latest = files?.[0];
  return (
    <>
      <div className="settings-row"><div><strong>每天自动备份</strong><small>每天自动存一份完整备份，保留最近 {AUTO_BACKUP_KEEP} 份{latest ? `；最近一份：${backupDateLabel(latest.name)}` : "；还没有备份"}</small></div>
        <ArcSegmented className="settings-segment" mode="radio" label="每天自动备份" value={enabled ? "on" : "off"}
          onSelect={(value) => { const next = value === "on"; setEnabled(next); writeAutoBackupEnabled(next); }}
          options={[{ value: "off", label: "关" }, { value: "on", label: "开" }]} />
      </div>
      <div className="settings-row"><div><strong>从自动备份恢复</strong><small>选一天的备份，恢复前会先告诉你要替换多少内容，并再问一次</small></div>
        <button type="button" className="secondary-button" disabled={!files || files.length === 0} onClick={() => setRestoring(true)}>选择…</button>
      </div>
      {restoring && files && <AutoBackupRestoreDialog files={files} itemCount={itemCount} onClose={() => setRestoring(false)} />}
    </>
  );
}

function AutoBackupRestoreDialog({ files, itemCount, onClose }: { files: BackupFile[]; itemCount: number; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // After a day is chosen and read, nothing is replaced until the person confirms what will be replaced.
  const [pending, setPending] = useState<{ file: BackupFile; payload: TransferPayload; currentImages: number } | null>(null);
  // Focus inside the dialog, so Esc closes this dialog and not the settings behind it (see data-local-esc in settings.tsx).
  useEffect(() => { dialogRef.current?.focus(); }, []);
  useEffect(() => {
    const node = dialogRef.current;
    const onKey = (event: KeyboardEvent) => { if (event.key !== "Escape") return; event.stopPropagation(); if (!busy) onClose(); };
    node?.addEventListener("keydown", onKey);
    return () => node?.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function choose(file: BackupFile) {
    setBusy(true);
    setError("");
    try {
      const payload = readBackupText(await getBackupStore().read(file.name));
      setPending({ file, payload, currentImages: countImages(await collectPayload()) });
    } catch (problem) {
      setError(problem instanceof TransferError ? problem.message : "没能读取这份备份，现有内容没有改动");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      await applyPayload(pending.payload);
      window.location.reload();
    } catch (problem) {
      setError(problem instanceof TransferError ? problem.message : "恢复没有成功，现有内容没有改动，请再试一次");
      setBusy(false);
    }
  }

  const counts = pending ? describeBackup(pending.payload) : null;
  return (
    <div className="backup-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} data-local-esc className="backup-dialog data-move" role="dialog" aria-modal="true" aria-labelledby="auto-restore-title">
        <header className="backup-head">
          <div><p>自动备份</p><h2 id="auto-restore-title">从自动备份恢复</h2></div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="关闭">×</button>
        </header>
        <div className="backup-form">
          {pending && counts ? (
            <>
              <p className="backup-warning" role="alert">继续会用 {backupDateLabel(pending.file.name)} 的备份（含 {counts.images} 张图片）替换现有的 {itemCount} 条内容、{pending.currentImages} 张图片。替换前会先留一份现有内容，出错会自动恢复。</p>
              {error && <p className="backup-error">{error}</p>}
              <div className="backup-actions"><button type="button" onClick={() => setPending(null)} disabled={busy}>返回</button><button type="button" className="danger" onClick={() => void confirm()} disabled={busy}>{busy ? "正在恢复…" : "确认替换"}</button></div>
            </>
          ) : (
            <>
              <p className="backup-intro">选一天的备份。选好后会先显示要替换多少内容，确认以后才会替换。</p>
              <ul className="backup-list" aria-label="自动备份">
                {files.map((file) => (
                  <li key={file.name}><button type="button" className="secondary-button" disabled={busy} onClick={() => void choose(file)}>{backupDateLabel(file.name)} · {backupSizeLabel(file.size)}</button></li>
                ))}
              </ul>
              {error && <p className="backup-error">{error}</p>}
              <div className="backup-actions"><button type="button" onClick={onClose} disabled={busy}>取消</button></div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
