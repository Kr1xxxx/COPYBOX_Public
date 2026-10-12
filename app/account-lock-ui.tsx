"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ENCRYPTED_LOCK_MIN, type LockMode, changeEncryptedPassword, checkRecoveryEmail, getRecoveryEmail, lockMode, maskEmail, removeAccountLock, renewRecoveryCode, requestPasswordReset, resetPasswordWithRecovery, setRecoveryEmail, unlockEncrypted, verifyAccountLock } from "./account-lock";
import { deletePremigrationBackup, disableAccountEncryption, enableAccountEncryption, finishAccountMigration, hasPremigrationBackup } from "./account-encryption";
import { VaultMark } from "./ui-atoms";

// Shown instead of the 账号 page while a password is set and has not been entered yet. `onUnlock(key)`: the key the password
// opened (null for the old door-only password, whose data is still under the device key).
export function AccountLockScreen({ deviceKey, onUnlock }: { deviceKey: string; onUnlock: (key: string | null) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [forgotNote, setForgotNote] = useState("");
  const [code, setCode] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const mode = typeof window === "undefined" ? "none" : lockMode();
  const email = typeof window === "undefined" ? "" : getRecoveryEmail();

  async function open(key: string) {
    await finishAccountMigration(deviceKey, key); // only does anything after an interrupted change
    onUnlock(key);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "encrypted") {
        const key = await unlockEncrypted(password);
        if (key !== null) { await open(key); return; }
      } else if (await verifyAccountLock(password)) { onUnlock(null); return; }
      setError("密码不对，请再试一次");
      setPassword("");
      inputRef.current?.focus();
    } catch {
      setError("检查失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  async function sendReset() {
    setBusy(true);
    const result = await requestPasswordReset();
    setBusy(false);
    setForgotNote(result.ok ? "已发送，请查收邮件。" : result.reason === "no-server" ? "找回功能需要服务器，部署后开通。" : result.reason === "no-email" ? "没有设置找回邮箱，暂时无法重置。" : "发送失败，请稍后再试。");
  }

  async function recover(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (next !== again) { setForgotNote("两次输入的密码不一样"); return; }
    setBusy(true);
    try {
      const key = await resetPasswordWithRecovery(code, next);
      if (key === null) setForgotNote("恢复码不对，请检查后再试");
      else await open(key);
    } catch (reason) {
      setForgotNote(reason instanceof Error ? reason.message : "没有成功，请重试");
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
            {mode === "encrypted" && <div className="account-lock-recover" role="group" aria-label="用恢复码找回">
              <small>有恢复码就能重设密码，账号里的内容不会丢。</small>
              <input type="text" value={code} autoComplete="off" aria-label="恢复码" placeholder="恢复码 XXXX-XXXX-XXXX-XXXX-XXXX" onChange={(event) => { setCode(event.target.value); setForgotNote(""); }} />
              <input type="password" value={next} autoComplete="off" aria-label="新密码" placeholder={`新密码（至少 ${ENCRYPTED_LOCK_MIN} 位）`} onChange={(event) => { setNext(event.target.value); setForgotNote(""); }} />
              <input type="password" value={again} autoComplete="off" aria-label="再输入一次新密码" placeholder="再输入一次" onChange={(event) => { setAgain(event.target.value); setForgotNote(""); }} />
              <button type="button" className="secondary-button" disabled={busy || code.trim() === "" || next === ""} onClick={(event) => void recover(event)}>用恢复码重设密码</button>
            </div>}
            <small>{email ? `也可以向 ${maskEmail(email)} 发一封重置邮件。` : mode === "encrypted" ? "没有设置找回邮箱。" : "你没有设置找回邮箱，暂时无法重置。"}</small>
            {email && <button type="button" className="secondary-button" disabled={busy} onClick={() => void sendReset()}>发送重置邮件</button>}
            {forgotNote && <small role="status">{forgotNote}</small>}
          </div>}
    </form>
  );
}

type Mode = "idle" | "set" | "upgrade" | "change" | "remove" | "recovery";
export type LockChange = (mode: LockMode, key: string | null) => void;

// The 「账号页密码」 row in Settings → 数据 → 安全. A password now also encrypts the 账号 data, and comes with a recovery code.
export function AccountLockSettings({ mode: lockNow, deviceKey, onChanged }: { mode: LockMode; deviceKey: string; onChanged: LockChange }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [saved, setSaved] = useState(false);
  const [backup, setBackup] = useState(() => typeof window !== "undefined" && hasPremigrationBackup());
  const [backupAsk, setBackupAsk] = useState(false);

  function open(to: Mode) { setEmail(getRecoveryEmail()); setMode(to); }
  function close() { setMode("idle"); setCurrent(""); setNext(""); setAgain(""); setEmail(""); setError(""); setCode(""); setSaved(false); }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "remove") {
        if (lockNow === "encrypted") await disableAccountEncryption({ deviceKey, password: current });
        else if (await verifyAccountLock(current)) removeAccountLock();
        else { setError("现在的密码不对"); return; }
        setBackup(hasPremigrationBackup());
        onChanged("none", null);
        close();
        return;
      }
      if (mode === "recovery") {
        const fresh = await renewRecoveryCode(current);
        if (fresh === null) { setError("现在的密码不对"); return; }
        setCode(fresh);
        return;
      }
      if (mode === "upgrade" && !(await verifyAccountLock(current))) { setError("现在的密码不对"); return; }
      if (mode === "change" && (await unlockEncrypted(current)) === null) { setError("现在的密码不对"); return; }
      if (Array.from(next).length < ENCRYPTED_LOCK_MIN) { setError(`密码至少 ${ENCRYPTED_LOCK_MIN} 位`); return; }
      if (next !== again) { setError("两次输入的密码不一样"); return; }
      const emailProblem = checkRecoveryEmail(email);
      if (emailProblem) { setError(emailProblem); return; }
      if (mode === "change") {
        const key = await changeEncryptedPassword(current, next);
        if (key === null) { setError("现在的密码不对"); return; }
        setRecoveryEmail(email);
        onChanged("encrypted", key);
        close();
        return;
      }
      // set / upgrade: encrypt the data with the new password (a recovery code comes back, shown once)
      const result = await enableAccountEncryption({ deviceKey, password: next, email });
      setBackup(hasPremigrationBackup());
      setCode(result.recoveryCode);
      onChanged("encrypted", result.dataKey);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  const status = lockNow === "encrypted"
    ? "已设置：账号数据用这个密码加密。忘记密码时用恢复码找回；两样都丢了，数据就打不开了"
    : lockNow === "door"
      ? "旧密码：只挡住打开，数据没有用它加密。点「加密…」升级，升级时要换成至少 8 位的新密码"
      : `未设置：设置后，账号数据会用这个密码加密（至少 ${ENCRYPTED_LOCK_MIN} 位）`;

  if (code !== "") {
    return (
      <div className="settings-row account-lock-form account-recovery-code" data-local-esc="">
        <div>
          <strong>请保存好恢复码</strong>
          <code className="recovery-code-text" aria-label="恢复码">{code}</code>
          <small>恢复码只显示这一次。忘记密码时，靠它重设密码并找回账号数据；密码和恢复码都丢了，账号数据就打不开了。请抄下来或存到别处，不要和电脑放在一起。</small>
          <label className="recovery-saved"><input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} /> 我已经把恢复码保存好了</label>
        </div>
        <div className="settings-inline-actions">
          <button type="button" className="secondary-button" onClick={() => void (window.clipboxDesktop?.copyText ?? navigator.clipboard.writeText.bind(navigator.clipboard))(code)}>复制</button>
          <button type="button" className="primary-button" disabled={!saved} onClick={close}>完成</button>
        </div>
      </div>
    );
  }

  if (mode === "idle") {
    return (
      <>
        <div className="settings-row"><div><strong>账号页密码</strong><small>{status}</small></div>
          {lockNow === "none"
            ? <button type="button" className="secondary-button" onClick={() => open("set")}>设置…</button>
            : <div className="settings-inline-actions">
                {lockNow === "door" && <button type="button" className="secondary-button" onClick={() => open("upgrade")}>加密…</button>}
                {lockNow === "encrypted" && <button type="button" className="secondary-button" onClick={() => open("change")}>修改…</button>}
                {lockNow === "encrypted" && <button type="button" className="secondary-button" onClick={() => open("recovery")}>新恢复码…</button>}
                <button type="button" className="secondary-button" onClick={() => open("remove")}>关闭…</button>
              </div>}
        </div>
        {backup && <div className="settings-row"><div><strong>设密码前的备份</strong><small>{lockNow === "none" ? "留着没有用了，可以删除。" : "设密码前的数据副本，仍用旧方式加密（拿到电脑文件的人能打开它）。确认一切正常后，建议删除。"}</small></div>
          {backupAsk
            ? <div className="settings-inline-actions"><button type="button" className="secondary-button" onClick={() => setBackupAsk(false)}>取消</button><button type="button" className="secondary-button danger-text" onClick={() => { deletePremigrationBackup(); setBackup(false); setBackupAsk(false); }}>确认删除备份</button></div>
            : <button type="button" className="secondary-button" onClick={() => setBackupAsk(true)}>删除备份…</button>}
        </div>}
      </>
    );
  }
  const title = mode === "set" ? "设置账号页密码" : mode === "upgrade" ? "把旧密码升级为加密" : mode === "change" ? "修改账号页密码" : mode === "recovery" ? "换一个新的恢复码" : "关闭账号页密码";
  return (
    <form className="settings-row account-lock-form" onSubmit={(event) => void submit(event)} data-local-esc="">
      <div>
        <strong>{title}</strong>
        {mode !== "set" && <input type="password" aria-label="现在的密码" placeholder="现在的密码" autoComplete="off" value={current} onChange={(event) => { setCurrent(event.target.value); setError(""); }} />}
        {(mode === "set" || mode === "upgrade" || mode === "change") && <>
          <input type="password" aria-label="新密码" placeholder={`新密码（至少 ${ENCRYPTED_LOCK_MIN} 位）`} autoComplete="off" value={next} onChange={(event) => { setNext(event.target.value); setError(""); }} />
          <input type="password" aria-label="再输入一次新密码" placeholder="再输入一次" autoComplete="off" value={again} onChange={(event) => { setAgain(event.target.value); setError(""); }} />
          <input type="text" inputMode="email" aria-label="找回邮箱" placeholder="找回邮箱（可不填，服务器开通后用来重置）" autoComplete="off" maxLength={120} value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} />
        </>}
        {(mode === "set" || mode === "upgrade") && <small>设置后，账号里的内容会用这个密码加密，并给你一个恢复码（只显示一次）。设置前的数据会先留一份备份。Mac 上旧的「其他」列表不在加密范围内。</small>}
        {mode === "remove" && lockNow === "encrypted" && <small>关闭后，账号数据会改回不用密码的加密方式。</small>}
        {error && <small className="account-lock-error" role="alert">{error}</small>}
      </div>
      <div className="settings-inline-actions"><button type="button" className="secondary-button" onClick={close}>取消</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "处理中…" : mode === "remove" ? "关闭密码" : mode === "recovery" ? "生成" : "保存"}</button></div>
    </form>
  );
}
