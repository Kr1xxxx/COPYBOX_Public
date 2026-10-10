"use client";

import { useEffect, useRef, useState } from "react";
import { copyTextWithExpiry } from "./clipboard";
import {
  PAYMENT_FIELDS, PAYMENT_KINDS, PAYMENT_MAX_ITEMS, buildEnglishBlock, clampPaymentName, groupIban, looksLikeIban, normalizePaymentFields, paymentHint, validatePayment,
  type PaymentItem, type PaymentKind,
} from "./payment-core";
import { openSecretItemsStore, type SecretItemsStore } from "./secret-items-store";
import { SiteBadge } from "./site-badge";
import { detectSite } from "./site-core";
import { Icon } from "./ui-atoms";

function whenText(at: number) {
  return new Date(at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

type Draft = { id: string | null; kind: PaymentKind; name: string; fields: Record<string, string> };
const EMPTY_DRAFT: Draft = { id: null, kind: "bank", name: "", fields: {} };

// 收款信息 in the hidden 保险箱. Shown as plain text on purpose (it is sent to customers); changing an entry asks twice.
export function PaymentPanel({ deviceKey, onToast, focusId }: { deviceKey: string; onToast: (message: string) => void; focusId?: string }) {
  const storeRef = useRef<SecretItemsStore | null>(null);
  const [items, setItems] = useState<PaymentItem[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [openId, setOpenId] = useState(focusId ?? "");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmSave, setConfirmSave] = useState(false);
  const [deleteId, setDeleteId] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    const store = openSecretItemsStore(deviceKey);
    storeRef.current = store;
    store.list().then((list) => { if (live) setItems(list.filter((entry): entry is PaymentItem => entry.type === "payment")); }).catch((error: Error) => { if (live) setLoadError(error.message); });
    return () => { live = false; };
  }, [deviceKey]);
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);
  useEffect(() => { if (draft && !draft.id) nameRef.current?.focus(); }, [draft?.id, draft === null]); // eslint-disable-line react-hooks/exhaustive-deps

  async function copy(key: string, text: string) {
    try {
      await copyTextWithExpiry(text);
      setCopiedKey(key);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedKey(""), 1600);
      onToast("已复制");
    } catch {
      onToast("复制失败，请重试");
    }
  }

  function startAdd() {
    setDraft({ ...EMPTY_DRAFT });
    setErrors({});
    setConfirmSave(false);
  }

  function startEdit(item: PaymentItem) {
    setDraft({ id: item.id, kind: item.kind, name: item.name, fields: { ...item.fields } });
    setErrors({});
    setConfirmSave(false);
  }

  function setField(key: string, value: string) {
    setDraft((current) => current && { ...current, fields: { ...current.fields, [key]: value } });
    setErrors((current) => (current[key] ? { ...current, [key]: "" } : current));
    setConfirmSave(false);
  }

  async function save() {
    const store = storeRef.current;
    if (!draft || !store) return;
    const found = validatePayment(draft.kind, draft.name, draft.fields);
    if (Object.keys(found).length > 0) { setErrors(found); setConfirmSave(false); return; }
    // An existing entry is only changed after a second, explicit confirmation.
    if (draft.id && !confirmSave) { setConfirmSave(true); return; }
    const now = Date.now();
    const existing = items?.find((entry) => entry.id === draft.id);
    const item: PaymentItem = {
      id: draft.id ?? crypto.randomUUID(), type: "payment", kind: draft.kind, name: clampPaymentName(draft.name),
      fields: normalizePaymentFields(draft.kind, draft.fields), createdAt: existing?.createdAt ?? now, updatedAt: now,
    };
    try {
      const list = await store.put(item);
      setItems(list.filter((entry): entry is PaymentItem => entry.type === "payment"));
      setOpenId(item.id);
      setDraft(null);
      setConfirmSave(false);
    } catch (error) {
      setErrors({ name: error instanceof Error ? error.message : "保存失败，请重试" });
      setConfirmSave(false);
    }
  }

  async function remove(id: string) {
    try {
      const list = await storeRef.current!.remove(id);
      setItems(list.filter((entry): entry is PaymentItem => entry.type === "payment"));
      setDeleteId("");
      setOpenId("");
    } catch {
      onToast("删除失败，请重试");
    }
  }

  if (loadError) return <p className="settings-note" role="alert">{loadError}</p>;
  if (items === null) return <p className="settings-note">正在读取…</p>;

  if (draft) {
    const fields = PAYMENT_FIELDS[draft.kind];
    return (
      <form className="totp-form pay-form" onSubmit={(event) => { event.preventDefault(); void save(); }} noValidate>
        {!draft.id && <div className="pay-kinds" role="group" aria-label="收款方式">
          {PAYMENT_KINDS.map((entry) => (
            <button key={entry.value} type="button" className={`pay-kind${draft.kind === entry.value ? " active" : ""}`} aria-pressed={draft.kind === entry.value}
              onClick={() => { setDraft({ ...draft, kind: entry.value }); setErrors({}); }}>{entry.label}</button>
          ))}
        </div>}
        <label>名称<input ref={nameRef} value={draft.name} maxLength={40} autoComplete="off" placeholder="例如：美元电汇 - 招行" onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setErrors((current) => ({ ...current, name: "" })); setConfirmSave(false); }} />
          {errors.name && <span className="totp-error" role="alert">{errors.name}</span>}</label>
        {fields.map((field) => (
          <label key={field.key}>{field.label}{field.required ? "" : "（可不填）"}
            {field.multiline
              ? <textarea rows={3} value={draft.fields[field.key] ?? ""} onChange={(event) => setField(field.key, event.target.value)} spellCheck={false} autoComplete="off" />
              : <input value={draft.fields[field.key] ?? ""} onChange={(event) => setField(field.key, event.target.value)} placeholder={field.placeholder} spellCheck={false} autoComplete="off" />}
            {errors[field.key] && <span className="totp-error" role="alert">{errors[field.key]}</span>}
          </label>
        ))}
        {confirmSave && <p className="pay-confirm" role="alert">这条收款信息会发给客户，确认要修改吗？</p>}
        <div className="settings-inline-actions">
          <button type="button" className="secondary-button" onClick={() => { setDraft(null); setConfirmSave(false); }}>取消</button>
          <button type="submit" className="primary-button">{confirmSave ? "确认修改" : "保存"}</button>
        </div>
      </form>
    );
  }

  return (
    <>
      {items.length === 0 && <p className="totp-empty">还没有收款信息。点下面的「添加收款信息」，选择银行电汇、PayPal 等方式。</p>}
      {items.length > 0 && (
        <ul className="totp-list pay-list">
          {items.map((item) => {
            const open = openId === item.id;
            return (
              <li key={item.id} className={`pay-item${open ? " open" : ""}`}>
                <button type="button" className="pay-head" aria-expanded={open} onClick={() => { setOpenId(open ? "" : item.id); setDeleteId(""); }}>
                  <SiteBadge site={item.kind === "paypal" ? detectSite({ name: "PayPal" }) : item.kind === "wise" ? detectSite({ name: "Wise" }) : detectSite({ name: item.name })} />
                  <span className="totp-who"><strong>{item.name}</strong><small>{paymentHint(item)}</small></span>
                  <Icon name="chevron" className="pay-chevron" />
                </button>
                {open && (
                  <div className="pay-body">
                    <dl className="pay-fields">
                      {PAYMENT_FIELDS[item.kind].filter((field) => item.fields[field.key]).map((field) => {
                        const value = item.fields[field.key];
                        const shown = field.key === "account" && looksLikeIban(value) ? groupIban(value) : value;
                        const key = `${item.id}:${field.key}`;
                        return (
                          <div key={field.key} className="pay-field">
                            <dt>{field.label}</dt>
                            <dd>{shown}</dd>
                            <button type="button" className={`icon-button pay-copy${copiedKey === key ? " copied" : ""}`} onClick={() => void copy(key, value)} aria-label={`复制${field.label}`} title="复制"><Icon name={copiedKey === key ? "check" : "copy"} /></button>
                          </div>
                        );
                      })}
                    </dl>
                    <p className="pay-meta">上次修改 {whenText(item.updatedAt)}</p>
                    <div className="pay-actions">
                      <button type="button" className="primary-button" onClick={() => void copy(`${item.id}:all`, buildEnglishBlock(item))}><Icon name={copiedKey === `${item.id}:all` ? "check" : "copy"} />{copiedKey === `${item.id}:all` ? "已复制" : "复制整段（英文）"}</button>
                      <button type="button" className="secondary-button" onClick={() => startEdit(item)}>修改</button>
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
        <button type="button" className="primary-button" onClick={startAdd} disabled={items.length >= PAYMENT_MAX_ITEMS}><Icon name="plus" />添加收款信息</button>
      </div>
    </>
  );
}
