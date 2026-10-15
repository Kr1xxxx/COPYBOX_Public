"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EntryKind } from "./account-view";
import { copyTextWithExpiry } from "./clipboard";
import { LOGIN_FIELDS, NOTE_BODY_MAX, NOTE_NAME_MAX, convertNote, guessLoginFields, loginDraftProblems, loginFromNote, noteHint, noteLines, type LoginField } from "./note-core";
import { NoteMarkdown } from "./note-markdown";
import type { NoteItem } from "./payment-core";
import { openSecretItemsStore, type SecretItemsStore, type VaultItem } from "./secret-items-store";
import { Icon } from "./ui-atoms";

type Draft = { id: string | null; name: string; body: string };
const EMPTY: Draft = { id: null, name: "", body: "" };
type Convert = { note: NoteItem; values: Record<LoginField, string>; from: Partial<Record<LoginField, number>> };

const onlyNotes = (list: VaultItem[]) => list.filter((entry): entry is NoteItem => entry.type === "note" && !entry.trashedAt);

function whenText(at: number) {
  return new Date(at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function short(text: string) {
  const chars = Array.from(text);
  return chars.length > 28 ? `${chars.slice(0, 28).join("")}…` : text;
}

// 笔记 in 账号: anything, written in Markdown. 「转为登录」 turns a note into a login after showing which line goes where;
// the note is kept inside the login, so 「还原为笔记」 brings it back unchanged.
export function NotePanel({ deviceKey, onToast, focusId, startAdding, onShowEntry }: {
  deviceKey: string; onToast: (message: string) => void; focusId?: string; startAdding?: boolean; onShowEntry?: (tab: EntryKind, id: string) => void;
}) {
  const storeRef = useRef<SecretItemsStore | null>(null);
  const [items, setItems] = useState<NoteItem[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [openId, setOpenId] = useState(focusId ?? "");
  const [draft, setDraft] = useState<Draft | null>(startAdding ? { ...EMPTY } : null);
  const [previewing, setPreviewing] = useState(false);
  const [convert, setConvert] = useState<Convert | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteId, setDeleteId] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const timers = useRef<{ copied?: ReturnType<typeof setTimeout> }>({});
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    const store = openSecretItemsStore(deviceKey);
    storeRef.current = store;
    store.list().then((list) => { if (live) setItems(onlyNotes(list)); }).catch((error: Error) => { if (live) setLoadError(error.message); });
    return () => { live = false; };
  }, [deviceKey]);
  useEffect(() => () => { clearTimeout(timers.current.copied); }, []);
  useEffect(() => { if (draft && !draft.id) nameRef.current?.focus(); }, [draft?.id, draft === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = useMemo(() => (convert ? noteLines(convert.note.body) : []), [convert]);

  async function copy(item: NoteItem) {
    try {
      await copyTextWithExpiry(item.body);
      setCopiedId(item.id);
      clearTimeout(timers.current.copied);
      timers.current.copied = setTimeout(() => setCopiedId(""), 1600);
      onToast("已复制");
    } catch {
      onToast("复制失败，请重试");
    }
  }

  function setField<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((current) => current && { ...current, [field]: value });
    setErrors((current) => (current[field] ? { ...current, [field]: "" } : current));
  }

  async function save() {
    const store = storeRef.current;
    if (!draft || !store) return;
    const found: Record<string, string> = {};
    if (!draft.name.trim()) found.name = "请填写标题";
    if (draft.body.length > NOTE_BODY_MAX) found.body = `内容太长了，最多 ${NOTE_BODY_MAX} 个字`;
    if (Object.keys(found).length > 0) { setErrors(found); return; }
    const at = Date.now();
    const existing = items?.find((entry) => entry.id === draft.id);
    const item: NoteItem = {
      ...existing,
      id: draft.id ?? crypto.randomUUID(), type: "note", name: Array.from(draft.name.trim().replace(/\s+/g, " ")).slice(0, NOTE_NAME_MAX).join(""),
      body: draft.body.replace(/\s+$/, ""), createdAt: existing?.createdAt ?? at, updatedAt: at,
    };
    try {
      setItems(onlyNotes(await store.put(item)));
      setOpenId(item.id);
      setDraft(null);
      setPreviewing(false);
    } catch (error) {
      setErrors({ name: error instanceof Error ? error.message : "保存失败，请重试" });
    }
  }

  async function remove(id: string) {
    const found = items?.find((entry) => entry.id === id);
    if (!found) return;
    try {
      setItems(onlyNotes(await storeRef.current!.put({ ...found, trashedAt: Date.now() })));
      setDeleteId("");
      setOpenId("");
    } catch {
      onToast("删除失败，请重试");
    }
  }

  function startConvert(note: NoteItem) {
    const guess = guessLoginFields(note);
    setConvert({ note, values: guess.values, from: guess.from });
    setErrors({});
  }

  function setValue(field: LoginField, value: string, from?: number) {
    setConvert((current) => current && { ...current, values: { ...current.values, [field]: value }, from: { ...current.from, [field]: from } });
    setErrors((current) => (current[field] ? { ...current, [field]: "" } : current));
  }

  async function saveConvert() {
    const store = storeRef.current;
    if (!convert || !store) return;
    const found = loginDraftProblems(convert.values);
    if (Object.keys(found).length > 0) { setErrors(found as Record<string, string>); return; }
    const login = loginFromNote(convert.note, convert.values, crypto.randomUUID(), Date.now());
    try {
      setItems(onlyNotes(await store.update((current) => convertNote(current, convert.note.id, login))));
      setConvert(null);
      onToast("已转为登录，原文已保留，可以还原");
      onShowEntry?.("login", login.id);
    } catch (error) {
      setErrors({ name: error instanceof Error ? error.message : "保存失败，请重试" });
    }
  }

  if (loadError) return <p className="settings-note" role="alert">{loadError}</p>;
  if (items === null) return <p className="settings-note">正在读取…</p>;

  if (convert) {
    return (
      <form className="totp-form pay-form note-convert" aria-label="转为登录" onSubmit={(event) => { event.preventDefault(); void saveConvert(); }} noValidate>
        <p className="settings-note">先看一下每一项来自笔记的哪一行，不对可以换一行或直接改。保存后，原来的笔记会跟着这条登录一起保存，随时可以「还原为笔记」。</p>
        {LOGIN_FIELDS.map(({ key, label }) => {
          const multi = key === "note";
          return (
            <div key={key} className="note-map-row">
              <label>{label}{key === "url" || key === "note" ? "（可不填）" : ""}
                {multi
                  ? <textarea aria-label={label} rows={3} value={convert.values[key]} onChange={(event) => setValue(key, event.target.value)} />
                  : <input aria-label={label} value={convert.values[key]} autoComplete="off" spellCheck={false} maxLength={key === "name" ? NOTE_NAME_MAX : undefined} onChange={(event) => setValue(key, event.target.value)} />}
                {errors[key] && <span className="totp-error" role="alert">{errors[key]}</span>}
              </label>
              {!multi && <select aria-label={`${label}来自哪一行`} value={convert.from[key] ?? ""} onChange={(event) => {
                const line = lines.find((entry) => entry.line === Number(event.target.value));
                setValue(key, line ? line.value : key === "name" ? convert.note.name : "", line?.line);
              }}>
                <option value="">{key === "name" ? "用笔记标题" : "不从笔记取"}</option>
                {lines.map((line) => <option key={line.line} value={line.line}>第 {line.line} 行：{short(line.text)}</option>)}
              </select>}
            </div>
          );
        })}
        <div className="settings-inline-actions">
          <button type="button" className="secondary-button" onClick={() => setConvert(null)}>取消</button>
          <button type="submit" className="primary-button">保存为登录</button>
        </div>
      </form>
    );
  }

  if (draft) {
    return (
      <form className="totp-form pay-form" onSubmit={(event) => { event.preventDefault(); void save(); }} noValidate>
        <label>标题<input ref={nameRef} value={draft.name} maxLength={NOTE_NAME_MAX} autoComplete="off" placeholder="例如：店铺后台备忘" onChange={(event) => setField("name", event.target.value)} />
          {errors.name && <span className="totp-error" role="alert">{errors.name}</span>}</label>
        <div className="note-edit-head">
          <span>内容</span>
          <span className="note-edit-tabs" role="group" aria-label="编辑或预览">
            <button type="button" className={`note-tab${previewing ? "" : " active"}`} aria-pressed={!previewing} onClick={() => setPreviewing(false)}>编辑</button>
            <button type="button" className={`note-tab${previewing ? " active" : ""}`} aria-pressed={previewing} onClick={() => setPreviewing(true)}>预览</button>
          </span>
        </div>
        {previewing
          ? <div className="note-preview" aria-label="预览"><NoteMarkdown source={draft.body} /></div>
          : <textarea aria-label="笔记内容" rows={10} value={draft.body} spellCheck={false} placeholder={"随便写，支持 Markdown：\n# 标题\n- 列表\n**加粗**  [链接](https://example.com)"} onChange={(event) => setField("body", event.target.value)} />}
        {errors.body && <span className="totp-error" role="alert">{errors.body}</span>}
        <div className="settings-inline-actions">
          <button type="button" className="secondary-button" onClick={() => { setDraft(null); setPreviewing(false); }}>取消</button>
          <button type="submit" className="primary-button">保存</button>
        </div>
      </form>
    );
  }

  return (
    <>
      {items.length === 0 && <p className="totp-empty">还没有笔记。点右上角「新增」，什么都可以记，支持 Markdown。</p>}
      {items.length > 0 && (
        <ul className="totp-list pay-list">
          {items.map((item) => {
            const open = openId === item.id;
            return (
              <li key={item.id} className={`pay-item${open ? " open" : ""}`}>
                <button type="button" className="pay-head" aria-expanded={open} onClick={() => { setOpenId(open ? "" : item.id); setDeleteId(""); }}>
                  <span className="note-badge" aria-hidden="true"><Icon name="note" /></span>
                  <span className="totp-who"><strong>{item.name}</strong><small>{noteHint(item.body)}</small></span>
                  <Icon name="chevron" className="pay-chevron" />
                </button>
                {open && (
                  <div className="pay-body">
                    <NoteMarkdown source={item.body} />
                    <p className="pay-meta">上次修改 {whenText(item.updatedAt)}</p>
                    <div className="pay-actions">
                      <button type="button" className={`secondary-button${copiedId === item.id ? " copied" : ""}`} onClick={() => void copy(item)}>{copiedId === item.id ? "已复制" : "复制全文"}</button>
                      <button type="button" className="secondary-button" onClick={() => { setDraft({ id: item.id, name: item.name, body: item.body }); setErrors({}); }}>修改</button>
                      <button type="button" className="secondary-button" onClick={() => startConvert(item)}>转为登录…</button>
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
        <button type="button" className="primary-button" onClick={() => { setDraft({ ...EMPTY }); setErrors({}); }}><Icon name="plus" />添加笔记</button>
      </div>
    </>
  );
}
