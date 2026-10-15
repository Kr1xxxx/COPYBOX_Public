"use client";

// Settings home → 账号与同步 → 登录同步 (D-064): sign in with an email code, then 话术 and 账号 follow the person to their
// other computers. Shown only where the server can be reached (cloud-client.ts); the preview uses a pretend server.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { maskEmail } from "./account-lock";
import { CloudError, MAX_DEVICES, clearSessionToken, cloudTransport, createCloudApi, deviceName, looksLikeEmail, normalizeEmail, readCloudAccount, readSessionToken, writeCloudAccount, writeSessionToken, type CloudAccount } from "./cloud-client";
import { DEMO_CODE } from "./cloud-demo";
import { describeCounts } from "./cloud-sync-core";
import { domainLibraryLine } from "./domain-library";
import { clearSyncBase, readSyncBase, syncOnce, writeSyncBase, type SyncSteps } from "./cloud-sync";
import { formatTaipeiDate } from "./clipbox-core";
import { VAULT_CHANGED_EVENT } from "./secret-items-store";

// Besides on start and right after changes, a sync every 10 minutes picks up what other computers changed.
const SYNC_EVERY_MS = 10 * 60 * 1000;
const AFTER_CHANGE_MS = 8000;
const RESEND_AFTER_S = 60;

export type CloudMergers = {
  snippets: SyncSteps["snippets"];
  // null while the 账号 page is locked.
  accounts: SyncSteps["accounts"];
};

