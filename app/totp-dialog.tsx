"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { copyTextWithExpiry } from "./clipboard";
import { TOTP_NAME_MAX, accountTitle, formatCode, generateTotp, parseTotpInput, secondsLeft, type TotpAccount } from "./totp-core";
import { openTotpStore, type TotpStore } from "./totp-store";
import { scanQrFromBlob } from "./qr-scan";
import { Icon } from "./ui-atoms";

// Hidden 验证码 (Mac only): 6-digit codes with a countdown, click a row to copy. Secrets never leave the encrypted store.
function useNow(interval = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}

function Ring({ left, period }: { left: number; period: number }) {
  const radius = 9;
  const length = 2 * Math.PI * radius;
  return (
    <svg className={`totp-ring${left <= 5 ? " urgent" : ""}`} width="26" height="26" viewBox="0 0 26 26" role="img" aria-label={`还剩 ${left} 秒`}>
      <circle cx="13" cy="13" r={radius} className="totp-ring-track" />
      <circle cx="13" cy="13" r={radius} className="totp-ring-arc" strokeDasharray={length} strokeDashoffset={length * (1 - left / period)} transform="rotate(-90 13 13)" />
      <text x="13" y="13" textAnchor="middle" dominantBaseline="central">{left}</text>
    </svg>
  );
}

function TotpRow({ account, now, copied, confirming, onCopy, onAskDelete, onCancelDelete, onDelete }: {
  account: TotpAccount; now: number; copied: boolean; confirming: boolean;
  onCopy: (code: string, left: number) => void; onAskDelete: () => void; onCancelDelete: () => void; onDelete: () => void;
}) {
  const [code, setCode] = useState("");
  const step = Math.floor(now / 1000 / account.period);
  useEffect(() => {
    let live = true;
    void generateTotp(account, step * account.period * 1000).then((value) => { if (live) setCode(value); });
    return () => { live = false; };
  }, [account, step]);
  const left = secondsLeft(account.period, now);
  return (
    <li className="totp-row">
      <button type="button" className={`totp-main${copied ? " copied" : ""}`} onClick={() => code && onCopy(code, left)} aria-label={`复制 ${accountTitle(account)} 的验证码`}>
        <span className="totp-who"><strong>{accountTitle(account)}</strong>{account.issuer && account.name && <small>{account.name}</small>}</span>
        <span className="totp-code" aria-live="off">{code ? formatCode(code) : "······"}</span>
        <span className="totp-copy-icon"><Icon name={copied ? "check" : "copy"} /></span>
      </button>
      <Ring left={left} period={account.period} />
      {confirming
        ? <span className="totp-confirm"><button type="button" className="secondary-button" onClick={onCancelDelete}>取消</button><button type="button" className="secondary-button danger-text" onClick={onDelete}>确认删除</button></span>
        : <button type="button" className="icon-button totp-delete" onClick={onAskDelete} aria-label={`删除 ${accountTitle(account)}`} title="删除"><Icon name="trash" /></button>}
    </li>
  );
}

export function TotpPanel({ deviceKey, onToast }: { deviceKey: string; onToast: (message: string) => void }) {
  const storeRef = useRef<TotpStore | null>(null);
  const [accounts, setAccounts] = useState<TotpAccount[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState("");
  const [name, setName] = useState("");
  const [formError, setFormError] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [deleteId, setDeleteId] = useState("");
  const now = useNow();
  const secretRef = useRef<HTMLTextAreaElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    const store = openTotpStore(deviceKey);
    storeRef.current = store;
    store.list().then((list) => { if (live) setAccounts(list); }).catch((error: Error) => { if (live) setLoadError(error.message); });
    return () => { live = false; };
  }, [deviceKey]);
  useEffect(() => { if (adding) secretRef.current?.focus(); }, [adding]);
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);
  async function copy(account: TotpAccount, code: string, left: number) {
    try {
      await copyTextWithExpiry(code);
      setCopiedId(account.id);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedId(""), 1600);
      onToast(left <= 5 ? `已复制，但这个码只剩 ${left} 秒，来不及就等下一个` : "验证码已复制");
    } catch {
      onToast("复制失败，请重试");
    }
  }

  // A QR picture (chosen or pasted as a screenshot) fills in the otpauth:// link.
  async function readQr(blob: Blob | null | undefined) {
    if (!blob) return;
    try {
      const link = await scanQrFromBlob(blob);
      setSecret(link);
      setFormError("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "识别失败，请重试");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const store = storeRef.current;
    if (!store) return;
    try {
      const draft = parseTotpInput(secret, name);
      // A name typed here wins over the one inside an otpauth:// link.
      if (name.trim()) draft.name = Array.from(name.trim().replace(/\s+/g, " ")).slice(0, TOTP_NAME_MAX).join("");
      const account: TotpAccount = { ...draft, id: crypto.randomUUID(), createdAt: Date.now() };
      setAccounts(await store.add(account));
      setSecret(""); setName(""); setFormError(""); setAdding(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "添加失败，请重试");
    }
  }

  async function remove(id: string) {
    try {
      setAccounts(await storeRef.current!.remove(id));
      setDeleteId("");
    } catch {
      onToast("删除失败，请重试");
    }
  }

  return (
    <>
    {loadError && <p className="settings-note" role="alert">{loadError}</p>}
    {!loadError && accounts === null && <p className="settings-note">正在读取…</p>}
    {accounts && accounts.length === 0 && !adding && <p className="totp-empty">还没有账号。点下面的「添加账号」，粘贴密钥或 otpauth:// 链接。</p>}
    {accounts && accounts.length > 0 && (
      <ul className="totp-list">
        {accounts.map((account) => (
          <TotpRow key={account.id} account={account} now={now} copied={copiedId === account.id} confirming={deleteId === account.id}
            onCopy={(code, left) => void copy(account, code, left)} onAskDelete={() => setDeleteId(account.id)} onCancelDelete={() => setDeleteId("")} onDelete={() => void remove(account.id)} />
        ))}
      </ul>
    )}
    {adding && (
      <form className="totp-form" onSubmit={(event) => void submit(event)}>
        <label>密钥或链接<textarea value={secret} onChange={(event) => { setSecret(event.target.value); setFormError(""); }} placeholder="JBSW Y3DP EHPK 3PXP 或 otpauth://totp/…，也可以直接粘贴二维码截图" rows={2} ref={secretRef} spellCheck={false} autoComplete="off"
          onPaste={(event) => { const file = Array.from(event.clipboardData.files).find((entry) => entry.type.startsWith("image/")); if (file) { event.preventDefault(); void readQr(file); } }} /></label>
      <label className="totp-qr">二维码截图（可不选）<input type="file" accept="image/*" aria-label="选二维码图片" onChange={(event) => { void readQr(event.target.files?.[0]); event.target.value = ""; }} /></label>
        <label>名称（可不填）<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：公司邮箱" maxLength={40} autoComplete="off" /></label>
        {formError && <p className="totp-error" role="alert">{formError}</p>}
        <div className="settings-inline-actions"><button type="button" className="secondary-button" onClick={() => { setAdding(false); setFormError(""); }}>取消</button><button type="submit" className="primary-button">保存</button></div>
      </form>
    )}
    {!adding && accounts && <div className="totp-actions">
      <button type="button" className="primary-button" onClick={() => setAdding(true)}><Icon name="plus" />添加账号</button>
    </div>}
    </>
  );
}
