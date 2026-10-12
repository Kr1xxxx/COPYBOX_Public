"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ACCOUNT_LOCK_MIN, checkNewPassword, removeAccountLock, setAccountLock, verifyAccountLock } from "./account-lock";
import { VaultMark } from "./ui-atoms";

// Shown instead of the 账号 page while a password is set and has not been entered yet.
export function AccountLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function close() { setMode("idle"); setCurrent(""); setNext(""); setAgain(""); setError(""); }

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
      await setAccountLock(next);
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
      <div className="settings-row"><div><strong>账号页密码</strong><small>{isSet ? "已设置：打开账号页要先输入密码。忘记了无法找回，请记牢" : `未设置：设置后，打开账号页要先输入密码（至少 ${ACCOUNT_LOCK_MIN} 位）`}</small></div>
        {isSet
          ? <div className="settings-inline-actions"><button type="button" className="secondary-button" onClick={() => setMode("change")}>修改…</button><button type="button" className="secondary-button" onClick={() => setMode("remove")}>关闭…</button></div>
          : <button type="button" className="secondary-button" onClick={() => setMode("set")}>设置…</button>}
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
        </>}
        {mode === "set" && <small>忘记密码无法找回，请记牢。密码只决定能不能打开账号页，里面的内容本来就是加密保存的。</small>}
        {error && <small className="account-lock-error" role="alert">{error}</small>}
      </div>
      <div className="settings-inline-actions"><button type="button" className="secondary-button" onClick={close}>取消</button><button type="submit" className="primary-button" disabled={busy}>{mode === "remove" ? "关闭密码" : "保存"}</button></div>
    </form>
  );
}
