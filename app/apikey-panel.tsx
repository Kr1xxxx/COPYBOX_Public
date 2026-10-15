"use client";

import { useEffect, useRef, useState } from "react";
import { copyTextWithExpiry } from "./clipboard";
import { API_FIELD_LABEL_MAX, API_FIELD_MAX, API_FIELD_SUGGESTIONS, API_NOTE_MAX, apiKeyHint, apiSecretFields, checkApiFields, expiryState, isValidDay, lastFour, nextFieldLabel, storedApiFields, type ApiField, type ApiFieldErrors } from "./apikey-core";
import { formatApiKeyReference } from "./apikey-automation";
import type { EntryKind } from "./account-view";
import { revertToNote } from "./note-core";
import { NoteMarkdown } from "./note-markdown";
import { PLAIN_NOTES } from "./platform";
import type { ApiKeyItem } from "./payment-core";
import { openSecretItemsStore, type SecretItemsStore } from "./secret-items-store";
import { SiteBadge } from "./site-badge";
import { detectSite, isPlausibleUrl, normalizeUrl, siteFromApiKey } from "./site-core";
import { RevealButtons, useReveal } from "./reveal-buttons";
import { Icon } from "./ui-atoms";

type Draft = { id: string | null; name: string; service: string; fields: ApiField[]; note: string; endpoint: string; expires: string };
const newField = (label: string): ApiField => ({ id: crypto.randomUUID(), label, value: "" });
const emptyDraft = (): Draft => ({ id: null, name: "", service: "", fields: [newField("密钥")], note: "", endpoint: "", expires: "" });

