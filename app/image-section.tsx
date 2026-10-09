"use client";

// The 图片 section: list, viewer, add (file chooser, drop, paste), rename, delete and copy.
// Images live in the encrypted store from image-store.ts; nothing here touches the vault.

import { ArcCopyIcon } from "./arc/copy-icon";
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type DragEvent, type Ref } from "react";
import { createPortal } from "react-dom";
import { resolveFocusWrapIndex } from "./clipbox-core";
import "./desktop-bridge";
import { UNCATEGORIZED_COLOR } from "./category-colors";
import { ImageMoveMenu, MoreGlyph, ChevronGlyph } from "./image-folders";
import {
  IMAGE_FILTER_ALL,
  filterImagesByFolder,
  folderOfImageFilter,
  imageFolderColors,
} from "./image-folders-core";
import { readableMessage, type ImageLibrary } from "./image-library";
import { detailScrollDelta, gridCardInsertIndex, type ImageView } from "./image-view-core";
import {
  IMAGE_TITLE_MAX,
  IMAGE_TYPES,
  titleFromFileName,
  toPngBytes,
  validateImageFile,
  type ImageFolder,
  type ImageMeta,
} from "./image-store";

export type ImageSectionHandle = { openPicker: () => void };
export type ImageCounts = { total: number; shown: number };

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

function hasFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function Glyph({ children }: { children: React.ReactNode }) {
  return <svg className="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}
const PlusGlyph = () => <Glyph><path d="M12 5v14M5 12h14" /></Glyph>;
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

type MoveMenuState = { id: string; anchor: "more" | "line"; up: boolean } | null;

// The rename form is the same in the list (inside the row) and in the grid (inside the opened card).
function ImageRenameForm({ value, inputRef, thumb, onChange, onSubmit, onCancel }: {
  value: string;
  inputRef: Ref<HTMLInputElement>;
  thumb?: React.ReactNode;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <form className="image-rename" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      {thumb}
      <input
        ref={inputRef}
        value={value}
        maxLength={IMAGE_TITLE_MAX}
        aria-label="图片标题"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); } }}
      />
      <button type="submit" className="primary-button">保存</button>
      <button type="button" className="ghost-button" onClick={onCancel}>取消</button>
    </form>
  );
}

// The opened picture: large preview, size, 目录 chip and the actions. The list shows it under the opened row, the grid
// as a full-width card under the opened tile; both use this one component.
function ImageDetail({ meta, src, copied, currentFolder, folders, colors, moveMenu, onToggleMenu, onMove, onCopy, onRename, onDelete }: {
  meta: ImageMeta;
  src: string | undefined;
  copied: boolean;
  currentFolder: string | null;
  folders: readonly ImageFolder[];
  colors: Record<string, string>;
  moveMenu: MoveMenuState;
  onToggleMenu: (anchor: "more" | "line", trigger: HTMLElement) => void;
  onMove: (folder: string | null) => void;
  onCopy: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const menuHere = moveMenu?.id === meta.id ? moveMenu : null;
  return (
    <div className="row-detail"><div className="row-detail-inner">
      <div className="image-preview">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- a decrypted object URL, not a file Next could optimise
          <img src={src} alt={meta.title} draggable={false} />
        ) : <span>正在读取…</span>}
      </div>
      <small className="image-facts">{sizeLabel(meta)}</small>
      <div className="image-folder-line">
        <span>目录</span>
        <div className="menu-wrap" data-move-menu>
          <button type="button" className="image-folder-button" aria-haspopup="menu" aria-expanded={menuHere?.anchor === "line"} aria-label={`目录：${currentFolder ?? "未分类"}，点击移动`} onClick={(event) => onToggleMenu("line", event.currentTarget)}>
            <i className="menu-dot" aria-hidden="true" style={{ background: currentFolder ? colors[currentFolder] : UNCATEGORIZED_COLOR }} />
            <span>{currentFolder ?? "未分类"}</span>
            <ChevronGlyph />
          </button>
          {menuHere?.anchor === "line" && <ImageMoveMenu folders={folders} colors={colors} current={currentFolder} up={menuHere.up} onMove={onMove} />}
        </div>
      </div>
      <div className="row-actions">
        <button type="button" className="primary-button" onClick={onCopy}><ArcCopyIcon copied={copied} />{copied ? "已复制" : "复制"}</button>
        <button type="button" className="ghost-button" onClick={onRename}>改名</button>
        <span className="spacer" />
        <div className="menu-wrap" data-move-menu>
          <button type="button" className="icon-button" aria-label={`更多操作 ${meta.title}`} aria-haspopup="menu" aria-expanded={menuHere?.anchor === "more"} onClick={(event) => onToggleMenu("more", event.currentTarget)}><MoreGlyph /></button>
          {menuHere?.anchor === "more" && <ImageMoveMenu folders={folders} colors={colors} current={currentFolder} up={menuHere.up} onMove={onMove} />}
        </div>
        <button type="button" className="ghost-button danger-text" onClick={onDelete}>删除</button>
      </div>
    </div></div>
  );
}

