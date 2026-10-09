"use client";

// The 图片 section: list, viewer, add (file chooser, drop, paste), rename, delete and copy.
// Images live in the encrypted store from image-store.ts; nothing here touches the vault.

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type DragEvent, type Ref } from "react";
import { createPortal } from "react-dom";
import { resolveFocusWrapIndex } from "./clipbox-core";
import "./desktop-bridge";
import {
  IMAGE_TITLE_MAX,
  IMAGE_TYPES,
  openImageStore,
  titleFromFileName,
  toPngBytes,
  validateImageFile,
  type ImageMeta,
  type ImageStore,
} from "./image-store";

export type ImageSectionHandle = { openPicker: () => void };
export type ImageCounts = { total: number; shown: number };

const LOAD_FAILED = "图片读取失败，原数据没有改动。";

// The key is derived once per session: reopening the section reuses the same store.
const storeCache = new Map<string, Promise<ImageStore>>();
function loadStore(deviceKey: string) {
  let opened = storeCache.get(deviceKey);
  if (!opened) {
    opened = openImageStore(deviceKey);
    storeCache.set(deviceKey, opened);
    opened.catch(() => storeCache.delete(deviceKey));
  }
  return opened;
}

function pastedTitle(now = new Date()) {
  const two = (value: number) => String(value).padStart(2, "0");
  return `图片 ${two(now.getMonth() + 1)}-${two(now.getDate())} ${two(now.getHours())}:${two(now.getMinutes())}`;
}

// Browsers name a pasted screenshot "image.png"; that is not a title worth keeping.
function titleForFile(file: File, pasted: boolean) {
  const name = file.name.trim();
  if (!name || (pasted && /^image\.\w+$/i.test(name))) return pastedTitle();
  return titleFromFileName(name) || pastedTitle();
}

function sizeLabel(meta: ImageMeta) {
  const kb = meta.size < 1024 * 1024 ? `${Math.max(1, Math.round(meta.size / 1024))} KB` : `${(meta.size / 1024 / 1024).toFixed(1)} MB`;
  return meta.width > 0 && meta.height > 0 ? `${meta.width}×${meta.height} · ${kb}` : kb;
}

function readableMessage(error: unknown, fallback: string) {
  return error instanceof Error && /[一-鿿]/.test(error.message) ? error.message : fallback;
}

function hasFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function Glyph({ children }: { children: React.ReactNode }) {
  return <svg className="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}
const PlusGlyph = () => <Glyph><path d="M12 5v14M5 12h14" /></Glyph>;
const CheckGlyph = () => <Glyph><path d="m5 12.5 4.5 4.5L19 7.5" /></Glyph>;
const CopyGlyph = () => <Glyph><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></Glyph>;
const PictureGlyph = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#29292c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><rect x="4" y="5" width="16" height="14" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m5 17 4.5-4.5 3.5 3.5 2.5-2.5L20 17" /></svg>;

function ImageDeleteDialog({ target, onClose, onConfirm }: { target: ImageMeta; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!busy) onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") || []);
      const wrapIndex = resolveFocusWrapIndex(focusable.indexOf(document.activeElement as HTMLElement), focusable.length, event.shiftKey);
      if (wrapIndex >= 0) {
        event.preventDefault();
        focusable[wrapIndex].focus();
      }
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [busy, onClose]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch {
      setError("删除失败，图片没有改动");
      setBusy(false);
    }
  }

  return (
    <div className="delete-confirm-backdrop">
      <section ref={dialogRef} className="delete-confirm-dialog permanent" role="alertdialog" aria-modal="true" aria-labelledby="image-delete-title" aria-describedby="image-delete-description">
        <header><span>永久删除</span><h2 id="image-delete-title">永久删除这张图片？</h2><p id="image-delete-description">删除后无法恢复。</p></header>
        <form onSubmit={(event) => void submit(event)}>
          <div className="delete-confirm-item"><strong>{target.title}</strong><small>{sizeLabel(target)}</small></div>
          {error && <p className="delete-confirm-error" role="alert">{error}</p>}
          <div className="delete-confirm-actions"><button ref={cancelRef} type="button" onClick={onClose} disabled={busy}>取消</button><button className="danger" disabled={busy}>{busy ? "正在处理…" : "永久删除"}</button></div>
        </form>
      </section>
    </div>
  );
}

