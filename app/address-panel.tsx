"use client";

import { useEffect, useRef, useState } from "react";
import { ADDRESS_SITE } from "./account-view";
import { ADDRESS_FIELDS, ADDRESS_FIELD_MAX, ADDRESS_NAME_MAX, addressBlock, addressHint, normalizeAddressFields, validateAddress } from "./address-core";
import { copyTextWithExpiry } from "./clipboard";
import type { AddressItem } from "./payment-core";
import { openSecretItemsStore, type SecretItemsStore, type VaultItem } from "./secret-items-store";
import { SiteBadge } from "./site-badge";
import { Icon } from "./ui-atoms";

type Draft = { id: string | null; name: string; fields: Record<string, string> };
const EMPTY: Draft = { id: null, name: "", fields: {} };

const onlyAddresses = (list: VaultItem[]) => list.filter((entry): entry is AddressItem => entry.type === "address" && !entry.trashedAt);

function whenText(at: number) {
  return new Date(at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

// 地址 in 账号 (D-076): company addresses, shown as plain text. Each part or the whole address is copied with one click.
export function AddressPanel({ deviceKey, onToast, focusId, startAdding }: { deviceKey: string; onToast: (message: string) => void; focusId?: string; startAdding?: boolean }) {
  const storeRef = useRef<SecretItemsStore | null>(null);
  const [items, setItems] = useState<AddressItem[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [openId, setOpenId] = useState(focusId ?? "");
  const [draft, setDraft] = useState<Draft | null>(startAdding ? { ...EMPTY } : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteId, setDeleteId] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const timers = useRef<{ copied?: ReturnType<typeof setTimeout> }>({});
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    const store = openSecretItemsStore(deviceKey);
    storeRef.current = store;
    store.list().then((list) => { if (live) setItems(onlyAddresses(list)); }).catch((error: Error) => { if (live) setLoadError(error.message); });
    return () => { live = false; };
  }, [deviceKey]);
  useEffect(() => () => { clearTimeout(timers.current.copied); }, []);
  useEffect(() => { if (draft && !draft.id) nameRef.current?.focus(); }, [draft?.id, draft === null]); // eslint-disable-line react-hooks/exhaustive-deps

  async function copy(key: string, text: string, message = "已复制") {
    try {
      await copyTextWithExpiry(text);
      setCopiedKey(key);
      clearTimeout(timers.current.copied);
      timers.current.copied = setTimeout(() => setCopiedKey(""), 1600);
      onToast(message);
    } catch {
      onToast("复制失败，请重试");
    }
  }

  function setField(key: string, value: string) {
    setDraft((current) => current && { ...current, fields: { ...current.fields, [key]: value } });
    setErrors((current) => (current[key] ? { ...current, [key]: "" } : current));
  }

  async function save() {
    const store = storeRef.current;
    if (!draft || !store) return;
    const found = validateAddress(draft.name, draft.fields);
    if (Object.keys(found).length > 0) { setErrors(found); return; }
    const at = Date.now();
    const existing = items?.find((entry) => entry.id === draft.id);
    const item: AddressItem = {
      ...existing,
      id: draft.id ?? crypto.randomUUID(), type: "address", name: Array.from(draft.name.trim().replace(/\s+/g, " ")).slice(0, ADDRESS_NAME_MAX).join(""),
      fields: normalizeAddressFields(draft.fields), createdAt: existing?.createdAt ?? at, updatedAt: at,
    };
    try {
      setItems(onlyAddresses(await store.put(item)));
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
      setItems(onlyAddresses(await storeRef.current!.put({ ...found, trashedAt: Date.now() })));
      setDeleteId("");
      setOpenId("");
    } catch {
      onToast("删除失败，请重试");
    }
  }

  if (loadError) return <p className="settings-note" role="alert">{loadError}</p>;
  if (items === null) return <p className="settings-note">正在读取…</p>;

  if (draft) {
    return (
      <form className="totp-form pay-form" onSubmit={(event) => { event.preventDefault(); void save(); }} noValidate>
        <label>公司名称<input ref={nameRef} value={draft.name} maxLength={ADDRESS_NAME_MAX} autoComplete="off" placeholder="例如：广州某某贸易有限公司" onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setErrors((current) => ({ ...current, name: "" })); }} />
          {errors.name && <span className="totp-error" role="alert">{errors.name}</span>}</label>
        {ADDRESS_FIELDS.map((field) => (
          <label key={field.key}>{field.label}{field.key === "address" ? "" : "（可不填）"}
            {field.multiline
              ? <textarea rows={field.key === "address" ? 3 : 2} value={draft.fields[field.key] ?? ""} maxLength={ADDRESS_FIELD_MAX} placeholder={field.placeholder} onChange={(event) => setField(field.key, event.target.value)} autoComplete="off" />
              : <input value={draft.fields[field.key] ?? ""} maxLength={ADDRESS_FIELD_MAX} placeholder={field.placeholder} onChange={(event) => setField(field.key, event.target.value)} autoComplete="off" />}
            {errors[field.key] && <span className="totp-error" role="alert">{errors[field.key]}</span>}
          </label>
        ))}
        <div className="settings-inline-actions">
          <button type="button" className="secondary-button" onClick={() => setDraft(null)}>取消</button>
          <button type="submit" className="primary-button">保存</button>
        </div>
      </form>
    );
  }

  return (
    <>
      {items.length === 0 && <p className="totp-empty">还没有地址。点右上角「新增」，存下公司名称、联系人、电话和地址。</p>}
      {items.length > 0 && (
        <ul className="totp-list pay-list">
          {items.map((item) => {
            const open = openId === item.id;
            return (
              <li key={item.id} className={`pay-item${open ? " open" : ""}`}>
                <button type="button" className="pay-head" aria-expanded={open} onClick={() => { setOpenId(open ? "" : item.id); setDeleteId(""); }}>
                  <SiteBadge site={ADDRESS_SITE} />
                  <span className="totp-who"><strong>{item.name}</strong><small>{addressHint(item)}</small></span>
                  <Icon name="chevron" className="pay-chevron" />
                </button>
                {open && (
                  <div className="pay-body">
                    <dl className="pay-fields">
                      {ADDRESS_FIELDS.filter((field) => item.fields[field.key]).map((field) => {
                        const key = `${item.id}:${field.key}`;
                        return (
                          <div key={field.key} className="pay-field">
                            <dt>{field.label}</dt>
                            <dd>{item.fields[field.key]}</dd>
                            <button type="button" className={`icon-button pay-copy${copiedKey === key ? " copied" : ""}`} onClick={() => void copy(key, item.fields[field.key])} aria-label={`复制${field.label}`} title="复制"><Icon name={copiedKey === key ? "check" : "copy"} /></button>
                          </div>
                        );
                      })}
                    </dl>
                    <p className="pay-meta">上次修改 {whenText(item.updatedAt)}</p>
                    <div className="pay-actions">
                      <button type="button" className="primary-button" onClick={() => void copy(`${item.id}:all`, addressBlock(item), "已复制完整地址")}><Icon name={copiedKey === `${item.id}:all` ? "check" : "copy"} />{copiedKey === `${item.id}:all` ? "已复制" : "复制完整地址"}</button>
                      <button type="button" className="secondary-button" onClick={() => { setDraft({ id: item.id, name: item.name, fields: { ...item.fields } }); setErrors({}); }}>修改</button>
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
        <button type="button" className="primary-button" onClick={() => { setDraft({ ...EMPTY }); setErrors({}); }}><Icon name="plus" />添加地址</button>
      </div>
    </>
  );
}
