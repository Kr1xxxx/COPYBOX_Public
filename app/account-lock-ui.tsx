"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ACCOUNT_LOCK_MIN, checkNewPassword, checkRecoveryEmail, getRecoveryEmail, maskEmail, removeAccountLock, requestPasswordReset, setAccountLock, verifyAccountLock } from "./account-lock";
import { VaultMark } from "./ui-atoms";

// Shown instead of the 账号 page while a password is set and has not been entered yet.
export function AccountLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [forgotNote, setForgotNote] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const email = typeof window === "undefined" ? "" : getRecoveryEmail();

  async function sendReset() {
    setBusy(true);
    const result = await requestPasswordReset();
    setBusy(false);
    setForgotNote(result.ok ? "已发送，请查收邮件。" : result.reason === "no-server" ? "找回功能需要服务器，部署后开通。" : result.reason === "no-email" ? "没有设置找回邮箱，暂时无法重置。" : "发送失败，请稍后再试。");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (await verifyAccountLock(password)) { onUnlock(); return; }
      setError("密码不对，请再试一次");
      setPassword("");
      inputRef.current?.focus();
    } catch {
      setError("检查失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="account-lock-screen" onSubmit={(event) => void submit(event)} aria-label="账号页已上锁">
      <VaultMark />
      <strong>账号页已上锁</strong>
      <span>输入密码后才能看到里面的内容</span>
      <input ref={inputRef} type="password" value={password} autoComplete="off" aria-label="账号页密码" placeholder="密码"
        onChange={(event) => { setPassword(event.target.value); setError(""); }} />
      {error && <small className="account-lock-error" role="alert">{error}</small>}
      <button type="submit" className="primary-button" disabled={busy || password === ""}>打开</button>
      {!forgot
        ? <button type="button" className="account-lock-link" onClick={() => setForgot(true)}>忘记密码</button>
        : <div className="account-lock-forgot">
            <small>{email ? `将向 ${maskEmail(email)} 发一封重置邮件。账号里的内容不会被清空。` : "你没有设置找回邮箱，暂时无法重置。"}</small>
            {email && <button type="button" className="secondary-button" disabled={busy} onClick={() => void sendReset()}>发送重置邮件</button>}
            {forgotNote && <small role="status">{forgotNote}</small>}
          </div>}
    </form>
  );
}

type Mode = "idle" | "set" | "change" | "remove";

// The 「账号页密码」 row in Settings → 数据 → 安全: set, change or turn off. Changing or turning off asks for the current one.
export function AccountLockSettings({ isSet, onChanged }: { isSet: boolean; onChanged: (isSet: boolean) => void }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function open(next: Mode) { setEmail(getRecoveryEmail()); setMode(next); }
  function close() { setMode("idle"); setCurrent(""); setNext(""); setAgain(""); setEmail(""); setError(""); }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode !== "set" && !(await verifyAccountLock(current))) { setError("现在的密码不对"); return; }
      if (mode === "remove") { removeAccountLock(); onChanged(false); close(); return; }
      const problem = checkNewPassword(next);
      if (problem) { setError(problem); return; }
      if (next !== again) { setError("两次输入的密码不一样"); return; }
      const emailProblem = checkRecoveryEmail(email);
      if (emailProblem) { setError(emailProblem); return; }
      await setAccountLock(next, undefined, email);
      onChanged(true);
      close();
    } catch {
      setError("保存失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "idle") {
    return (
      <div className="settings-row"><div><strong>账号页密码</strong><small>{isSet ? "已设置：打开账号页要先输入密码。忘记时可用找回邮箱重置" : `未设置：设置后，打开账号页要先输入密码（至少 ${ACCOUNT_LOCK_MIN} 位）`}</small></div>
        {isSet
          ? <div className="settings-inline-actions"><button type="button" className="secondary-button" onClick={() => open("change")}>修改…</button><button type="button" className="secondary-button" onClick={() => open("remove")}>关闭…</button></div>
          : <button type="button" className="secondary-button" onClick={() => open("set")}>设置…</button>}
      </div>
    );
  }
  return (
    <form className="settings-row account-lock-form" onSubmit={(event) => void submit(event)} data-local-esc="">
      <div>
        <strong>{mode === "set" ? "设置账号页密码" : mode === "change" ? "修改账号页密码" : "关闭账号页密码"}</strong>
        {mode !== "set" && <input type="password" aria-label="现在的密码" placeholder="现在的密码" autoComplete="off" value={current} onChange={(event) => { setCurrent(event.target.value); setError(""); }} />}
        {mode !== "remove" && <>
          <input type="password" aria-label="新密码" placeholder={`新密码（至少 ${ACCOUNT_LOCK_MIN} 位）`} autoComplete="off" value={next} onChange={(event) => { setNext(event.target.value); setError(""); }} />
          <input type="password" aria-label="再输入一次新密码" placeholder="再输入一次" autoComplete="off" value={again} onChange={(event) => { setAgain(event.target.value); setError(""); }} />
          <input type="text" inputMode="email" aria-label="找回邮箱" placeholder="找回邮箱（可不填，忘记密码时用）" autoComplete="off" maxLength={120} value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} />
        </>}
        {mode === "set" && <small>忘记密码时可用上面的找回邮箱重置（需要服务器，部署后开通），不填则无法找回。密码只决定能不能打开账号页，里面的内容本来就是加密保存的。</small>}
        {error && <small className="account-lock-error" role="alert">{error}</small>}
      </div>
      <div className="settings-inline-actions"><button type="button" className="secondary-button" onClick={close}>取消</button><button type="submit" className="primary-button" disabled={busy}>{mode === "remove" ? "关闭密码" : "保存"}</button></div>
    </form>
  );
}
