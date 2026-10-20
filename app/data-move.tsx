"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { secureKeyStore, withDeviceKey } from "./device-key-store";
import { withSecretSettings } from "./secret-settings";
import { applyPayload, collectPayload, countImages, countPayload, countStoredImages, hasStashedBackup, openTransfer, restoreStashedBackup, TransferError, type TransferPayload, parseTransferFile, sealTransfer, transferFileName, transferFileParts, type TransferFile } from "./data-transfer";

// One-time move of all local data between the old (Electron) and new (Tauri) desktop app. Reuses the backup dialog's look.
export function DataMoveDialog({ mode, itemCount, onClose }: { mode: "export" | "import"; itemCount: number; onClose: () => void }) {
  const exporting = mode === "export";
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  // Focus inside the dialog, so Esc closes this dialog and not the settings behind it (see data-local-esc in settings.tsx).
  useEffect(() => { dialogRef.current?.focus(); }, []);
  const [file, setFile] = useState<TransferFile | null>(null);
  const [fileName, setFileName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  // After the password checks out, the import waits for one more click that says what will be replaced.
  const [leftover, setLeftover] = useState(false);
  useEffect(() => {
    if (exporting) return;
    let cancelled = false;
    void hasStashedBackup().then((found) => { if (!cancelled) setLeftover(found); });
    return () => { cancelled = true; };
  }, [exporting]);
  async function restoreLeftover() {
    setBusy(true);
    setError("");
    try {
      if (await restoreStashedBackup()) window.location.reload();
      else setLeftover(false);
    } catch {
      setError("没能恢复，请再试一次");
    } finally {
      setBusy(false);
    }
  }
  const [pending, setPending] = useState<{ payload: TransferPayload; currentImages: number } | null>(null);

  useEffect(() => {
    const node = dialogRef.current;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if (!busy) onClose();
    };
    node?.addEventListener("keydown", onKey);
    return () => node?.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function pick(chosen: File | undefined) {
    if (!chosen) return;
    setError("");
    setPending(null);
    try {
      setFile(parseTransferFile(await chosen.text()));
      setFileName(chosen.name);
    } catch (problem) {
      setFile(null);
      setFileName("");
      setError(problem instanceof Error ? problem.message : "这不是完整备份文件");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (exporting && password.length < 8) return setError("密码至少需要 8 个字符");
    if (exporting && password !== confirmation) return setError("两次输入的密码不一致");
    if (!exporting && !file) return setError("请先选择完整备份文件");
    if (!exporting && !password) return setError("请输入密码");
    setBusy(true);
    try {
      if (exporting) {
        // The sealed file carries the device key even where it lives in Credential Manager (D-053).
        // …and the TinyPNG keys and the 同步码 (D-057).
        const payload = await withSecretSettings(await withDeviceKey(await collectPayload(), secureKeyStore()));
        const sealed = await sealTransfer(payload, password);
        const url = URL.createObjectURL(new Blob(transferFileParts(sealed), { type: "application/json" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = transferFileName();
        anchor.click();
        URL.revokeObjectURL(url);
        const counts = countPayload(payload);
        setSaved(`已导出：${counts.settings} 项设置，${counts.records} 条记录（话术、图片等）。请把文件放在安全的地方，需要时用「从完整备份恢复」读回来。`);
      } else {
        if (pending) {
          await applyPayload(pending.payload);
          window.location.reload();
        } else {
          const payload = await openTransfer(file as TransferFile, password);
          setPending({ payload, currentImages: await countStoredImages() });
        }
      }
    } catch (problem) {
      setError(problem instanceof TransferError ? problem.message : exporting ? "导出没有成功，请再试一次" : "恢复没有成功，现有内容没有改动，请再试一次");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="backup-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} data-local-esc className="backup-dialog data-move" role="dialog" aria-modal="true" aria-labelledby="move-title">
        <header className="backup-head">
          <div><p>全部内容</p><h2 id="move-title">{exporting ? "完整备份" : "从完整备份恢复"}</h2></div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="关闭">×</button>
        </header>
        {saved ? (
          <div className="backup-form">
            <p className="backup-intro">{saved}</p>
            <div className="backup-actions"><button type="button" className="primary" onClick={onClose}>完成</button></div>
          </div>
        ) : (
          <form className="backup-form" onSubmit={submit}>
            <p className="backup-intro">{exporting ? "把话术、账号、图片和设置一次性打包，用密码加密。" : "选择完整备份文件。恢复会用文件里的内容替换这里现有的全部内容。"}</p>
            {!exporting && (
              <div className="backup-field">
                <span>备份文件</span>
                <button type="button" className="secondary-button" onClick={() => fileRef.current?.click()}>{fileName || "选择文件…"}</button>
                <input ref={fileRef} className="hidden-input" type="file" accept="application/json" aria-label="备份文件" onChange={(event) => { void pick(event.target.files?.[0]); event.target.value = ""; }} />
              </div>
            )}
            <label className="backup-field"><span>密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={exporting ? "至少 8 个字符，建议更长" : "输入导出时设置的密码"} autoComplete="off" /></label>
            {exporting && <label className="backup-field"><span>再次输入</span><input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="确认密码" autoComplete="off" /></label>}
            {leftover && !pending && <p className="backup-warning" role="status">上一次导入没有完成。<button type="button" className="secondary-button" onClick={() => void restoreLeftover()} disabled={busy}>恢复导入前的内容</button></p>}
            {pending && <p className="backup-warning" role="alert">密码正确。继续会用文件里的内容（含 {countImages(pending.payload)} 张图片）替换现有的 {itemCount} 条内容、{pending.currentImages} 张图片，替换后不能撤销。</p>}
            {error && <p className="backup-error">{error}</p>}
            <p className="backup-note">{exporting ? "密码越长越安全，建议用 12 个字符以上。请妥善保存，Copyboxx 无法找回。AI 的密钥不在备份里，换电脑后需要重新填一次。" : "导入成功后会自动重新打开。"}</p>
            <div className="backup-actions"><button type="button" onClick={onClose} disabled={busy}>取消</button><button className={exporting ? "primary" : "danger"} disabled={busy}>{busy ? (exporting ? "正在加密…" : "正在导入…") : exporting ? "加密并导出" : pending ? "确认替换" : "验证并替换"}</button></div>
          </form>
        )}
      </section>
    </div>
  );
}
