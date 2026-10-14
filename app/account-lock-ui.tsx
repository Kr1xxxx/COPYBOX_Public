"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ENCRYPTED_LOCK_MIN, type LockMode, changeEncryptedPassword, checkRecoveryEmail, getRecoveryEmail, lockMode, markRecoveryCodeShown, maskEmail, removeAccountLock, renewRecoveryCode, renewUnseenRecoveryCode, requestPasswordReset, resetPasswordWithRecovery, setRecoveryEmail, unlockEncrypted, verifyAccountLock } from "./account-lock";
import { deletePremigrationBackup, disableAccountEncryption, enableAccountEncryption, finishAccountMigration, hasPremigrationBackup, notePremigrationUnlock } from "./account-encryption";
import { VaultMark } from "./ui-atoms";

// Shown instead of the 账号 page while a password is set and has not been entered yet. `onUnlock(key)`: the key the password
// opened (null for the old door-only password, whose data is still under the device key).
export function AccountLockScreen({ deviceKey, onUnlock }: { deviceKey: string; onUnlock: (key: string | null) => void }) {
  const [password, setPassword] = useState("");
  // A recovery code that was never confirmed as saved is replaced at unlock and shown here before the page opens (D-042).
  const [fresh, setFresh] = useState<{ code: string; key: string } | null>(null);
  const [freshSaved, setFreshSaved] = useState(false);
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
    reveal(key);
  }

  function reveal(key: string) {
    onUnlock(key);
    // The pre-migration copy goes after the data opened fine with K in three later app sessions.
    void notePremigrationUnlock(key).catch(() => undefined);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "encrypted") {
        const key = await unlockEncrypted(password);
        if (key !== null) {
          await finishAccountMigration(deviceKey, key); // only does anything after an interrupted change
          const code = await renewUnseenRecoveryCode(password);
          if (code !== null) { setFresh({ code, key }); return; }
          reveal(key);
          return;
        }
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

  if (fresh) {
    return (
      <div className="account-lock-screen account-recovery-code" role="group" aria-label="新的恢复码">
        <VaultMark />
        <strong>请保存好新的恢复码</strong>
        <div style={{ display: "grid", gap: 8, justifyItems: "center", maxWidth: 340, textAlign: "center" }}>
          <span>上次的恢复码还没确认保存，已经换成下面这个新的，旧的不能再用了。</span>
          <RecoveryCodeBody code={fresh.code} saved={freshSaved} onSaved={setFreshSaved} compact />
          <div className="settings-inline-actions">
            <CopyCodeButton code={fresh.code} />
            <button type="button" className="primary-button" disabled={!freshSaved} onClick={() => { markRecoveryCodeShown(); reveal(fresh.key); }}>完成</button>
          </div>
        </div>
      </div>
    );
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

// The code, what it is for, and the 「已保存」 tick. Shared by 设置 and the lock screen.
function RecoveryCodeBody({ code, saved, onSaved, compact = false }: { code: string; saved: boolean; onSaved: (saved: boolean) => void; compact?: boolean }) {
  return (
    <>
      <code className="recovery-code-text" aria-label="恢复码">{code}</code>
      <small>恢复码只显示这一次。忘记密码时，靠它重设密码并找回账号数据；密码和恢复码都丢了，账号数据就打不开了。请抄下来或存到别处，不要和电脑放在一起。</small>
      {/* compact: the lock screen styles every input as a wide text box, so the tick box is set back to its own size. */}
      <label className="recovery-saved"><input type="checkbox" checked={saved} style={compact ? { width: "auto", minHeight: 0 } : undefined} onChange={(event) => onSaved(event.target.checked)} /> 我已经把恢复码保存好了</label>
    </>
  );
}

function CopyCodeButton({ code }: { code: string }) {
  return <button type="button" className="secondary-button" onClick={() => void (window.clipboxDesktop?.copyText ?? navigator.clipboard.writeText.bind(navigator.clipboard))(code)}>复制</button>;
}

// Asked when 设置 is about to close while a recovery code is still on screen and not confirmed as saved.
export function RecoveryCloseConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  return (
    <div className="backup-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className="backup-dialog" role="alertdialog" aria-modal="true" aria-labelledby="recovery-close-title" aria-describedby="recovery-close-description">
        <header className="backup-head"><div><p>账号页密码</p><h2 id="recovery-close-title">恢复码还没保存，确定关闭吗？</h2></div></header>
        <div className="backup-form">
          <p className="backup-intro" id="recovery-close-description">关闭后这个恢复码就看不到了。下次用密码打开账号页时，会再给你一个新的。</p>
          <div className="backup-actions"><button type="button" onClick={onConfirm}>仍然关闭</button><button ref={cancelRef} type="button" className="primary" onClick={onCancel}>回去保存</button></div>
        </div>
      </section>
    </div>
  );
}

type Mode = "idle" | "set" | "upgrade" | "change" | "remove" | "recovery";
export type LockChange = (mode: LockMode, key: string | null) => void;

// The 「账号页密码」 row in Settings → 数据 → 安全. A password now also encrypts the 账号 data, and comes with a recovery code.
// onCodeShowing: told whenever a recovery code appears on screen or goes away, so 设置 can ask before closing over it.
export function AccountLockSettings({ mode: lockNow, deviceKey, onChanged, onCodeShowing }: { mode: LockMode; deviceKey: string; onChanged: LockChange; onCodeShowing?: (showing: boolean) => void }) {
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
  const showingRef = useRef(onCodeShowing);
  useEffect(() => { showingRef.current = onCodeShowing; });
  useEffect(() => { showingRef.current?.(code !== ""); }, [code]);
  useEffect(() => () => showingRef.current?.(false), []);

  function open(to: Mode) { setEmail(getRecoveryEmail()); setMode(to); }
  function done() { markRecoveryCodeShown(); close(); }
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
          <RecoveryCodeBody code={code} saved={saved} onSaved={setSaved} />
        </div>
        <div className="settings-inline-actions">
          <CopyCodeButton code={code} />
          <button type="button" className="primary-button" disabled={!saved} onClick={done}>完成</button>
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
        {backup && <div className="settings-row"><div><strong>设密码前的备份</strong><small>{lockNow === "none" ? "留着没有用了，可以删除。" : "设密码前的数据副本，仍用旧方式加密（拿到电脑文件的人能打开它）。之后三次重新打开 Copyboxx、用密码打开账号页都正常，就会自动删除；也可以现在删除。"}</small></div>
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
        {(mode === "set" || mode === "upgrade") && <small>设置后，账号里的内容会用这个密码加密，并给你一个恢复码（只显示一次）。设置前的数据会先留一份备份，确认正常后自动删除。Mac 上旧的「其他」列表不在加密范围内。</small>}
        {mode === "remove" && lockNow === "encrypted" && <small>关闭后，账号数据会改回不用密码的加密方式。</small>}
        {error && <small className="account-lock-error" role="alert">{error}</small>}
      </div>
      <div className="settings-inline-actions"><button type="button" className="secondary-button" onClick={close}>取消</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "处理中…" : mode === "remove" ? "关闭密码" : mode === "recovery" ? "生成" : "保存"}</button></div>
    </form>
  );
}