function whenText(at: number) {
  return new Date(at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function siteOf(item: Pick<ApiKeyItem, "key" | "endpoint" | "service" | "name">) {
  return detectSite({ apiKey: item.key, url: item.endpoint, name: item.service || item.name });
}

// API 密钥 on the 账号 page. An entry holds several hidden fields (Key, Secret, Client ID…) and a 备注; each field stays hidden
// until 按住显示 / 显示. The service is guessed from the first field's prefix.
export function ApiKeyPanel({ deviceKey, onToast, focusId, startAdding, onShowEntry }: { deviceKey: string; onToast: (message: string) => void; focusId?: string; startAdding?: boolean; onShowEntry?: (tab: EntryKind, id: string) => void }) {
  const storeRef = useRef<SecretItemsStore | null>(null);
  const [items, setItems] = useState<ApiKeyItem[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [openId, setOpenId] = useState(focusId ?? "");
  const [draft, setDraft] = useState<Draft | null>(startAdding ? emptyDraft() : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<ApiFieldErrors>({});
  const [deleteId, setDeleteId] = useState("");
  const [revertId, setRevertId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const reveal = useReveal();
  const [copiedKey, setCopiedKey] = useState("");
  const [now] = useState(() => Date.now());
  const timers = useRef<{ copied?: ReturnType<typeof setTimeout> }>({});
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    const store = openSecretItemsStore(deviceKey);
    storeRef.current = store;
    store.list().then((list) => { if (live) setItems(list.filter((entry): entry is ApiKeyItem => entry.type === "apikey" && !entry.trashedAt)); }).catch((error: Error) => { if (live) setLoadError(error.message); });
    return () => { live = false; };
  }, [deviceKey]);
  useEffect(() => () => { clearTimeout(timers.current.copied); }, []);
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

  function setField<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((current) => current && { ...current, [field]: value });
    setErrors((current) => (current[field] ? { ...current, [field]: "" } : current));
  }

  function setFields(change: (fields: ApiField[]) => ApiField[]) {
    setDraft((current) => current && { ...current, fields: change(current.fields) });
  }

  function editField(id: string, part: "label" | "value", value: string) {
    setFields((fields) => fields.map((field) => (field.id === id ? { ...field, [part]: value } : field)));
    setFieldErrors((current) => (current[id]?.[part] ? { ...current, [id]: { ...current[id], [part]: undefined } } : current));
  }

  async function save() {
    const store = storeRef.current;
    if (!draft || !store) return;
    const checked = checkApiFields(draft.fields);
    const found: Record<string, string> = {};
    if (!draft.name.trim()) found.name = "请填写名称";
    if (draft.endpoint.trim() && !isPlausibleUrl(draft.endpoint)) found.endpoint = "接口地址格式不对";
    if (draft.expires && !isValidDay(draft.expires)) found.expires = "日期格式应是 年-月-日";
    if (Object.keys(found).length > 0 || Object.keys(checked.errors).length > 0) { setErrors(found); setFieldErrors(checked.errors); return; }
    const stored = storedApiFields(checked.fields);
    const note = draft.note.trim() ? draft.note.replace(/\s+$/, "").slice(0, API_NOTE_MAX) : "";
    const at = Date.now();
    const existing = items?.find((entry) => entry.id === draft.id);
    const item: ApiKeyItem = {
      ...existing,
      id: draft.id ?? crypto.randomUUID(), type: "apikey", name: Array.from(draft.name.trim().replace(/\s+/g, " ")).slice(0, 40).join(""),
      service: draft.service.trim() || siteFromApiKey(stored.key)?.name || "", ...stored, note,
      endpoint: draft.endpoint.trim() ? normalizeUrl(draft.endpoint) : "", expires: draft.expires, createdAt: existing?.createdAt ?? at, updatedAt: at,
    };
    try {
      setItems((await store.put(item)).filter((entry): entry is ApiKeyItem => entry.type === "apikey" && !entry.trashedAt));
      setOpenId(item.id);
      setDraft(null);
    } catch (error) {
      setErrors({ name: error instanceof Error ? error.message : "保存失败，请重试" });
    }
  }

  async function remove(id: string) {
    const found = items?.find((entry) => entry.id === id);
    if (!found) return;
    try {
      setItems((await storeRef.current!.put({ ...found, trashedAt: Date.now() })).filter((entry): entry is ApiKeyItem => entry.type === "apikey" && !entry.trashedAt));
      setDeleteId("");
      setOpenId("");
    } catch {
      onToast("删除失败，请重试");
    }
  }

  // 还原为笔记: the entry made by 「转为 API」 goes away and the note comes back exactly as it was.
  async function revert(item: ApiKeyItem) {
    if (!item.fromNote) return;
    const noteId = item.fromNote.id;
    try {
      const list = await storeRef.current!.update((current) => revertToNote(current, item.id));
      setItems(list.filter((entry): entry is ApiKeyItem => entry.type === "apikey" && !entry.trashedAt));
      setRevertId("");
      onToast("已还原为笔记");
      onShowEntry?.("note", noteId);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "还原失败，请重试");
    }
  }

  if (loadError) return <p className="settings-note" role="alert">{loadError}</p>;
  if (items === null) return <p className="settings-note">正在读取…</p>;

  if (draft) {
    const guess = siteFromApiKey(draft.fields[0]?.value ?? "")?.name;
    const listId = `apikey-labels-${draft.id ?? "new"}`;
    return (
      <form className="totp-form pay-form" onSubmit={(event) => { event.preventDefault(); void save(); }} noValidate>
        <label>名称<input ref={nameRef} value={draft.name} maxLength={40} autoComplete="off" placeholder="例如：客服 AI 接口" onChange={(event) => setField("name", event.target.value)} />
          {errors.name && <span className="totp-error" role="alert">{errors.name}</span>}</label>
        <fieldset className="apikey-fields">
          <legend>保密内容 <small>每一项都会隐藏，可以加多项</small></legend>
          <datalist id={listId}>{API_FIELD_SUGGESTIONS.map((label) => <option key={label} value={label} />)}</datalist>
          {draft.fields.map((field, index) => {
            const error = fieldErrors[field.id];
            return (
              <div key={field.id} className="apikey-field-row">
                <input className="apikey-field-label" aria-label={`第 ${index + 1} 项的名字`} value={field.label} list={listId} maxLength={API_FIELD_LABEL_MAX} autoComplete="off" placeholder="名字，如 Client ID" onChange={(event) => editField(field.id, "label", event.target.value)} />
                <input className="apikey-field-value" aria-label={field.label.trim() || `第 ${index + 1} 项的内容`} value={field.value} autoComplete="off" spellCheck={false} placeholder="粘贴内容" onChange={(event) => editField(field.id, "value", event.target.value)} />
                <button type="button" className="icon-button apikey-field-remove" aria-label={`删掉${field.label.trim() || `第 ${index + 1} 项`}`} title="删掉这一项" disabled={draft.fields.length <= 1}
                  onClick={() => setFields((fields) => fields.filter((entry) => entry.id !== field.id))}><Icon name="trash" /></button>
                {(error?.label || error?.value) && <span className="totp-error" role="alert">{error.label ?? error.value}</span>}
                {index === 0 && guess && <span className="pay-hint">看起来是 {guess} 的密钥</span>}
              </div>
            );
          })}
          {draft.fields.length < API_FIELD_MAX && <button type="button" className="secondary-button apikey-field-add" onClick={() => setFields((fields) => [...fields, newField(nextFieldLabel(fields))])}><Icon name="plus" />再加一项</button>}
        </fieldset>
        <label>服务（可不填，自动识别）<input value={draft.service} autoComplete="off" placeholder={guess ?? "例如：OpenAI"} onChange={(event) => setField("service", event.target.value)} /></label>
        <label>接口地址（可不填）<input value={draft.endpoint} autoComplete="off" spellCheck={false} placeholder="api.example.com" onChange={(event) => setField("endpoint", event.target.value)} />
          {errors.endpoint && <span className="totp-error" role="alert">{errors.endpoint}</span>}</label>
        <label>到期日（可不填）<input type="date" value={draft.expires} onChange={(event) => setField("expires", event.target.value)} />
          {errors.expires && <span className="totp-error" role="alert">{errors.expires}</span>}</label>
        <label>备注（可不填，不会隐藏）<textarea value={draft.note} maxLength={API_NOTE_MAX} rows={3} placeholder="例如：谁在用、额度、在哪个后台申请的" onChange={(event) => setField("note", event.target.value)} /></label>
        <div className="settings-inline-actions">
          <button type="button" className="secondary-button" onClick={() => setDraft(null)}>取消</button>
          <button type="submit" className="primary-button">保存</button>
        </div>
      </form>
    );
  }

  return (
    <>
      {items.length === 0 && <p className="totp-empty">还没有 API 密钥。点右上角「新增」，粘贴后会按开头自动识别是哪个服务的。</p>}
      {items.length > 0 && (
        <ul className="totp-list pay-list">
          {items.map((item) => {
            const open = openId === item.id;
            const expiry = expiryState(item.expires, now);
            const fields = apiSecretFields(item);
            return (
              <li key={item.id} className={`pay-item${open ? " open" : ""}`}>
                <button type="button" className="pay-head" aria-expanded={open} onClick={() => { setOpenId(open ? "" : item.id); setDeleteId(""); reveal.hide(); }}>
                  <SiteBadge site={siteOf(item)} />
                  <span className="totp-who"><strong>{item.name}</strong><small>{apiKeyHint(item)}</small></span>
                  {expiry.kind === "soon" || expiry.kind === "expired" ? <span className={`apikey-expiry ${expiry.kind}`}>{expiry.text}</span> : null}
                  <Icon name="chevron" className="pay-chevron" />
                </button>
                {open && (
                  <div className="pay-body">
                    <dl className="pay-fields">
                      {fields.map((field) => {
                        const id = `${item.id}:f:${field.id}`;
                        return (
                          <div key={field.id} className="pay-field">
                            <dt>{field.label}</dt>
                            <dd className="login-pass">{reveal.isShown(id) ? field.value : `••••••••${lastFour(field.value)}`}</dd>
                            <span className="login-pass-actions">
                              <RevealButtons reveal={reveal} id={id} label={field.label} />
                              <button type="button" className={`icon-button pay-copy${copiedKey === id ? " copied" : ""}`} onClick={() => void copy(id, field.value)} aria-label={`复制${field.label}`} title="复制"><Icon name={copiedKey === id ? "check" : "copy"} /></button>
                            </span>
                          </div>
                        );
                      })}
                      {item.endpoint && <div className="pay-field"><dt>接口地址</dt><dd>{item.endpoint.replace(/^https?:\/\//, "")}</dd>
                        <button type="button" className={`icon-button pay-copy${copiedKey === `${item.id}:e` ? " copied" : ""}`} onClick={() => void copy(`${item.id}:e`, item.endpoint)} aria-label="复制接口地址" title="复制"><Icon name={copiedKey === `${item.id}:e` ? "check" : "copy"} /></button></div>}
                      {item.note && <div className="pay-field apikey-note"><dt>备注</dt><dd>{item.note}</dd>
                        <button type="button" className={`icon-button pay-copy${copiedKey === `${item.id}:n` ? " copied" : ""}`} onClick={() => void copy(`${item.id}:n`, item.note ?? "")} aria-label="复制备注" title="复制"><Icon name={copiedKey === `${item.id}:n` ? "check" : "copy"} /></button></div>}
                      {item.expires && <div className="pay-field"><dt>到期</dt><dd className={expiry.kind === "ok" ? "" : `apikey-expiry-text ${expiry.kind}`}>{expiry.text}</dd><span /></div>}
                    </dl>
                    <p className="pay-meta">上次修改 {whenText(item.updatedAt)}{item.fromNote && <> · 由笔记「{item.fromNote.name}」转来</>}</p>
                    {item.fromNote && sourceId === item.id && <div className="note-source" aria-label="笔记原文"><NoteMarkdown source={item.fromNote.body} /></div>}
                    {revertId === item.id && <p className="pay-confirm" role="alert">还原后这条 API 会删除，笔记「{item.fromNote?.name}」按原样回来。这条 API 里后来改过的内容不会保留。</p>}
                    <div className="pay-actions">
                      <button type="button" className="secondary-button" onClick={() => { setDraft({ id: item.id, name: item.name, service: item.service, fields: apiSecretFields(item), note: item.note ?? "", endpoint: item.endpoint, expires: item.expires }); setErrors({}); setFieldErrors({}); }}>修改</button>
                      {!PLAIN_NOTES && <button type="button" className="secondary-button" title="给命令行用的引用，不含密钥本身" onClick={() => void copy(`${item.id}:r`, formatApiKeyReference(item.id))}>{copiedKey === `${item.id}:r` ? "已复制" : "复制引用"}</button>}
                      {item.fromNote && <button type="button" className="secondary-button" aria-pressed={sourceId === item.id} onClick={() => setSourceId(sourceId === item.id ? "" : item.id)}>{sourceId === item.id ? "收起原文" : "看原文"}</button>}
                      {item.fromNote && (revertId === item.id
                        ? <span className="settings-inline-actions"><button type="button" className="secondary-button" onClick={() => setRevertId("")}>取消</button><button type="button" className="secondary-button danger-text" onClick={() => void revert(item)}>确认还原</button></span>
                        : <button type="button" className="secondary-button" onClick={() => setRevertId(item.id)}>还原为笔记</button>)}
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
        <button type="button" className="primary-button" onClick={() => { setDraft(emptyDraft()); setErrors({}); setFieldErrors({}); }}><Icon name="plus" />添加 API 密钥</button>
      </div>
    </>
  );
}
