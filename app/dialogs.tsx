"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { resolveFocusWrapIndex, type ImportStrategy, type SecretItem } from "./clipbox-core";
import type { SnippetImportPreview } from "./snippet-import";

// "export" saves the snippets, "export-secret" the 秘密 section; each goes to its own file.
// secretWord is empty where that section does not exist (Windows), so the texts do not mention it.
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
          <div><h2 id="snippet-import-title">导入话术表格</h2><small title={fileName}>{fileName}</small></div>
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
          <p className="import-privacy">文件只在本机解析。导入采用合并方式，不会覆盖{secretWord ? `${secretWord}或` : ""}现有话术。</p>
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
  const dialogRef = useRef<HTMLElement>(null);
  const exporting = mode !== "import";
  const exportWord = mode === "export-secret" ? secretWord : "话术";
  const otherWord = mode === "export-secret" ? "话术" : secretWord;
  useDialogKeyboard(dialogRef, onClose, busy);
  useEffect(() => { dialogRef.current?.querySelector<HTMLElement>("input")?.focus(); }, []);

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
      <section ref={dialogRef} className="backup-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-title">
        <header className="backup-head">
          <h2 id="backup-title">{exporting ? `导出${exportWord}备份` : "导入备份"}</h2>
        </header>
        <form className="backup-form" onSubmit={submit}>
          <p className="backup-intro">{exporting ? `只备份${exportWord}，并使用独立密码加密${otherWord ? `；${otherWord}不会包含在文件中` : ""}。` : needsPassword ? "先验证备份密码，验证成功后才会写入本机数据。" : "已识别旧版备份。导入前仍可选择合并或覆盖。"}</p>
          {needsPassword && <label className="backup-field"><span>备份密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={exporting ? "至少 8 个字符" : "输入导出时设置的密码"} autoComplete="off" /></label>}
          {exporting && <label className="backup-field"><span>再次输入</span><input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="确认备份密码" autoComplete="off" /></label>}
          {mode === "import" && <fieldset className="backup-strategy"><legend>导入方式</legend><div><button type="button" className={strategy === "merge" ? "active" : ""} onClick={() => setStrategy("merge")}><strong>合并</strong><small>保留现有内容并去重</small></button><button type="button" className={strategy === "replace" ? "active danger" : ""} onClick={() => setStrategy("replace")}><strong>覆盖</strong><small>用备份替换当前内容</small></button></div></fieldset>}
          {error && <p className="backup-error">{error}</p>}
          <p className="backup-note">{exporting ? "请妥善保存密码；Copyboxx 无法找回备份密码。" : strategy === "merge" ? "同类型、同标题且内容相同的条目不会重复导入。" : "覆盖会清空当前条目，仅保留备份中的内容。"}</p>
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
        <header><h2 id="delete-confirm-title">{request.permanent ? "永久删除这条内容？" : "移入回收站？"}</h2><p id="delete-confirm-description">{request.permanent ? "删除后无法恢复，请确认你不再需要它。" : "内容将从普通目录隐藏，之后可以在回收站恢复。"}</p></header>
        <form onSubmit={(event) => void submit(event)}>
          <div className="delete-confirm-item"><strong>{request.item.label}</strong><small>{request.item.folder || "未分类"}</small></div>
          {error && <p className="delete-confirm-error" role="alert">{error}</p>}
          <div className="delete-confirm-actions"><button ref={cancelRef} type="button" onClick={onClose} disabled={busy}>取消</button><button className={request.permanent ? "danger" : "primary"} disabled={busy}>{busy ? "正在处理…" : request.permanent ? "永久删除" : "移入回收站"}</button></div>
        </form>
      </section>
    </div>
  );
}

