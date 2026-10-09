"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { resolveFocusWrapIndex, type ImportStrategy, type SecretItem } from "./clipbox-core";
import type { SnippetImportPreview } from "./snippet-import";

// "export" saves the snippets, "export-secret" the 备注/秘密 section; each goes to its own file.
export type BackupMode = "export" | "export-secret" | "import";
export type DeleteRequest = { item: SecretItem; permanent: boolean };

function useDialogKeyboard(dialogRef: React.RefObject<HTMLElement | null>, onClose: () => void, disabled = false) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !disabled) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled), select:not(:disabled), textarea:not(:disabled)") || []);
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const wrapIndex = resolveFocusWrapIndex(currentIndex, focusable.length, event.shiftKey);
      if (wrapIndex >= 0) {
        event.preventDefault();
        focusable[wrapIndex].focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [dialogRef, disabled, onClose]);
}

export function SnippetImportDialog({ preview, fileName, secretWord, onClose, onImport }: {
  secretWord: string;
  preview: SnippetImportPreview;
  fileName: string;
  onClose: () => void;
  onImport: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogKeyboard(dialogRef, onClose, busy);
  useEffect(() => { closeRef.current?.focus(); }, []);

  async function confirm() {
    setBusy(true);
    try {
      await onImport();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="snippet-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section ref={dialogRef} className="snippet-import-dialog" role="dialog" aria-modal="true" aria-labelledby="snippet-import-title">
        <header className="snippet-dialog-head">
          <div><p>LOCAL SPREADSHEET</p><h2 id="snippet-import-title">导入话术表格</h2><small title={fileName}>{fileName}</small></div>
          <button ref={closeRef} type="button" onClick={onClose} disabled={busy} aria-label="关闭">×</button>
        </header>
        <div className="snippet-import-body">
          <div className="import-metrics" aria-label="导入统计">
            <div><strong>{preview.totalCount}</strong><span>读取</span></div>
            <div className="positive"><strong>{preview.importableCount}</strong><span>可导入</span></div>
            <div><strong>{preview.duplicateCount}</strong><span>重复</span></div>
            <div className={preview.errorCount ? "warning" : ""}><strong>{preview.errorCount}</strong><span>错误</span></div>
          </div>
          <section className="import-section"><h3>将创建或合并的目录</h3><div className="import-folder-list">{preview.folders.map((folder) => <span key={folder}>{folder}</span>)}</div></section>
          <section className="import-section"><h3>内容预览</h3><div className="import-preview-list">{preview.items.slice(0, 5).map((item) => <div key={item.id}><strong>{item.label}</strong><span>{item.folder} · {item.summary}</span></div>)}</div></section>
          {preview.errors.length > 0 && <section className="import-errors"><h3>需要跳过的行</h3>{preview.errors.slice(0, 4).map((error) => <p key={error}>{error}</p>)}{preview.errors.length > 4 && <small>另有 {preview.errors.length - 4} 行</small>}</section>}
          <p className="import-privacy">表格只在本机解析。导入采用合并方式，不会覆盖{secretWord}或现有话术。</p>
        </div>
        <footer className="snippet-dialog-actions"><button type="button" onClick={onClose} disabled={busy}>取消</button><button type="button" className="primary" onClick={() => void confirm()} disabled={busy || preview.importableCount === 0}>{busy ? "正在加密写入…" : `导入 ${preview.importableCount} 条话术`}</button></footer>
      </section>
    </div>
  );
}

export function BackupDialog({ mode, needsPassword, secretWord, onClose, onExport, onImport }: {
  secretWord: string;
  mode: BackupMode;
  needsPassword: boolean;
  onClose: () => void;
  onExport: (password: string) => Promise<void>;
  onImport: (password: string, strategy: ImportStrategy) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [strategy, setStrategy] = useState<ImportStrategy>("merge");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const exporting = mode !== "import";
  const exportWord = mode === "export-secret" ? secretWord : "话术";
  const otherWord = mode === "export-secret" ? "话术" : secretWord;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (needsPassword && !password) return setError("请输入备份密码");
    if (exporting && password.length < 8) return setError("备份密码至少需要 8 个字符");
    if (exporting && password !== confirmation) return setError("两次输入的密码不一致");
    setBusy(true);
    try {
      if (exporting) await onExport(password);
      else await onImport(password, strategy);
    } catch {
      setError(mode === "import" ? "备份密码不正确，或文件已经损坏" : "导出失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="backup-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="backup-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-title">
        <header className="backup-head">
          <div><p>{mode === "export" ? "SNIPPET EXPORT" : mode === "export-secret" ? "NOTES EXPORT" : "SAFE IMPORT"}</p><h2 id="backup-title">{exporting ? `导出${exportWord}备份` : "导入备份"}</h2></div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="关闭">×</button>
        </header>
        <form className="backup-form" onSubmit={submit}>
          <p className="backup-intro">{exporting ? `只备份${exportWord}，并使用独立密码加密；${otherWord}不会包含在文件中。` : needsPassword ? "先验证备份密码，验证成功后才会写入本机数据。" : "已识别旧版备份。导入前仍可选择合并或覆盖。"}</p>
          {needsPassword && <label className="backup-field"><span>备份密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={exporting ? "至少 8 个字符" : "输入导出时设置的密码"} autoComplete="off" /></label>}
          {exporting && <label className="backup-field"><span>再次输入</span><input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="确认备份密码" autoComplete="off" /></label>}
          {mode === "import" && <fieldset className="backup-strategy"><legend>导入方式</legend><div><button type="button" className={strategy === "merge" ? "active" : ""} onClick={() => setStrategy("merge")}><strong>合并</strong><small>保留现有内容并去重</small></button><button type="button" className={strategy === "replace" ? "active danger" : ""} onClick={() => setStrategy("replace")}><strong>覆盖</strong><small>用备份替换当前内容</small></button></div></fieldset>}
          {error && <p className="backup-error">{error}</p>}
          <p className="backup-note">{exporting ? "请妥善保存密码；Clipbox 无法找回备份密码。" : strategy === "merge" ? "同类型、同标题且内容相同的条目不会重复导入。" : "覆盖会清空当前条目，仅保留备份中的内容。"}</p>
          <div className="backup-actions"><button type="button" onClick={onClose} disabled={busy}>取消</button><button className={mode === "import" && strategy === "replace" ? "danger" : "primary"} disabled={busy}>{busy ? (exporting ? "正在加密…" : "正在验证…") : exporting ? "加密并导出" : strategy === "merge" ? "验证并合并" : "验证并覆盖"}</button></div>
        </form>
      </section>
    </div>
  );
}

export function DeleteConfirmDialog({ request, onClose, onConfirm }: {
  request: DeleteRequest;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { cancelRef.current?.focus(); }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") || []);
      const wrapIndex = resolveFocusWrapIndex(focusable.indexOf(document.activeElement as HTMLElement), focusable.length, event.shiftKey);
      if (wrapIndex >= 0) {
        event.preventDefault();
        focusable[wrapIndex].focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [busy, onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch {
      setError(request.permanent ? "永久删除失败，内容仍保留在回收站" : "删除失败，内容没有移动");
      setBusy(false);
    }
  }

  return (
    <div className="delete-confirm-backdrop">
      <section ref={dialogRef} className={`delete-confirm-dialog ${request.permanent ? "permanent" : ""}`} role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-title" aria-describedby="delete-confirm-description">
        <header><span>{request.permanent ? "PERMANENT DELETE" : "MOVE TO TRASH"}</span><h2 id="delete-confirm-title">{request.permanent ? "永久删除这条内容？" : "移入回收站？"}</h2><p id="delete-confirm-description">{request.permanent ? "删除后无法恢复，请确认你不再需要它。" : "内容将从普通目录隐藏，之后可以在回收站恢复。"}</p></header>
        <form onSubmit={(event) => void submit(event)}>
          <div className="delete-confirm-item"><strong>{request.item.label}</strong><small>{request.item.folder || "未分类"}</small></div>
          {error && <p className="delete-confirm-error" role="alert">{error}</p>}
          <div className="delete-confirm-actions"><button ref={cancelRef} type="button" onClick={onClose} disabled={busy}>取消</button><button className={request.permanent ? "danger" : "primary"} disabled={busy}>{busy ? "正在处理…" : request.permanent ? "永久删除" : "移入回收站"}</button></div>
        </form>
      </section>
    </div>
  );
}
