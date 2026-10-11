"use client";

import { useEffect, useRef, useState } from "react";
import { copyTextWithExpiry } from "./clipboard";
import { cleanApiKey, expiryState, hasInnerSpace, isValidDay, lastFour } from "./apikey-core";
import type { ApiKeyItem } from "./payment-core";
import { openSecretItemsStore, type SecretItemsStore } from "./secret-items-store";
import { SiteBadge } from "./site-badge";
import { detectSite, isPlausibleUrl, normalizeUrl, siteFromApiKey } from "./site-core";
import { Icon } from "./ui-atoms";

type Draft = { id: string | null; name: string; service: string; key: string; secret: string; endpoint: string; expires: string };
const EMPTY: Draft = { id: null, name: "", service: "", key: "", secret: "", endpoint: "", expires: "" };

function whenText(at: number) {
  return new Date(at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function siteOf(item: Pick<ApiKeyItem, "key" | "endpoint" | "service" | "name">) {
  return detectSite({ apiKey: item.key, url: item.endpoint, name: item.service || item.name });
}

// API 密钥 in the hidden 保险箱. Key and Secret are hidden until the eye button is held; the service is guessed from the key's prefix.
export function ApiKeyPanel({ deviceKey, onToast, focusId }: { deviceKey: string; onToast: (message: string) => void; focusId?: string }) {
  const storeRef = useRef<SecretItemsStore | null>(null);
  const [items, setItems] = useState<ApiKeyItem[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [openId, setOpenId] = useState(focusId ?? "");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteId, setDeleteId] = useState("");
  const [shown, setShown] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const [now] = useState(() => Date.now());
  const timers = useRef<{ copied?: ReturnType<typeof setTimeout>; shown?: ReturnType<typeof setTimeout> }>({});
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    const store = openSecretItemsStore(deviceKey);
    storeRef.current = store;
    store.list().then((list) => { if (live) setItems(list.filter((entry): entry is ApiKeyItem => entry.type === "apikey")); }).catch((error: Error) => { if (live) setLoadError(error.message); });
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
    setShown(id);
    clearTimeout(timers.current.shown);
    timers.current.shown = setTimeout(() => setShown(""), 5000);
  }

  function setField<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((current) => current && { ...current, [field]: value });
    setErrors((current) => (current[field] ? { ...current, [field]: "" } : current));
  }

  async function save() {
    const store = storeRef.current;
    if (!draft || !store) return;
    const key = cleanApiKey(draft.key);
    const secret = cleanApiKey(draft.secret);
    const found: Record<string, string> = {};
    if (!draft.name.trim()) found.name = "请填写名称";
    if (!key) found.key = "请填写密钥";
    else if (hasInnerSpace(key)) found.key = "密钥中间不能有空格，请检查有没有多复制了别的内容";
    if (secret && hasInnerSpace(secret)) found.secret = "Secret 中间不能有空格";
    if (draft.endpoint.trim() && !isPlausibleUrl(draft.endpoint)) found.endpoint = "接口地址格式不对";
    if (draft.expires && !isValidDay(draft.expires)) found.expires = "日期格式应是 年-月-日";
    if (Object.keys(found).length > 0) { setErrors(found); return; }
    const at = Date.now();
    const existing = items?.find((entry) => entry.id === draft.id);
    const item: ApiKeyItem = {
      id: draft.id ?? crypto.randomUUID(), type: "apikey", name: Array.from(draft.name.trim().replace(/\s+/g, " ")).slice(0, 40).join(""),
      service: draft.service.trim() || siteFromApiKey(key)?.name || "", key, secret,
      endpoint: draft.endpoint.trim() ? normalizeUrl(draft.endpoint) : "", expires: draft.expires, createdAt: existing?.createdAt ?? at, updatedAt: at,
    };
    try {
      setItems((await store.put(item)).filter((entry): entry is ApiKeyItem => entry.type === "apikey"));
      setOpenId(item.id);
      setDraft(null);
    } catch (error) {
      setErrors({ name: error instanceof Error ? error.message : "保存失败，请重试" });
    }
  }

  async function remove(id: string) {
    try {
      setItems((await storeRef.current!.remove(id)).filter((entry): entry is ApiKeyItem => entry.type === "apikey"));
      setDeleteId("");
      setOpenId("");
    } catch {
      onToast("删除失败，请重试");
    }
  }

  if (loadError) return <p className="settings-note" role="alert">{loadError}</p>;
  if (items === null) return <p className="settings-note">正在读取…</p>;

  if (draft) {
    const guess = siteFromApiKey(draft.key)?.name;
    return (
      <form className="totp-form pay-form" onSubmit={(event) => { event.preventDefault(); void save(); }} noValidate>
        <label>名称<input ref={nameRef} value={draft.name} maxLength={40} autoComplete="off" placeholder="例如：客服 AI 接口" onChange={(event) => setField("name", event.target.value)} />
          {errors.name && <span className="totp-error" role="alert">{errors.name}</span>}</label>
        <label>密钥<input aria-label="密钥" value={draft.key} autoComplete="off" spellCheck={false} onChange={(event) => setField("key", event.target.value)} />
          {errors.key && <span className="totp-error" role="alert">{errors.key}</span>}
          {guess && <span className="pay-hint">看起来是 {guess} 的密钥</span>}</label>
        <label>服务（可不填，自动识别）<input value={draft.service} autoComplete="off" placeholder={guess ?? "例如：OpenAI"} onChange={(event) => setField("service", event.target.value)} /></label>
        <label>Secret（可不填，成对的第二段）<input aria-label="Secret" value={draft.secret} autoComplete="off" spellCheck={false} onChange={(event) => setField("secret", event.target.value)} />
          {errors.secret && <span className="totp-error" role="alert">{errors.secret}</span>}</label>
        <label>接口地址（可不填）<input value={draft.endpoint} autoComplete="off" spellCheck={false} placeholder="api.example.com" onChange={(event) => setField("endpoint", event.target.value)} />
          {errors.endpoint && <span className="totp-error" role="alert">{errors.endpoint}</span>}</label>
        <label>到期日（可不填）<input type="date" value={draft.expires} onChange={(event) => setField("expires", event.target.value)} />
          {errors.expires && <span className="totp-error" role="alert">{errors.expires}</span>}</label>
        <div className="settings-inline-actions">
          <button type="button" className="secondary-button" onClick={() => setDraft(null)}>取消</button>
          <button type="submit" className="primary-button">保存</button>
        </div>
      </form>
    );
  }

  return (
    <>
      {items.length === 0 && <p className="totp-empty">还没有 API 密钥。点下面的「添加 API 密钥」，粘贴后会按开头自动识别是哪个服务的。</p>}
      {items.length > 0 && (
        <ul className="totp-list pay-list">
          {items.map((item) => {
            const open = openId === item.id;
            const expiry = expiryState(item.expires, now);
            const fields: { id: string; label: string; value: string; secret: boolean }[] = [
              { id: "k", label: "密钥", value: item.key, secret: true },
              ...(item.secret ? [{ id: "s", label: "Secret", value: item.secret, secret: true }] : []),
            ];
            return (
              <li key={item.id} className={`pay-item${open ? " open" : ""}`}>
                <button type="button" className="pay-head" aria-expanded={open} onClick={() => { setOpenId(open ? "" : item.id); setDeleteId(""); setShown(""); }}>
                  <SiteBadge site={siteOf(item)} />
                  <span className="totp-who"><strong>{item.name}</strong><small>{item.service ? `${item.service} · ` : ""}尾号 {lastFour(item.key)}</small></span>
                  {expiry.kind === "soon" || expiry.kind === "expired" ? <span className={`apikey-expiry ${expiry.kind}`}>{expiry.text}</span> : null}
                  <Icon name="chevron" className="pay-chevron" />
                </button>
                {open && (
                  <div className="pay-body">
                    <dl className="pay-fields">
                      {fields.map((field) => {
                        const id = `${item.id}:${field.id}`;
                        return (
                          <div key={field.id} className="pay-field">
                            <dt>{field.label}</dt>
                            <dd className="login-pass">{shown === id ? field.value : `••••••••${lastFour(field.value)}`}</dd>
                            <span className="login-pass-actions">
                              <button type="button" className="icon-button pay-copy" aria-label={`显示${field.label}`} title="按住显示"
                                onPointerDown={() => reveal(id)} onPointerUp={() => setShown("")} onPointerLeave={() => setShown("")} onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") reveal(id); }} onKeyUp={() => setShown("")}><Icon name="eye" /></button>
                              <button type="button" className={`icon-button pay-copy${copiedKey === id ? " copied" : ""}`} onClick={() => void copy(id, field.value)} aria-label={`复制${field.label}`} title="复制"><Icon name={copiedKey === id ? "check" : "copy"} /></button>
                            </span>
                          </div>
                        );
                      })}
                      {item.endpoint && <div className="pay-field"><dt>接口地址</dt><dd>{item.endpoint.replace(/^https?:\/\//, "")}</dd>
                        <button type="button" className={`icon-button pay-copy${copiedKey === `${item.id}:e` ? " copied" : ""}`} onClick={() => void copy(`${item.id}:e`, item.endpoint)} aria-label="复制接口地址" title="复制"><Icon name={copiedKey === `${item.id}:e` ? "check" : "copy"} /></button></div>}
                      {item.expires && <div className="pay-field"><dt>到期</dt><dd className={expiry.kind === "ok" ? "" : `apikey-expiry-text ${expiry.kind}`}>{expiry.text}</dd><span /></div>}
                    </dl>
                    <p className="pay-meta">上次修改 {whenText(item.updatedAt)}</p>
                    <div className="pay-actions">
                      <button type="button" className="secondary-button" onClick={() => { setDraft({ id: item.id, name: item.name, service: item.service, key: item.key, secret: item.secret, endpoint: item.endpoint, expires: item.expires }); setErrors({}); }}>修改</button>
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
        <button type="button" className="primary-button" onClick={() => { setDraft({ ...EMPTY }); setErrors({}); }}><Icon name="plus" />添加 API 密钥</button>
      </div>
    </>
  );
}
