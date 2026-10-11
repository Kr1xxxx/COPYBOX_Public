"use client";

import { useEffect, useRef, useState } from "react";
import { copyTextWithExpiry } from "./clipboard";
import type { LoginItem } from "./payment-core";
import { generatePassword, hasEdgeSpace } from "./password-core";
import { openSecretItemsStore, type SecretItemsStore } from "./secret-items-store";
import { SiteBadge } from "./site-badge";
import { useSiteIconScan } from "./site-icons-context";
import { detectSite, isPlausibleUrl, normalizeUrl } from "./site-core";
import { accountTitle, generateTotp, formatCode, type TotpAccount } from "./totp-core";
import { openTotpStore } from "./totp-store";
import { Icon } from "./ui-atoms";

type Draft = { id: string | null; name: string; url: string; username: string; password: string; totpId: string; note: string };
const EMPTY: Draft = { id: null, name: "", url: "", username: "", password: "", totpId: "", note: "" };

function whenText(at: number) {
  return new Date(at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

// The linked 验证码 shows its current code next to the login (read from the old, untouched 验证码 store).
function LinkedCode({ account, onCopy }: { account: TotpAccount; onCopy: (code: string) => void }) {
  const [code, setCode] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const step = Math.floor(now / 1000 / account.period);
  useEffect(() => {
    let live = true;
    void generateTotp(account, step * account.period * 1000).then((value) => { if (live) setCode(value); });
    return () => { live = false; };
  }, [account, step]);
  return (
    <div className="pay-field">
      <dt>验证码</dt>
      <dd className="login-code">{code ? formatCode(code) : "······"}<small>{accountTitle(account)}</small></dd>
      <button type="button" className="icon-button pay-copy" onClick={() => code && onCopy(code)} aria-label="复制验证码" title="复制"><Icon name="copy" /></button>
    </div>
  );
}

// 账号密码 in the hidden 保险箱. The password is hidden until the eye button is held; each field copies on its own.
export function LoginPanel({ deviceKey, onToast, focusId }: { deviceKey: string; onToast: (message: string) => void; focusId?: string }) {
  const storeRef = useRef<SecretItemsStore | null>(null);
  const scanSiteIcons = useSiteIconScan();
  const [items, setItems] = useState<LoginItem[] | null>(null);
  const [totps, setTotps] = useState<TotpAccount[]>([]);
  const [loadError, setLoadError] = useState("");
  const [openId, setOpenId] = useState(focusId ?? "");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmSave, setConfirmSave] = useState(false);
  const [deleteId, setDeleteId] = useState("");
  const [shownId, setShownId] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const timers = useRef<{ copied?: ReturnType<typeof setTimeout>; shown?: ReturnType<typeof setTimeout> }>({});
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    const store = openSecretItemsStore(deviceKey);
    storeRef.current = store;
    store.list().then((list) => { if (live) setItems(list.filter((entry): entry is LoginItem => entry.type === "login")); }).catch((error: Error) => { if (live) setLoadError(error.message); });
    openTotpStore(deviceKey).list().then((list) => { if (live) setTotps(list); }).catch(() => undefined);
    return () => { live = false; };
  }, [deviceKey]);
  useEffect(() => () => { clearTimeout(timers.current.copied); clearTimeout(timers.current.shown); }, []);
  useEffect(() => { if (draft && !draft.id) nameRef.current?.focus(); }, [draft?.id, draft === null]); // eslint-disable-line react-hooks/exhaustive-deps

  async function copy(key: string, text: string) {
    try {
      await copyTextWithExpiry(text);
      setCopiedKey(key);
      clearTimeout(timers.current.copied);
      timers.current.copied = setTimeout(() => setCopiedKey(""), 1600);
      onToast("已复制");
    } catch {
      onToast("复制失败，请重试");
    }
  }

  function reveal(id: string) {
    setShownId(id);
    clearTimeout(timers.current.shown);
    timers.current.shown = setTimeout(() => setShownId(""), 5000);
  }

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => current && { ...current, [key]: value });
    setErrors((current) => (current[key] ? { ...current, [key]: "" } : current));
    setConfirmSave(false);
  }

  function validate(value: Draft) {
    const found: Record<string, string> = {};
    if (!value.name.trim()) found.name = "请填写名称";
    if (value.url.trim() && !isPlausibleUrl(value.url)) found.url = "网址格式不对";
    if (!value.username.trim()) found.username = "请填写用户名或邮箱";
    if (!value.password) found.password = "请填写密码";
    return found;
  }

  async function save() {
    const store = storeRef.current;
    if (!draft || !store) return;
    const found = validate(draft);
    if (Object.keys(found).length > 0) { setErrors(found); return; }
    const now = Date.now();
    const existing = items?.find((entry) => entry.id === draft.id);
    const item: LoginItem = {
      id: draft.id ?? crypto.randomUUID(), type: "login", name: Array.from(draft.name.trim().replace(/\s+/g, " ")).slice(0, 40).join(""),
      url: draft.url.trim() ? normalizeUrl(draft.url) : "", username: draft.username.trim(), password: draft.password,
      ...(draft.totpId ? { totpId: draft.totpId } : {}), note: draft.note.trim(), createdAt: existing?.createdAt ?? now, updatedAt: now,
    };
    try {
      const list = await store.put(item);
      setItems(list.filter((entry): entry is LoginItem => entry.type === "login"));
      setOpenId(item.id);
      setDraft(null);
      scanSiteIcons();
    } catch (error) {
      setErrors({ name: error instanceof Error ? error.message : "保存失败，请重试" });
    }
  }

  async function remove(id: string) {
    try {
      setItems((await storeRef.current!.remove(id)).filter((entry): entry is LoginItem => entry.type === "login"));
      setDeleteId("");
      setOpenId("");
    } catch {
      onToast("删除失败，请重试");
    }
  }

  if (loadError) return <p className="settings-note" role="alert">{loadError}</p>;
  if (items === null) return <p className="settings-note">正在读取…</p>;

  if (draft) {
    const sharedWith = draft.password ? items.filter((entry) => entry.id !== draft.id && entry.password === draft.password).map((entry) => entry.name) : [];
    return (
      <form className="totp-form pay-form" onSubmit={(event) => { event.preventDefault(); void save(); }} noValidate>
        <label>名称<input ref={nameRef} value={draft.name} maxLength={40} autoComplete="off" placeholder="例如：Shopify 后台" onChange={(event) => setField("name", event.target.value)} />
          {errors.name && <span className="totp-error" role="alert">{errors.name}</span>}</label>
        <label>网址（可不填）<input value={draft.url} autoComplete="off" spellCheck={false} placeholder="shopify.com" onChange={(event) => setField("url", event.target.value)} />
          {errors.url && <span className="totp-error" role="alert">{errors.url}</span>}</label>
        <label>用户名 / 邮箱<input value={draft.username} autoComplete="off" spellCheck={false} onChange={(event) => setField("username", event.target.value)} />
          {errors.username && <span className="totp-error" role="alert">{errors.username}</span>}</label>
        <label>密码
          <span className="login-pass-row">
            <input aria-label="密码" value={draft.password} autoComplete="off" spellCheck={false} onChange={(event) => setField("password", event.target.value)} />
            <button type="button" className="secondary-button" onClick={() => setField("password", generatePassword(16))}>生成密码</button>
          </span>
          {errors.password && <span className="totp-error" role="alert">{errors.password}</span>}
          {hasEdgeSpace(draft.password) && <span className="pay-warn">密码开头或结尾有空格，确认是对的吗？</span>}
          {sharedWith.length > 0 && <span className="pay-warn">这个密码和「{sharedWith[0]}」{sharedWith.length > 1 ? `等 ${sharedWith.length} 个账号` : ""}一样，建议换一个。</span>}
        </label>
        {totps.length > 0 && <label>关联验证码（可不选）
          <select value={draft.totpId} onChange={(event) => setField("totpId", event.target.value)}>
            <option value="">不关联</option>
            {totps.map((account) => <option key={account.id} value={account.id}>{accountTitle(account)}{account.name && account.issuer ? ` · ${account.name}` : ""}</option>)}
          </select></label>}
        <label>备注（可不填）<textarea rows={2} value={draft.note} onChange={(event) => setField("note", event.target.value)} /></label>
        {confirmSave && <p className="pay-confirm" role="alert">确认要修改这个账号吗？</p>}
        <div className="settings-inline-actions">
          <button type="button" className="secondary-button" onClick={() => { setDraft(null); setConfirmSave(false); }}>取消</button>
          <button type="submit" className="primary-button">保存</button>
        </div>
      </form>
    );
  }

  return (
    <>
      {items.length === 0 && <p className="totp-empty">还没有账号。点下面的「添加账号密码」，记下网站的用户名和密码。</p>}
      {items.length > 0 && (
        <ul className="totp-list pay-list">
          {items.map((item) => {
            const open = openId === item.id;
            const site = detectSite({ url: item.url, name: item.name });
            const linked = item.totpId ? totps.find((account) => account.id === item.totpId) : undefined;
            const shown = shownId === item.id;
            return (
              <li key={item.id} className={`pay-item${open ? " open" : ""}`}>
                <button type="button" className="pay-head" aria-expanded={open} onClick={() => { setOpenId(open ? "" : item.id); setDeleteId(""); setShownId(""); }}>
                  <SiteBadge site={site} />
                  <span className="totp-who"><strong>{item.name}</strong><small>{item.username}</small></span>
                  <Icon name="chevron" className="pay-chevron" />
                </button>
                {open && (
                  <div className="pay-body">
                    <dl className="pay-fields">
                      {item.url && <div className="pay-field"><dt>网址</dt><dd><a href={item.url} target="_blank" rel="noreferrer noopener">{item.url.replace(/^https?:\/\//, "")}</a></dd><span /></div>}
                      <div className="pay-field"><dt>用户名</dt><dd>{item.username}</dd>
                        <button type="button" className={`icon-button pay-copy${copiedKey === `${item.id}:u` ? " copied" : ""}`} onClick={() => void copy(`${item.id}:u`, item.username)} aria-label="复制用户名" title="复制"><Icon name={copiedKey === `${item.id}:u` ? "check" : "copy"} /></button></div>
                      <div className="pay-field"><dt>密码</dt><dd className="login-pass">{shown ? item.password : "••••••••••"}</dd>
                        <span className="login-pass-actions">
                          <button type="button" className="icon-button pay-copy" aria-label="显示密码" title="按住显示"
                            onPointerDown={() => reveal(item.id)} onPointerUp={() => setShownId("")} onPointerLeave={() => setShownId("")} onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") reveal(item.id); }} onKeyUp={() => setShownId("")}><Icon name="eye" /></button>
                          <button type="button" className={`icon-button pay-copy${copiedKey === `${item.id}:p` ? " copied" : ""}`} onClick={() => void copy(`${item.id}:p`, item.password)} aria-label="复制密码" title="复制"><Icon name={copiedKey === `${item.id}:p` ? "check" : "copy"} /></button>
                        </span></div>
                      {linked && <LinkedCode account={linked} onCopy={(code) => void copy(`${item.id}:t`, code)} />}
                      {item.note && <div className="pay-field"><dt>备注</dt><dd>{item.note}</dd><span /></div>}
                    </dl>
                    <p className="pay-meta">上次修改 {whenText(item.updatedAt)}</p>
                    <div className="pay-actions">
                      <button type="button" className="secondary-button" onClick={() => { setDraft({ id: item.id, name: item.name, url: item.url, username: item.username, password: item.password, totpId: item.totpId ?? "", note: item.note }); setErrors({}); setConfirmSave(false); }}>修改</button>
                      {deleteId === item.id
                        ? <span className="settings-inline-actions"><button type="button" className="secondary-button" onClick={() => setDeleteId("")}>取消</button><button type="button" className="secondary-button danger-text" onClick={() => void remove(item.id)}>确认删除</button></span>
                        : <button type="button" className="secondary-button" onClick={() => setDeleteId(item.id)}>删除</button>}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="totp-actions">
        <button type="button" className="primary-button" onClick={() => { setDraft({ ...EMPTY }); setErrors({}); setConfirmSave(false); }}><Icon name="plus" />添加账号密码</button>
      </div>
    </>
  );
}
