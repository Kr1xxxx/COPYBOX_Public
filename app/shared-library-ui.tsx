"use client";

import { useRef, useState } from "react";
import type { SecretItem } from "./clipbox-core";
import { describeSync, type SyncSummary } from "./shared-library";
import { fetchSharedLibraryText, readSharedSummary, readSharedUrl, writeSharedUrl } from "./shared-library-client";
import { formatTaipeiDate } from "./clipbox-core";

function clock(at: number) {
  return new Date(at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

// Settings home → 账号与同步: the 企业同步码 (or an address), a manual sync, and when it last synced (D-052).
export function SyncCodeRow({ onApply }: { onApply: (text: string) => Promise<SyncSummary> }) {
  const [code, setCode] = useState(readSharedUrl);
  const [busy, setBusy] = useState(false);
  const [lastAt, setLastAt] = useState(() => readSharedSummary()?.at);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function syncNow() {
    if (busy) return;
    setBusy(true);
    setError("");
    setResult("");
    try {
      const summary = await onApply(await fetchSharedLibraryText(code));
      setLastAt(summary.at);
      setResult(describeSync(summary) + (summary.skipped ? `（${summary.skipped} 条格式不对已跳过）` : ""));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "同步没有成功，你的话术没有变化"); }
    setBusy(false);
  }

  return (
    <>
      <div className="settings-row shared-url">
        <div>
          <label htmlFor="shared-url"><strong>企业同步码</strong></label>
          <input id="shared-url" type="text" autoComplete="off" spellCheck={false} placeholder="填公司给你的同步码，没有就先不填" value={code}
            onChange={(event) => { setCode(event.target.value); writeSharedUrl(event.target.value); setError(""); }} />
          <small>公司话术 · <span className="settings-last-sync">{lastAt ? `最后同步 ${formatTaipeiDate(lastAt, true)}` : "还没有同步过"}</span> · 打开软件时和每 30 分钟自动同步</small>
        </div>
        <button type="button" className="secondary-button" disabled={!code.trim() || busy} onClick={() => void syncNow()}>{busy ? "同步中…" : "立即同步"}</button>
      </div>
      {error && <p className="settings-note shared-error" role="alert">{error}</p>}
      {result && !error && <p className="settings-note sync-code-result" role="status">{result}</p>}
    </>
  );
}

// Settings → 数据 → 共享话术: what the sync does, syncing from a file, and exporting the company file.
export function SharedLibrarySection({ onApply, onExport }: {
  onApply: (text: string) => Promise<SyncSummary>;
  onExport: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function run(load: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setSummary(null);
    try { setSummary(await onApply(await load())); } catch (failure) { setError(failure instanceof Error ? failure.message : "同步没有成功，你的话术没有变化"); }
    setBusy(false);
  }

  return (
    <>
      <p className="settings-note">公司统一维护的话术。企业同步码填在设置首页的「账号与同步」。同步只会新增和更新没被你改过的，你自己写的和改过的话术不会被覆盖或删除。</p>
      <div className="settings-row">
        <div><strong>从文件同步</strong><small>没有同步码时，用公司发来的 .json 文件，规则一样</small></div>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => fileRef.current?.click()}>选公司文件…</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void run(() => file.text()); }} />
      </div>
      <div className="settings-row">
        <div><strong>导出为公司话术库文件</strong><small>给负责维护公司话术的人：把现在的话术导出成文件，交给 AI 发布</small></div>
        <button type="button" className="secondary-button" onClick={onExport}>导出…</button>
      </div>
      {error && <p className="settings-note shared-error" role="alert">{error}</p>}
      {summary && !error && <p className="settings-note shared-summary" role="status">上次同步 {clock(summary.at)}：{describeSync(summary)}{summary.skipped ? `（${summary.skipped} 条格式不对已跳过）` : ""}</p>}
    </>
  );
}

// Shown in an open card: the company changed a 话术 this person edited, or removed it.
export function SharedNotice({ item, onAccept, onKeep }: { item: SecretItem; onAccept: () => void; onKeep: () => void }) {
  const link = item.shared;
  if (!link) return null;
  if (link.pending) {
    return (
      <div className="shared-notice" role="group" aria-label="公司版有更新">
        <strong>公司版有更新</strong>
        <small>这条你改过，所以没有自动替换。选一个：</small>
        <div className="shared-compare">
          <div><span>我的</span><p lang="en">{item.secret}</p></div>
          <div><span>公司版</span><p lang="en">{link.pending.content.secret}</p></div>
        </div>
        <div className="shared-actions">
          <button type="button" className="secondary-button" onClick={onKeep}>保留我的</button>
          <button type="button" className="primary-button" onClick={onAccept}>用公司版</button>
        </div>
      </div>
    );
  }
  if (link.retired) return <div className="shared-notice retired"><strong>公司已停用</strong><small>公司的话术库里已经没有这条了。你可以继续用，也可以自己删除。</small></div>;
  return null;
}