export function ImageSection({ deviceKey, query, compact, paused, onToast, onCounts, ref }: {
  deviceKey: string;
  query: string;
  compact: boolean;
  // A dialog is open on top of the page: drops and pastes must not add images behind it.
  paused: boolean;
  onToast: (message: string) => void;
  onCounts: (counts: ImageCounts) => void;
  ref?: Ref<ImageSectionHandle>;
}) {
  const [store, setStore] = useState<ImageStore | null>(null);
  const [images, setImages] = useState<ImageMeta[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reloadTick, setReloadTick] = useState(0);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [copiedId, setCopiedId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ImageMeta | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const thumbUrls = useRef(new Map<string, string>());
  const thumbPending = useRef(new Set<string>());

  useEffect(() => {
    mounted.current = true;
    const urls = thumbUrls.current;
    const pending = thumbPending.current;
    return () => {
      mounted.current = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
      pending.clear();
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!deviceKey) return;
    let cancelled = false;
    loadStore(deviceKey)
      .then(async (opened) => {
        const list = await opened.list();
        if (cancelled) return;
        setStore(opened);
        // An image added while the list was still loading is already in state: keep it.
        setImages((current) => current
          ? [...current, ...list.filter((meta) => !current.some((value) => value.id === meta.id))].sort((a, b) => b.createdAt - a.createdAt)
          : list);
        setLoadError("");
      })
      .catch(() => { if (!cancelled) setLoadError(LOAD_FAILED); });
    return () => { cancelled = true; };
  }, [deviceKey, reloadTick]);

  // One decrypted object URL per image serves both the small thumbnail and the larger preview.
  useEffect(() => {
    if (!store || !images) return;
    for (const meta of images) {
      if (thumbUrls.current.has(meta.id) || thumbPending.current.has(meta.id)) continue;
      thumbPending.current.add(meta.id);
      store.getBlob(meta.id)
        .then((blob) => {
          thumbPending.current.delete(meta.id);
          if (!mounted.current || thumbUrls.current.has(meta.id)) return;
          const url = URL.createObjectURL(blob);
          thumbUrls.current.set(meta.id, url);
          setThumbs((current) => ({ ...current, [meta.id]: url }));
        })
        .catch(() => { thumbPending.current.delete(meta.id); });
    }
  }, [store, images]);

  const shown = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (images ?? []).filter((meta) => terms.every((term) => meta.title.toLowerCase().includes(term)));
  }, [images, query]);
  const total = images?.length ?? 0;
  useEffect(() => { onCounts({ total, shown: shown.length }); }, [onCounts, total, shown.length]);

  const openId = shown.some((meta) => meta.id === selectedId) ? selectedId : "";
  // The opened row grows downwards; once it has finished opening, bring all of it into view.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openId) return;
    const timer = setTimeout(() => {
      listRef.current?.querySelector(`[data-image-id="${CSS.escape(openId)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 280);
    return () => clearTimeout(timer);
  }, [openId]);
  const renamingId = renaming?.id;
  useEffect(() => {
    if (!renamingId) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingId]);

  function forgetThumb(id: string) {
    const url = thumbUrls.current.get(id);
    if (url) URL.revokeObjectURL(url);
    thumbUrls.current.delete(id);
    setThumbs((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  async function addFiles(files: File[], pasted = false) {
    if (files.length === 0) return;
    // The chooser may be used before the list has finished loading: wait for the store instead of refusing.
    let target: ImageStore;
    try {
      target = store ?? await loadStore(deviceKey);
    } catch {
      onToast(LOAD_FAILED);
      return;
    }
    let added = 0;
    let rejected = 0;
    let firstProblem = "";
    for (const file of files) {
      const problem = validateImageFile(file);
      if (problem) { rejected += 1; firstProblem ||= problem; continue; }
      try {
        const meta = await target.add(file, titleForFile(file, pasted));
        if (!mounted.current) return;
        setImages((current) => [meta, ...(current ?? [])]);
        added += 1;
      } catch (error) {
        rejected += 1;
        firstProblem ||= readableMessage(error, "图片保存失败，请重试");
      }
    }
    if (!mounted.current) return;
    if (added === 0) onToast(firstProblem);
    else if (rejected > 0) onToast(`已添加 ${added} 张，有 ${rejected} 张没有添加：${firstProblem}`);
    else onToast(added === 1 ? "图片已加密保存" : `已添加 ${added} 张图片`);
  }

  // Dropped and pasted images arrive through window-level listeners, which must see the latest state.
  const addFilesRef = useRef(addFiles);
  useEffect(() => { addFilesRef.current = addFiles; });

  useEffect(() => {
    if (paused) return;
    const onPaste = (event: ClipboardEvent) => {
      const data = event.clipboardData;
      if (!data) return;
      let files = Array.from(data.files).filter((file) => file.type.startsWith("image/"));
      if (files.length === 0) {
        files = Array.from(data.items).filter((item) => item.kind === "file" && item.type.startsWith("image/")).flatMap((item) => item.getAsFile() ?? []);
      }
      if (files.length === 0) return;
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      if (typing && Array.from(data.types).includes("text/plain")) return;
      event.preventDefault();
      void addFilesRef.current(files, true);
    };
    // A file dropped outside the list would otherwise make the window open the file itself.
    const keepWindowStill = (event: Event) => {
      const types = Array.from((event as globalThis.DragEvent).dataTransfer?.types ?? []);
      if (types.includes("Files")) event.preventDefault();
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("dragover", keepWindowStill);
    window.addEventListener("drop", keepWindowStill);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragover", keepWindowStill);
      window.removeEventListener("drop", keepWindowStill);
    };
  }, [paused]);

  useImperativeHandle(ref, () => ({
    openPicker() {
      fileInputRef.current?.click();
    },
  }), []);

  async function copyImage(meta: ImageMeta) {
    if (!store) return;
    try {
      const png = await toPngBytes(await store.getBlob(meta.id));
      if (window.clipboxDesktop?.copyImage) {
        await window.clipboxDesktop.copyImage(png);
      } else {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }) })]);
      }
    } catch {
      onToast("图片复制失败，请重试");
      return;
    }
    window.clipboxDesktop?.didCopy();
    if (!mounted.current) return;
    setCopiedId(meta.id);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedId(""), 1250);
    store.markUsed(meta.id).catch(() => undefined);
  }

  async function submitRename() {
    if (!store || !renaming) return;
    try {
      const updated = await store.rename(renaming.id, renaming.value);
      setImages((current) => current?.map((meta) => meta.id === updated.id ? updated : meta) ?? current);
      setRenaming(null);
      onToast("已改名");
    } catch {
      onToast("改名失败，请重试");
    }
  }

  async function confirmDelete() {
    if (!store || !deleteTarget) return;
    const id = deleteTarget.id;
    await store.remove(id);
    forgetThumb(id);
    setImages((current) => current?.filter((meta) => meta.id !== id) ?? current);
    setDeleteTarget(null);
    setSelectedId("");
    onToast("图片已删除");
  }

  function toggleRow(id: string) {
    setRenaming(null);
    setSelectedId((current) => current === id ? "" : id);
  }

  const thumb = (meta: ImageMeta) => (
    <span className="image-thumb" aria-hidden="true">
      {thumbs[meta.id] && (
        // eslint-disable-next-line @next/next/no-img-element -- a decrypted object URL, not a file Next could optimise
        <img src={thumbs[meta.id]} alt="" draggable={false} />
      )}
    </span>
  );

  let body: React.ReactNode;
  if (loadError) {
    body = <div className="native-empty"><strong>{loadError}</strong><button type="button" className="secondary-button" onClick={() => setReloadTick((tick) => tick + 1)}>重试</button></div>;
  } else if (!images) {
    body = <div className="native-empty image-loading"><span>正在读取图片…</span></div>;
  } else if (total === 0) {
    body = compact ? (
      <div className="native-empty"><strong>还没有图片</strong><span>回到完整窗口添加第一张</span></div>
    ) : (
      <div className="native-empty onboarding">
        <span className="vault-mark"><PictureGlyph /></span>
        <strong>还没有图片，先添加第一张</strong>
        <span>把常发的图片存进来，一键复制。</span>
        <div className="onboarding-actions">
          <button type="button" className="primary-button" onClick={() => fileInputRef.current?.click()}><PlusGlyph />新增第一张</button>
        </div>
        <small>图片加密保存，只留在这台设备上</small>
      </div>
    );
  } else if (shown.length === 0) {
    body = <div className="native-empty"><strong>没有匹配的图片</strong><span>换个词搜索试试</span></div>;
  } else if (compact) {
    body = shown.map((meta) => (
      <article key={meta.id} className={`native-row mini-row image-row ${copiedId === meta.id ? "copied" : ""}`}>
        <button type="button" className="row-main" onClick={() => void copyImage(meta)} aria-label={copiedId === meta.id ? `已复制 ${meta.title}` : `复制 ${meta.title}`}>
          {thumb(meta)}
          <span className="row-copy"><strong>{meta.title}</strong></span>
          {copiedId === meta.id && <span className="mini-copied">已复制</span>}
        </button>
        {copiedId === meta.id && <span className="copy-status" role="status" aria-live="polite">已复制</span>}
      </article>
    ));
  } else {
    body = shown.map((meta) => {
      const open = openId === meta.id;
      const copied = copiedId === meta.id;
      const editing = open && renaming?.id === meta.id ? renaming : null;
      return (
        <article key={meta.id} data-image-id={meta.id} className={`native-row image-row ${open ? "selected" : ""} ${copied ? "copied" : ""}`}>
          <div className="row-line">
            {editing ? (
              <form className="image-rename" onSubmit={(event) => { event.preventDefault(); void submitRename(); }}>
                {thumb(meta)}
                <input
                  ref={renameInputRef}
                  value={editing.value}
                  maxLength={IMAGE_TITLE_MAX}
                  aria-label="图片标题"
                  onChange={(event) => setRenaming({ id: meta.id, value: event.target.value })}
                  onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setRenaming(null); } }}
                />
                <button type="submit" className="primary-button">保存</button>
                <button type="button" className="ghost-button" onClick={() => setRenaming(null)}>取消</button>
              </form>
            ) : (
              <button type="button" className="row-main" onClick={() => toggleRow(meta.id)} aria-expanded={open} aria-label={`${open ? "已展开" : "展开"} ${meta.title}`}>
                {thumb(meta)}
                <span className="row-copy">
                  <span className="row-title"><strong>{meta.title}</strong></span>
                  {!open && <small>{sizeLabel(meta)}</small>}
                </span>
              </button>
            )}
            {!editing && <button type="button" className="native-copy" onClick={() => void copyImage(meta)} aria-label={copied ? `已复制 ${meta.title}` : `复制 ${meta.title}`} title={copied ? "已复制" : "复制"}><span className="copy-glyph" aria-hidden="true" /><span className="copy-check" aria-hidden="true">✓</span></button>}
            {copied && <span className="copy-status" role="status" aria-live="polite">已复制</span>}
          </div>
          {open && <div className="row-detail"><div className="row-detail-inner">
            <div className="image-preview">
              {thumbs[meta.id] ? (
                // eslint-disable-next-line @next/next/no-img-element -- a decrypted object URL, not a file Next could optimise
                <img src={thumbs[meta.id]} alt={meta.title} draggable={false} />
              ) : <span>正在读取…</span>}
            </div>
            <small className="image-facts">{sizeLabel(meta)}</small>
            <div className="row-actions">
              <button type="button" className="primary-button" onClick={() => void copyImage(meta)}>{copied ? <CheckGlyph /> : <CopyGlyph />}{copied ? "已复制" : "复制"}</button>
              <button type="button" className="ghost-button" onClick={() => setRenaming({ id: meta.id, value: meta.title })}>改名</button>
              <span className="spacer" />
              <button type="button" className="ghost-button danger-text" onClick={() => setDeleteTarget(meta)}>删除</button>
            </div>
          </div></div>}
        </article>
      );
    });
  }

  return (
    <div
      className={`image-section ${compact ? "compact" : ""}`}
      onDragOver={(event) => {
        if (paused || !hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDragging(true);
      }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDragging(false);
        if (!paused) void addFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <input
        ref={fileInputRef}
        className="hidden-input"
        type="file"
        accept={IMAGE_TYPES.join(",")}
        multiple
        aria-label="选择图片"
        onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void addFiles(files); }}
      />
      <div ref={listRef} className={`native-list list-switch image-list ${compact ? "mini-list" : ""}`}>{body}</div>
      {dragging && <div className="image-drop-hint" aria-hidden="true">松开即可添加图片</div>}
      {deleteTarget && createPortal(<ImageDeleteDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} />, document.body)}
    </div>
  );
}
