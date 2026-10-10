"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { copyTextWithExpiry } from "./clipboard";
import { TOTP_NAME_MAX, accountTitle, formatCode, generateTotp, parseTotpInput, secondsLeft, type TotpAccount } from "./totp-core";
import { openTotpStore, type TotpStore } from "./totp-store";
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
  onCopy: (code: string) => void; onAskDelete: () => void; onCancelDelete: () => void; onDelete: () => void;
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
      <button type="button" className={`totp-main${copied ? " copied" : ""}`} onClick={() => code && onCopy(code)} aria-label={`复制 ${accountTitle(account)} 的验证码`}>
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

export function TotpDialog({ deviceKey, onClose, onHide, onToast }: { deviceKey: string; onClose: () => void; onHide: () => void; onToast: (message: string) => void }) {
  const storeRef = useRef<TotpStore | null>(null);
  const [accounts, setAccounts] = useState<TotpAccount[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState("");
  const [name, setName] = useState("");
  const [formError, setFormError] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [deleteId, setDeleteId] = useState("");
  const [confirmHide, setConfirmHide] = useState(false);
  const now = useNow();
  const closeRef = useRef<HTMLButtonElement>(null);
  const secretRef = useRef<HTMLTextAreaElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    let live = true;
    const store = openTotpStore(deviceKey);
    storeRef.current = store;
    store.list().then((list) => { if (live) setAccounts(list); }).catch((error: Error) => { if (live) setLoadError(error.message); });
    return () => { live = false; };
  }, [deviceKey]);
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => { if (adding) secretRef.current?.focus(); }, [adding]);
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if ((event.target as HTMLElement | null)?.closest?.("form")) { setAdding(false); return; }
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  async function copy(account: TotpAccount, code: string) {
    try {
      await copyTextWithExpiry(code);
      setCopiedId(account.id);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedId(""), 1600);
      onToast("验证码已复制");
    } catch {
      onToast("复制失败，请重试");
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
    <div className="settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="settings-dialog totp-dialog" role="dialog" aria-modal="true" aria-labelledby="totp-title">
        <header><h2 id="totp-title">验证码</h2><button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label="关闭验证码">×</button></header>
        <div className="settings-body">
          {loadError && <p className="settings-note" role="alert">{loadError}</p>}
          {!loadError && accounts === null && <p className="settings-note">正在读取…</p>}
          {accounts && accounts.length === 0 && !adding && <p className="totp-empty">还没有账号。点下面的「添加账号」，粘贴密钥或 otpauth:// 链接。</p>}
          {accounts && accounts.length > 0 && (
            <ul className="totp-list">
              {accounts.map((account) => (
                <TotpRow key={account.id} account={account} now={now} copied={copiedId === account.id} confirming={deleteId === account.id}
                  onCopy={(code) => void copy(account, code)} onAskDelete={() => setDeleteId(account.id)} onCancelDelete={() => setDeleteId("")} onDelete={() => void remove(account.id)} />
              ))}
            </ul>
          )}
          {adding && (
            <form className="totp-form" onSubmit={(event) => void submit(event)}>
              <label>密钥或链接<textarea value={secret} onChange={(event) => { setSecret(event.target.value); setFormError(""); }} placeholder="JBSW Y3DP EHPK 3PXP 或 otpauth://totp/…" rows={2} ref={secretRef} spellCheck={false} autoComplete="off" /></label>
              <label>名称（可不填）<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：公司邮箱" maxLength={40} autoComplete="off" /></label>
              {formError && <p className="totp-error" role="alert">{formError}</p>}
              <div className="settings-inline-actions"><button type="button" className="secondary-button" onClick={() => { setAdding(false); setFormError(""); }}>取消</button><button type="submit" className="primary-button">保存</button></div>
            </form>
          )}
          {!adding && accounts && <div className="totp-actions">
            <button type="button" className="primary-button" onClick={() => setAdding(true)}><Icon name="plus" />添加账号</button>
            {confirmHide
              ? <span className="settings-inline-actions"><button type="button" className="secondary-button" onClick={() => setConfirmHide(false)}>取消</button><button type="button" className="secondary-button" onClick={onHide}>确认隐藏</button></span>
              : <button type="button" className="secondary-button" onClick={() => setConfirmHide(true)} title="隐藏后入口消失；账号仍保存在本机">隐藏入口</button>}
          </div>}
          <p className="settings-note">密钥用本机密钥加密保存，不进备份文件。隐藏入口后，在设置里连点版本号 5 次可重新打开。</p>
        </div>
      </section>
    </div>
  );
}