export function useCloudSync({ ready, platform, mergers, changeSignal, onIncoming }: {
  ready: boolean;
  platform: string | undefined;
  mergers: CloudMergers;
  // Changes whenever something here was saved; a sync follows a few seconds later.
  changeSignal: unknown;
  onIncoming: (text: string) => void;
}) {
  const [transport] = useState(() => cloudTransport());
  const api = useRef(transport ? createCloudApi(transport) : null);
  const [account, setAccount] = useState<CloudAccount | null>(() => (transport ? readCloudAccount() : null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // After signing in here made the oldest computer sign out (more than MAX_DEVICES).
  const [notice, setNotice] = useState("");
  const tokenRef = useRef<string | null>(null);
  const mergersRef = useRef(mergers);
  const onIncomingRef = useRef(onIncoming);
  const running = useRef<Promise<void> | null>(null);
  const accountRef = useRef(account);
  useEffect(() => { mergersRef.current = mergers; onIncomingRef.current = onIncoming; accountRef.current = account; });

  const forget = useCallback(async () => {
    tokenRef.current = "";
    await clearSessionToken();
    writeCloudAccount(null);
    clearSyncBase();
    setAccount(null);
  }, []);

  const token = useCallback(async () => {
    if (tokenRef.current === null) tokenRef.current = await readSessionToken();
    return tokenRef.current;
  }, []);

  const sync = useCallback((manual: boolean): Promise<void> => {
    if (running.current) return running.current;
    const current = accountRef.current;
    if (!api.current || !current) return Promise.resolve();
    const round = (async () => {
      const session = await token();
      if (!session) { await forget(); setError("登录已过期，请重新登录"); return; }
      if (manual) setBusy(true);
      try {
        const result = await syncOnce({ api: api.current!, token: session, base: readSyncBase(current.email), snippets: mergersRef.current.snippets, accounts: mergersRef.current.accounts });
        writeSyncBase(current.email, result.base);
        const changed = result.counts.added + result.counts.updated + result.counts.removed > 0;
        const next: CloudAccount = { ...current, lastSyncAt: Date.now(), lastResult: describeCounts(result.counts) };
        writeCloudAccount(next);
        setAccount(next);
        setError("");
        if (changed && !manual) onIncomingRef.current(`已从其他电脑同步：${next.lastResult}`);
      } catch (failure) {
        if (failure instanceof CloudError && (failure.code === "signed_out" || failure.code === "replaced")) {
          await forget(); setError(failure.message); setNotice("");
          // Said out loud too: this computer stopped syncing because another one signed in.
          if (failure.code === "replaced" && !manual) onIncomingRef.current(failure.message);
          return;
        }
        // Automatic rounds stay quiet when offline; the next round tries again.
        if (manual || !(failure instanceof CloudError && failure.code === "network")) setError(failure instanceof Error ? failure.message : "同步没有成功，内容没有变化");
      } finally {
        if (manual) setBusy(false);
      }
    })();
    running.current = round.finally(() => { running.current = null; });
    return running.current;
  }, [forget, token]);

  // On start, then every 10 minutes while open.
  const signedIn = Boolean(account);
  useEffect(() => {
    if (!ready || !signedIn) return;
    void sync(false);
    const timer = window.setInterval(() => void sync(false), SYNC_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [ready, signedIn, sync]);

  // A few seconds after the last change here: a 话术 saved (changeSignal) or a 账号 entry saved.
  const [accountRev, setAccountRev] = useState(0);
  useEffect(() => {
    if (!signedIn) return;
    const bump = () => setAccountRev((value) => value + 1);
    window.addEventListener(VAULT_CHANGED_EVENT, bump);
    return () => window.removeEventListener(VAULT_CHANGED_EVENT, bump);
  }, [signedIn]);
  const firstSignal = useRef(true);
  useEffect(() => {
    if (firstSignal.current) { firstSignal.current = false; return; }
    if (!ready || !signedIn) return;
    const timer = window.setTimeout(() => void sync(false), AFTER_CHANGE_MS);
    return () => window.clearTimeout(timer);
  }, [changeSignal, accountRev, ready, signedIn, sync]);

  async function sendCode(email: string) {
    if (!api.current) return;
    await api.current.sendCode(email);
  }

  async function signIn(email: string, code: string) {
    if (!api.current) return;
    const result = await api.current.verify(email, code, deviceName(platform));
    await writeSessionToken(result.token);
    tokenRef.current = result.token;
    clearSyncBase();
    const next: CloudAccount = { email: normalizeEmail(result.email) };
    writeCloudAccount(next);
    accountRef.current = next;
    setAccount(next);
    setError("");
    setNotice(signedOutNotice(result.signedOut));
    await sync(true);
  }

  // The company 话术 bound to this email's domain (domain-library.ts); null when signed out here.
  async function getLibrary() {
    const session = await token();
    if (!api.current || !accountRef.current || !session) return null;
    return api.current.getLibrary(session);
  }

  async function signOut() {
    const session = await token();
    if (api.current && session) { try { await api.current.logout(session); } catch { /* signed out here either way */ } }
    await forget();
    setError("");
    setNotice("");
  }

  async function deleteAccount() {
    const session = await token();
    if (!api.current || !session) { await forget(); return; }
    await api.current.deleteAccount(session);
    await forget();
    setError("");
    setNotice("");
  }

  return { available: Boolean(transport), demo: Boolean(transport && typeof window !== "undefined" && window.clipboxDesktop?.cloudDemo), account, busy, error, notice, sendCode, signIn, syncNow: () => sync(true), getLibrary, signOut, deleteAccount };
}

export type CloudSync = ReturnType<typeof useCloudSync>;

function signedOutNotice(names: string[]) {
  if (!names.length) return "";
  const who = names.length === 1 ? `「${names[0]}」` : ` ${names.length} 台电脑`;
  return `已超过 ${MAX_DEVICES} 台，最早登录的${who}已自动退出登录`;
}

function errorText(failure: unknown) {
  return failure instanceof Error ? failure.message : "没有成功，请再试一次";
}

export function CloudAccountRows({ cloud, platform, accountsLocked, companyDomain = "" }: { cloud: CloudSync; platform: string | undefined; accountsLocked: boolean; companyDomain?: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [wait, setWait] = useState(0);
  const [working, setWorking] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  useEffect(() => { if (open && !sentTo) emailRef.current?.focus(); }, [open, sentTo]);
  useEffect(() => { if (sentTo) codeRef.current?.focus(); }, [sentTo]);

  if (!cloud.available) return null;

  function close() {
    setOpen(false); setSentTo(""); setCode(""); setFormError(""); setWait(0);
  }

  async function send() {
    if (!looksLikeEmail(email)) { setFormError("邮箱格式不对，请检查一下"); return; }
    setWorking(true); setFormError("");
    try {
      await cloud.sendCode(email);
      setSentTo(normalizeEmail(email));
      setCode("");
      setWait(RESEND_AFTER_S);
    } catch (failure) { setFormError(errorText(failure)); }
    setWorking(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (working) return;
    if (!sentTo) { await send(); return; }
    if (!/^\d{6}$/.test(code.trim())) { setFormError("验证码是 6 位数字"); return; }
    setWorking(true); setFormError("");
    try {
      await cloud.signIn(sentTo, code);
      close();
    } catch (failure) { setFormError(errorText(failure)); }
    setWorking(false);
  }

  const mac = platform === "darwin";
  const scope = mac ? "话术和账号会自动同步；账号里的密码、API 密钥和恢复码只存在这台 Mac 上" : "话术和账号（包括密码）会在你登录的电脑之间自动同步";
  const limit = `一个账号最多同时登录 ${MAX_DEVICES} 台电脑。`;

  if (!cloud.account) {
    return (
      <>
        {!open ? (
          <div className="settings-row"><div><strong>登录同步</strong><small>用邮箱验证码登录，换电脑也能用自己的话术和账号</small></div>
            <button type="button" className="secondary-button" onClick={() => setOpen(true)}>登录…</button></div>
        ) : (
          <form className="settings-row cloud-login" onSubmit={(event) => void submit(event)} noValidate>
            <div>
              <label htmlFor="cloud-email"><strong>邮箱</strong></label>
              <input ref={emailRef} id="cloud-email" type="email" autoComplete="email" spellCheck={false} placeholder="填你的工作邮箱" value={email} disabled={Boolean(sentTo)}
                onChange={(event) => { setEmail(event.target.value); setFormError(""); }} />
              {sentTo && <>
                <label htmlFor="cloud-code"><strong>验证码</strong></label>
                <input ref={codeRef} id="cloud-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6 位数字" value={code}
                  onChange={(event) => { setCode(event.target.value.replace(/\D/g, "")); setFormError(""); }} />
                <small>验证码已发到 {maskEmail(sentTo)}，10 分钟内有效 · {wait > 0 ? `${wait} 秒后可重新发送` : <button type="button" className="cloud-resend" onClick={() => void send()}>重新发送</button>}</small>
              </>}
            </div>
            <div className="settings-inline-actions">
              <button type="button" className="secondary-button" onClick={close} disabled={working}>取消</button>
              <button type="submit" className="secondary-button" disabled={working}>{working ? (sentTo ? "登录中…" : "发送中…") : sentTo ? "登录" : "发送验证码"}</button>
            </div>
          </form>
        )}
        {open && cloud.demo && <p className="settings-note">测试版不会真的发邮件，验证码填 {DEMO_CODE}</p>}
        {(formError || (!open && cloud.error)) && <p className="settings-note shared-error" role="alert">{formError || cloud.error}</p>}
      </>
    );
  }

  const last = cloud.account.lastSyncAt ? `最后同步 ${formatTaipeiDate(cloud.account.lastSyncAt, true)}` : "还没有同步过";
  return (
    <>
      <div className="settings-row"><div><strong>已登录</strong><small><span className="cloud-email">{cloud.account.email}</span> · <span className="cloud-last-sync">{last}</span></small></div>
        <div className="settings-inline-actions">
          <button type="button" className="secondary-button" disabled={cloud.busy} onClick={() => void cloud.syncNow()}>{cloud.busy ? "同步中…" : "立即同步"}</button>
          <button type="button" className="secondary-button" onClick={() => void cloud.signOut()}>退出登录</button>
        </div></div>
      {companyDomain && <p className="settings-note cloud-domain-library">{domainLibraryLine(companyDomain)}</p>}
      <p className="settings-note">{scope}。{limit}{accountsLocked ? "账号页上了锁，打开账号页解锁后才会同步账号。" : ""}退出登录后，这台电脑上的内容不变。</p>
      {cloud.notice && <p className="settings-note cloud-notice" role="status">{cloud.notice}</p>}
      {cloud.error && <p className="settings-note shared-error" role="alert">{cloud.error}</p>}
      {!cloud.error && cloud.account.lastResult && <p className="settings-note cloud-result" role="status">上次同步：{cloud.account.lastResult}</p>}
      <div className="settings-row"><div><strong>注销账号</strong><small>删除云端保存的全部内容，每台电脑上已有的内容不变</small></div>
        <button type="button" className="secondary-button danger-text" onClick={() => setConfirmDelete(true)}>注销…</button></div>
      {confirmDelete && <DeleteCloudAccount email={cloud.account.email} onClose={() => setConfirmDelete(false)} onConfirm={cloud.deleteAccount} />}
    </>
  );
}

// The same small card as 删除确认.
function DeleteCloudAccount({ email, onClose, onConfirm }: { email: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) { event.preventDefault(); event.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [busy, onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try { await onConfirm(); onClose(); } catch (failure) { setError(errorText(failure)); setBusy(false); }
  }

  return (
    <div className="delete-confirm-backdrop">
      <section className="delete-confirm-dialog permanent" data-local-esc="" role="alertdialog" aria-modal="true" aria-labelledby="cloud-delete-title" aria-describedby="cloud-delete-text">
        <header><h2 id="cloud-delete-title">注销账号？</h2><p id="cloud-delete-text">云端保存的话术和账号会全部删除，无法恢复。每台电脑上已有的内容不受影响。</p></header>
        <form onSubmit={(event) => void submit(event)}>
          <div className="delete-confirm-item"><strong>{email}</strong><small>登录同步</small></div>
          {error && <p className="delete-confirm-error" role="alert">{error}</p>}
          <div className="delete-confirm-actions"><button ref={cancelRef} type="button" onClick={onClose} disabled={busy}>取消</button><button className="danger" disabled={busy}>{busy ? "正在处理…" : "注销"}</button></div>
        </form>
      </section>
    </div>
  );
}