// 回收站「全部删除」: the same card as 删除确认, naming how many go. 取消 has focus, so Enter or Escape keeps everything.
export function EmptyTrashDialog({ count, unit = "条内容", onClose, onConfirm }: {
  count: number;
  unit?: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useDialogKeyboard(dialogRef, onClose, busy);
  useEffect(() => { cancelRef.current?.focus(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch {
      setError("删除失败，回收站里还有没删掉的内容");
      setBusy(false);
    }
  }

  return (
    <div className="delete-confirm-backdrop">
      <section ref={dialogRef} className="delete-confirm-dialog permanent" role="alertdialog" aria-modal="true" aria-labelledby="empty-trash-title" aria-describedby="empty-trash-description">
        <header><h2 id="empty-trash-title">全部永久删除？</h2><p id="empty-trash-description">回收站里的内容删除后无法恢复，请确认你不再需要它们。</p></header>
        <form onSubmit={(event) => void submit(event)}>
          <div className="delete-confirm-item"><strong>{count} {unit}</strong><small>回收站</small></div>
          {error && <p className="delete-confirm-error" role="alert">{error}</p>}
          <div className="delete-confirm-actions"><button ref={cancelRef} type="button" onClick={onClose} disabled={busy}>取消</button><button className="danger" disabled={busy}>{busy ? "正在删除…" : "全部删除"}</button></div>
        </form>
      </section>
    </div>
  );
}

// Shown on start when there is no data but an import was cut off half-way (audit #15, D-096): the copy taken before it is
// still there. Same card as 删除确认. 「先不恢复」 starts empty; the copy stays and 设置 › 数据 can still bring it back.
export function LeftoverRestoreDialog({ onRestore, onSkip }: { onRestore: () => Promise<void>; onSkip: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const restoreRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { restoreRef.current?.focus(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onRestore();
    } catch {
      setError("没能恢复，请再试一次");
      setBusy(false);
    }
  }

  return (
    <div className="delete-confirm-backdrop">
      <section className="delete-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="leftover-restore-title" aria-describedby="leftover-restore-description">
        <header><h2 id="leftover-restore-title">恢复原来的内容？</h2><p id="leftover-restore-description">上次导入备份没有完成，这台设备上暂时是空的。导入前的内容还保留着，可以放回来。</p></header>
        <form onSubmit={(event) => void submit(event)}>
          {error && <p className="delete-confirm-error" role="alert">{error}</p>}
          <div className="delete-confirm-actions"><button type="button" onClick={onSkip} disabled={busy}>先不恢复</button><button ref={restoreRef} className="primary" disabled={busy}>{busy ? "正在恢复…" : "恢复原来的内容"}</button></div>
        </form>
      </section>
    </div>
  );
}

// Asked when the command line wants a 秘密 (clipbox-automation.ts). 拒绝 has focus, so Enter or Escape refuses.
// 「始终允许」 (D-059) is offered only when the shell could tell which program asked, and never for an export of all 秘密.
export function AutomationConsentDialog({ question, callerName, canAlways = false, onAnswer }: {
  question: string; callerName?: string; canAlways?: boolean;
  onAnswer: (answer: "denied" | "once" | "always") => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const deny = useCallback(() => onAnswer("denied"), [onAnswer]);
  useDialogKeyboard(dialogRef, deny);
  useEffect(() => { dialogRef.current?.querySelector<HTMLElement>("[data-deny]")?.focus(); }, []);
  return (
    <div className="delete-confirm-backdrop" role="presentation">
      <section ref={dialogRef} className="delete-confirm-dialog consent-dialog" role="alertdialog" aria-modal="true" aria-labelledby="automation-consent-title" aria-describedby="automation-consent-text">
        <header><h2 id="automation-consent-title">允许读取秘密吗？</h2><p id="automation-consent-text">{question}</p>
          {callerName && <p className="automation-consent-caller">来自：<strong>{callerName}</strong></p>}</header>
        <div className="consent-body">
          <p className="consent-note">如果不是你自己刚刚运行的命令，请点「拒绝」。{canAlways && `选「始终允许」后，${callerName}以后读取秘密不再询问，可在 设置 → 数据 → 始终允许的程序 里取消。`}</p>
          <div className="delete-confirm-actions consent-actions">
            <button type="button" data-deny onClick={deny}>拒绝</button>
            {canAlways && <button type="button" onClick={() => onAnswer("always")}>始终允许</button>}
            <button type="button" className="primary" onClick={() => onAnswer("once")}>允许</button>
          </div>
        </div>
      </section>
    </div>
  );
}
