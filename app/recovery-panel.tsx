"use client";

import { useEffect, useRef, useState } from "react";
import { copyTextWithExpiry } from "./clipboard";
import type { RecoveryItem } from "./payment-core";
import { parseRecoveryCodes, recoveryProblem } from "./recovery-core";
import { openSecretItemsStore, type SecretItemsStore } from "./secret-items-store";
import { SiteBadge } from "./site-badge";
import { detectSite } from "./site-core";
import { Icon } from "./ui-atoms";

type Draft = { id: string | null; name: string; site: string; codes: string; note: string };
const EMPTY: Draft = { id: null, name: "", site: "", codes: "", note: "" };

function whenText(at: number) {
  return new Date(at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

const siteOf = (item: Pick<RecoveryItem, "site" | "name">) => detectSite(/^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(item.site.trim()) ? { url: item.site, name: item.name } : { name: item.site || item.name });

// 恢复码 in the hidden 保险箱: the backup codes a site gives out once. Hidden until the eye button is held; each code or all of them can be copied.
export function RecoveryPanel({ deviceKey, onToast, focusId, startAdding }: { deviceKey: string; onToast: (message: string) => void; focusId?: string; startAdding?: boolean }) {
  const storeRef = useRef<SecretItemsStore | null>(null);
  const [items, setItems] = useState<RecoveryItem[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [openId, setOpenId] = useState(focusId ?? "");
  const [draft, setDraft] = useState<Draft | null>(startAdding ? { ...EMPTY } : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteId, setDeleteId] = useState("");
  const [shown, setShown] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const timers = useRef<{ copied?: ReturnType<typeof setTimeout>; shown?: ReturnType<typeof setTimeout> }>({});
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    const store = openSecretItemsStore(deviceKey);
    storeRef.current = store;
    store.list().then((list) => { if (live) setItems(list.filter((entry): entry is RecoveryItem => entry.type === "recovery")); }).catch((error: Error) => { if (live) setLoadError(error.message); });
    return () => { live = false; };
  }, [deviceKey]);
  useEffect(() => () => { clearTimeout(timers.current.copied); clearTimeout(timers.current.shown); }, []);
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
    const codes = parseRecoveryCodes(draft.codes);
    const found: Record<string, string> = {};
    if (!draft.name.trim()) found.name = "请填写名称";
    const problem = recoveryProblem(codes);
    if (problem) found.codes = problem;
    if (Object.keys(found).length > 0) { setErrors(found); return; }
    const at = Date.now();
    const existing = items?.find((entry) => entry.id === draft.id);
    const item: RecoveryItem = {
      id: draft.id ?? crypto.randomUUID(), type: "recovery", name: Array.from(draft.name.trim().replace(/\s+/g, " ")).slice(0, 40).join(""),
      site: draft.site.trim().slice(0, 60), codes, note: draft.note.trim(), createdAt: existing?.createdAt ?? at, updatedAt: at,
    };
    try {
      setItems((await store.put(item)).filter((entry): entry is RecoveryItem => entry.type === "recovery"));
      setOpenId(item.id);
      setDraft(null);
    } catch (error) {
      setErrors({ name: error instanceof Error ? error.message : "保存失败，请重试" });
    }
  }

  async function remove(id: string) {
    try {
      setItems((await storeRef.current!.remove(id)).filter((entry): entry is RecoveryItem => entry.type === "recovery"));
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
        <label>名称<input ref={nameRef} value={draft.name} maxLength={40} autoComplete="off" placeholder="例如：Google 恢复码" onChange={(event) => setField("name", event.target.value)} />
          {errors.name && <span className="totp-error" role="alert">{errors.name}</span>}</label>
        <label>网站（可不填）<input value={draft.site} autoComplete="off" spellCheck={false} placeholder="例如：Google 或 shopify.com" onChange={(event) => setField("site", event.target.value)} /></label>
        <label>恢复码<textarea aria-label="恢复码" rows={5} value={draft.codes} spellCheck={false} placeholder="一行一个，直接整段粘贴也行" onChange={(event) => setField("codes", event.target.value)} />
          {errors.codes && <span className="totp-error" role="alert">{errors.codes}</span>}
          {draft.codes.trim() && !errors.codes && <span className="pay-hint">识别到 {parseRecoveryCodes(draft.codes).length} 个</span>}</label>
        <label>备注（可不填）<input value={draft.note} autoComplete="off" maxLength={200} placeholder="例如：用过的要划掉" onChange={(event) => setField("note", event.target.value)} /></label>
        <div className="settings-inline-actions">
          <button type="button" className="secondary-button" onClick={() => setDraft(null)}>取消</button>
          <button type="submit" className="primary-button">保存</button>
        </div>
      </form>
    );
  }

  return (
    <>
      {items.length === 0 && <p className="totp-empty">还没有恢复码。网站给你的备用恢复码一般只出现一次，点右上角「新增」存起来。</p>}
      {items.length > 0 && (
        <ul className="totp-list pay-list">
          {items.map((item) => {
            const open = openId === item.id;
            return (
              <li key={item.id} className={`pay-item${open ? " open" : ""}`}>
                <button type="button" className="pay-head" aria-expanded={open} onClick={() => { setOpenId(open ? "" : item.id); setDeleteId(""); setShown(""); }}>
                  <SiteBadge site={siteOf(item)} />
                  <span className="totp-who"><strong>{item.name}</strong><small>{item.codes.length} 个恢复码</small></span>
                  <Icon name="chevron" className="pay-chevron" />
                </button>
                {open && (
                  <div className="pay-body">
                    <dl className="pay-fields">
                      {item.codes.map((code, index) => {
                        const id = `${item.id}:${index}`;
                        return (
                          <div key={id} className="pay-field">
                            <dt>{index + 1}</dt>
                            <dd className="login-pass">{shown === item.id ? code : "••••••••"}</dd>
                            <span className="login-pass-actions">
                              <button type="button" className={`icon-button pay-copy${copiedKey === id ? " copied" : ""}`} onClick={() => void copy(id, code)} aria-label={`复制第 ${index + 1} 个恢复码`} title="复制"><Icon name={copiedKey === id ? "check" : "copy"} /></button>
                            </span>
                          </div>
                        );
                      })}
                      {item.note && <div className="pay-field"><dt>备注</dt><dd>{item.note}</dd><span /></div>}
                    </dl>
                    <p className="pay-meta">上次修改 {whenText(item.updatedAt)}</p>
                    <div className="pay-actions">
                      <button type="button" className="secondary-button" aria-label="显示恢复码" title="按住显示"
                        onPointerDown={() => reveal(item.id)} onPointerUp={() => setShown("")} onPointerLeave={() => setShown("")} onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") reveal(item.id); }} onKeyUp={() => setShown("")}><Icon name="eye" />按住显示</button>
                      <button type="button" className="secondary-button" onClick={() => void copy(`${item.id}:all`, item.codes.join("\n"), "已复制全部恢复码")}>复制全部</button>
                      <button type="button" className="secondary-button" onClick={() => { setDraft({ id: item.id, name: item.name, site: item.site, codes: item.codes.join("\n"), note: item.note }); setErrors({}); }}>修改</button>
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
        <button type="button" className="primary-button" onClick={() => { setDraft({ ...EMPTY }); setErrors({}); }}><Icon name="plus" />添加恢复码</button>
      </div>
    </>
  );
}
