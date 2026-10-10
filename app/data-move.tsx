"use client";

import { useRef, useState, type FormEvent } from "react";
import { applyPayload, collectPayload, countPayload, openTransfer, parseTransferFile, sealTransfer, transferFileName, type TransferFile } from "./data-transfer";

// One-time move of all local data between the old (Electron) and new (Tauri) desktop app. Reuses the backup dialog's look.
export function DataMoveDialog({ mode, onClose }: { mode: "export" | "import"; onClose: () => void }) {
  const exporting = mode === "export";
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<TransferFile | null>(null);
  const [fileName, setFileName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function pick(chosen: File | undefined) {
    if (!chosen) return;
    setError("");
    try {
      setFile(parseTransferFile(await chosen.text()));
      setFileName(chosen.name);
    } catch (problem) {
      setFile(null);
      setFileName("");
      setError(problem instanceof Error ? problem.message : "这不是搬家文件");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (exporting && password.length < 8) return setError("密码至少需要 8 个字符");
    if (exporting && password !== confirmation) return setError("两次输入的密码不一致");
    if (!exporting && !file) return setError("请先选择搬家文件");
    if (!exporting && !password) return setError("请输入密码");
    setBusy(true);
    try {
      if (exporting) {
        const payload = await collectPayload();
        const sealed = await sealTransfer(payload, password);
        const url = URL.createObjectURL(new Blob([JSON.stringify(sealed)], { type: "application/json" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = transferFileName();
        anchor.click();
        URL.revokeObjectURL(url);
        const counts = countPayload(payload);
        setSaved(`已导出：${counts.settings} 项设置，${counts.records} 条加密记录（话术、图片等）。请把文件拷到新版 Clipbox 里导入。`);
      } else {
        const payload = await openTransfer(file as TransferFile, password);
        await applyPayload(payload);
        window.location.reload();
      }
    } catch (problem) {
      setError(problem instanceof Error && !exporting ? problem.message : "没有成功，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="backup-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="backup-dialog" role="dialog" aria-modal="true" aria-labelledby="move-title">
        <header className="backup-head">
          <div><p>DATA MOVE</p><h2 id="move-title">{exporting ? "导出到新版" : "从旧版导入"}</h2></div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="关闭">×</button>
        </header>
        {saved ? (
          <div className="backup-form">
            <p className="backup-intro">{saved}</p>
            <div className="backup-actions"><button type="button" className="primary" onClick={onClose}>完成</button></div>
          </div>
        ) : (
          <form className="backup-form" onSubmit={submit}>
            <p className="backup-intro">{exporting ? "把话术、图片和设置一次性打包，用密码加密。换到新版 Clipbox 时用。" : "选择旧版导出的文件。导入会用文件里的内容替换这里现有的全部内容。"}</p>
            {!exporting && (
              <div className="backup-field">
                <span>搬家文件</span>
                <button type="button" className="secondary-button" onClick={() => fileRef.current?.click()}>{fileName || "选择文件…"}</button>
                <input ref={fileRef} className="hidden-input" type="file" accept="application/json" aria-label="搬家文件" onChange={(event) => { void pick(event.target.files?.[0]); event.target.value = ""; }} />
              </div>
            )}
            <label className="backup-field"><span>密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={exporting ? "至少 8 个字符" : "输入导出时设置的密码"} autoComplete="off" /></label>
            {exporting && <label className="backup-field"><span>再次输入</span><input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="确认密码" autoComplete="off" /></label>}
            {error && <p className="backup-error">{error}</p>}
            <p className="backup-note">{exporting ? "请妥善保存密码，Clipbox 无法找回。AI 的密钥不会带走，到新版里重新填一次。" : "导入成功后会自动重新打开。"}</p>
            <div className="backup-actions"><button type="button" onClick={onClose} disabled={busy}>取消</button><button className={exporting ? "primary" : "danger"} disabled={busy}>{busy ? (exporting ? "正在加密…" : "正在导入…") : exporting ? "加密并导出" : "验证并替换"}</button></div>
          </form>
        )}
      </section>
    </div>
  );
}