export function ImageSection({ library, query, compact, view, paused, onToast, onCounts, ref }: {
  // Images and folders are owned by the page (image-library.ts), so the sidebar and this list never disagree.
  library: ImageLibrary;
  query: string;
  compact: boolean;
  // 宫格 or 列表 in the full window; the mini window always shows the compact grid.
  view: ImageView;
  // A dialog is open on top of the page: drops and pastes must not add images behind it.
  paused: boolean;
  onToast: (message: string) => void;
  onCounts: (counts: ImageCounts) => void;
  ref?: Ref<ImageSectionHandle>;
}) {
  const { images, folders, filter, ready, loadError, getBlob, getThumb, markUsed } = library;
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  // The opened picture's full-size copy; until it has loaded the detail shows the thumbnail.
  const [fulls, setFulls] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [copiedId, setCopiedId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ImageMeta | null>(null);
  const [dragging, setDragging] = useState(false);
  // The "移动到" menu belongs to one row; it opens from the ⋯ button or from the 目录 line.
  const [moveMenu, setMoveMenu] = useState<MoveMenuState>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const thumbUrls = useRef(new Map<string, string>());
  const thumbPending = useRef(new Set<string>());
  const fullUrls = useRef(new Map<string, string>());
  const fullPending = useRef(new Set<string>());

  useEffect(() => {
    mounted.current = true;
    const urls = thumbUrls.current;
    const pending = thumbPending.current;
    const full = fullUrls.current;
    const fullWaiting = fullPending.current;
    return () => {
      mounted.current = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
      pending.clear();
      full.forEach((url) => URL.revokeObjectURL(url));
      full.clear();
      fullWaiting.clear();
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  // Tiles and rows show the small thumbnail (made once, then kept); only an opened picture loads its full-size original.
  useEffect(() => {
    if (!ready || !images) return;
    for (const meta of images) {
      if (thumbUrls.current.has(meta.id) || thumbPending.current.has(meta.id)) continue;
      thumbPending.current.add(meta.id);
      getThumb(meta.id)
        .then((blob) => {
          thumbPending.current.delete(meta.id);
          if (!mounted.current || thumbUrls.current.has(meta.id)) return;
          const url = URL.createObjectURL(blob);
          thumbUrls.current.set(meta.id, url);
          setThumbs((current) => ({ ...current, [meta.id]: url }));
        })
        .catch(() => { thumbPending.current.delete(meta.id); });
    }
  }, [ready, images, getThumb]);

  const inFolder = useMemo(() => filterImagesByFolder(images ?? [], filter, folders), [images, filter, folders]);
  const shown = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return inFolder.filter((meta) => terms.every((term) => meta.title.toLowerCase().includes(term)));
  }, [inFolder, query]);
  const colors = useMemo(() => imageFolderColors(folders), [folders]);
  const total = images?.length ?? 0;
  useEffect(() => { onCounts({ total, shown: shown.length }); }, [onCounts, total, shown.length]);

  const openId = shown.some((meta) => meta.id === selectedId) ? selectedId : "";
  useEffect(() => {
    if (!ready || !openId || fullUrls.current.has(openId) || fullPending.current.has(openId)) return;
    fullPending.current.add(openId);
    getBlob(openId)
      .then((blob) => {
        fullPending.current.delete(openId);
        if (!mounted.current || fullUrls.current.has(openId)) return;
        const url = URL.createObjectURL(blob);
        fullUrls.current.set(openId, url);
        setFulls((current) => ({ ...current, [openId]: url }));
      })
      .catch(() => { fullPending.current.delete(openId); });
  }, [ready, openId, getBlob]);
  // The opened row grows downwards; once it has finished opening, scroll so the clicked picture (and as much of its
  // card as fits) is fully visible.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openId) return;
    const timer = setTimeout(() => {
      const list = listRef.current;
      const id = CSS.escape(openId);
      const card = list?.querySelector(`[data-image-id="${id}"]`);
      if (!list || !card) return;
      const tile = list.querySelector(`[data-tile-id="${id}"]`);
      // The list itself or the page scrolls, depending on the window height: use whichever the picture is in.
      let scroller: HTMLElement | null = list;
      while (scroller && !(scroller.scrollHeight > scroller.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
      const view = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const delta = detailScrollDelta(view.top, view.bottom, (tile ?? card).getBoundingClientRect().top, card.getBoundingClientRect().bottom);
      if (Math.abs(delta) > 1) (scroller ?? window).scrollBy({ top: delta, behavior: "smooth" });
    }, 280);
    return () => clearTimeout(timer);
  }, [openId]);
  const renamingId = renaming?.id;
  useEffect(() => {
    if (!renamingId) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingId]);

  const menuOpenId = moveMenu?.id;
  useEffect(() => {
    if (!menuOpenId) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-move-menu]")) setMoveMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setMoveMenu(null);
    };
    window.addEventListener("pointerdown", closeOnOutsidePress, true);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePress, true);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [menuOpenId]);
  function forgetThumb(id: string) {
    const fullUrl = fullUrls.current.get(id);
    if (fullUrl) URL.revokeObjectURL(fullUrl);
    fullUrls.current.delete(id);
    setFulls((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
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
    // Images go into the folder that is open; in 全部图片 and 未分类 they stay without a folder.
    const folder = folderOfImageFilter(filter);
    let added = 0;
    let rejected = 0;
    let firstProblem = "";
    for (const file of files) {
      const problem = validateImageFile(file);
      if (problem) { rejected += 1; firstProblem ||= problem; continue; }
      try {
        await library.addImage(file, titleForFile(file, pasted), folder);
        added += 1;
      } catch (error) {
        rejected += 1;
        firstProblem ||= readableMessage(error, "图片保存失败，请重试");
      }
    }
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
    if (!ready) return;
    try {
      const png = await toPngBytes(await getBlob(meta.id));
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
    markUsed(meta.id).catch(() => undefined);
  }

  async function submitRename() {
    if (!renaming) return;
    try {
      await library.rename(renaming.id, renaming.value);
      setRenaming(null);
      onToast("已改名");
    } catch {
      onToast("改名失败，请重试");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    await library.remove(id);
    forgetThumb(id);
    setDeleteTarget(null);
    setSelectedId("");
    onToast("图片已删除");
  }

  function toggleRow(id: string) {
    setRenaming(null);
    setMoveMenu(null);
    setSelectedId((current) => current === id ? "" : id);
  }

  function toggleMoveMenu(id: string, anchor: "more" | "line", trigger: HTMLElement) {
    const rect = trigger.getBoundingClientRect();
    const room = window.innerHeight - rect.bottom;
    const wanted = Math.min(260, (folders.length + 2) * 30 + 16);
    const up = room < wanted + 8 && rect.top > room;
    setMoveMenu((current) => current?.id === id && current.anchor === anchor ? null : { id, anchor, up });
  }

  async function moveTo(meta: ImageMeta, folder: string | null) {
    setMoveMenu(null);
    await library.moveImage(meta.id, folder);
  }

  // An image whose folder is gone counts as 未分类 (the library never leaves one, but a stale name must not show up).
  const folderOfMeta = (meta: ImageMeta) => meta.folder && folders.some((entry) => entry.name === meta.folder) ? meta.folder : null;

  const thumb = (meta: ImageMeta) => (
    <span className="image-thumb" aria-hidden="true">
      {thumbs[meta.id] && (
        // eslint-disable-next-line @next/next/no-img-element -- a decrypted object URL, not a file Next could optimise
        <img src={thumbs[meta.id]} alt="" draggable={false} />
      )}
    </span>
  );

  // A tile shows the picture cropped to a square; the object URL is the same one the thumbnail and preview use.
  // D-020: the picture sits 6% in from every edge (even a square one) on a colourless frosted-glass surface (CSS only, no picture colours).
  const tileImage = (meta: ImageMeta) => thumbs[meta.id] && (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- a decrypted object URL, not a file Next could optimise */}
      <img className="image-tile-pic" src={thumbs[meta.id]} alt="" draggable={false} />
    </>
  );

  const detail = (meta: ImageMeta) => (
    <ImageDetail
      meta={meta}
      src={fulls[meta.id] ?? thumbs[meta.id]}
      copied={copiedId === meta.id}
      currentFolder={folderOfMeta(meta)}
      folders={folders}
      colors={colors}
      moveMenu={moveMenu}
      onToggleMenu={(anchor, trigger) => toggleMoveMenu(meta.id, anchor, trigger)}
      onMove={(folder) => void moveTo(meta, folder)}
      onCopy={() => void copyImage(meta)}
      onRename={() => setRenaming({ id: meta.id, value: meta.title })}
      onDelete={() => setDeleteTarget(meta)}
    />
  );

  let body: React.ReactNode;
  if (loadError) {
    body = <div className="native-empty"><strong>{loadError}</strong><button type="button" className="secondary-button" onClick={library.retry}>重试</button></div>;
  } else if (!images) {
    body = <div className="native-empty image-loading"><span>正在读取图片…</span></div>;
  } else if (total === 0 && filter === IMAGE_FILTER_ALL) {
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
    const folderName = folderOfImageFilter(filter);
    body = query.trim() || inFolder.length > 0
      ? <div className="native-empty"><strong>没有匹配的图片</strong><span>换个词搜索试试</span></div>
      : <div className="native-empty">
        <strong>{folderName ? "这个目录还是空的" : "没有未分类的图片"}</strong>
        <span>{compact ? "回到完整窗口添加图片" : folderName ? "点右上角的「新增图片」，会放进这个目录" : "新增的图片会先放在这里"}</span>
      </div>;
  } else if (compact) {
    body = shown.map((meta) => (
      <article key={meta.id} className={`mini-row image-row image-tile mini-tile ${copiedId === meta.id ? "copied" : ""}`}>
        <button type="button" className="image-tile-main" onClick={() => void copyImage(meta)} aria-label={copiedId === meta.id ? `已复制 ${meta.title}` : `复制 ${meta.title}`}>
          <span className="image-tile-thumb">{tileImage(meta)}{copiedId === meta.id && <span className="mini-copied">已复制</span>}</span>
          <strong className="image-tile-title">{meta.title}</strong>
        </button>
        {copiedId === meta.id && <span className="copy-status" role="status" aria-live="polite">已复制</span>}
      </article>
    ));
  } else if (view === "grid") {
    const tiles = shown.map((meta) => {
      const open = openId === meta.id;
      const copied = copiedId === meta.id;
      return (
        <div key={meta.id} data-tile-id={meta.id} className={`image-tile ${open ? "selected" : ""} ${copied ? "copied" : ""}`}>
          <button type="button" className="image-tile-main" onClick={() => toggleRow(meta.id)} aria-expanded={open} aria-label={`${open ? "已展开" : "展开"} ${meta.title}`}>
            <span className="image-tile-thumb">{tileImage(meta)}</span>
            <strong className="image-tile-title">{meta.title}</strong>
          </button>
          <button type="button" className="image-tile-copy" onClick={() => void copyImage(meta)} aria-label={copied ? `已复制 ${meta.title}` : `复制 ${meta.title}`} title={copied ? "已复制" : "复制"}><ArcCopyIcon copied={copied} size={15} /></button>
          {copied && <span className="copy-status" role="status" aria-live="polite">已复制</span>}
        </div>
      );
    });
    const openMeta = shown.find((meta) => meta.id === openId);
    const at = gridCardInsertIndex(shown.findIndex((meta) => meta.id === openId), shown.length);
    if (openMeta && at >= 0) {
      const editing = renaming?.id === openMeta.id ? renaming : null;
      tiles.splice(at, 0, (
        <article key={`card:${openMeta.id}`} data-image-id={openMeta.id} className="native-row image-row image-card selected">
          <div className="row-line">
            {editing ? (
              <ImageRenameForm value={editing.value} inputRef={renameInputRef} onChange={(value) => setRenaming({ id: openMeta.id, value })} onSubmit={() => void submitRename()} onCancel={() => setRenaming(null)} />
            ) : (
              <h2 className="image-card-title">{openMeta.title}</h2>
            )}
          </div>
          {detail(openMeta)}
        </article>
      ));
    }
    body = tiles;
  } else {
    body = shown.map((meta) => {
      const open = openId === meta.id;
      const copied = copiedId === meta.id;
      const editing = open && renaming?.id === meta.id ? renaming : null;
      return (
        <article key={meta.id} data-image-id={meta.id} className={`native-row image-row ${open ? "selected" : ""} ${copied ? "copied" : ""}`}>
          <div className="row-line">
            {editing ? (
              <ImageRenameForm value={editing.value} inputRef={renameInputRef} thumb={thumb(meta)} onChange={(value) => setRenaming({ id: meta.id, value })} onSubmit={() => void submitRename()} onCancel={() => setRenaming(null)} />
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
          {open && detail(meta)}
        </article>
      );
    });
  }

  // Only real pictures lay out as a grid; loading, errors and empty states keep the plain centred layout.
  const gridShown = !loadError && !!images && shown.length > 0 && (compact || view === "grid");

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
      <div ref={listRef} className={`native-list list-switch image-list ${compact ? "mini-list" : ""} ${gridShown ? "image-grid" : ""}`}>{body}</div>
      {dragging && <div className="image-drop-hint" aria-hidden="true">松开即可添加图片</div>}
      {deleteTarget && createPortal(<ImageDeleteDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} />, document.body)}
    </div>
  );
}
