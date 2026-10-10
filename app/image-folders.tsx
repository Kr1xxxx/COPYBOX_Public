"use client";

// The folder (目录) UI of the 图片 section: the sidebar list, the mini-window select and the "move to" menu.
// Same look and behaviour as the 话术 sidebar (docs/specs/image-folders.md). Data and actions come from image-library.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArcMenu } from "./arc/menu";
import { Icon } from "./ui-atoms";
import {
  IMAGE_FILTER_ALL,
  IMAGE_FILTER_PINNED,
  countPinnedImages,
  IMAGE_FILTER_UNCATEGORIZED,
  countImagesByFolder,
  imageFolderColors,
  imageFolderFilter,
} from "./image-folders-core";
import type { ImageLibrary } from "./image-library";
import { IMAGE_FOLDER_NAME_MAX, normalizeFolderName, type ImageFolder } from "./image-store";
import { CATEGORY_PALETTE, UNCATEGORIZED_COLOR } from "./category-colors";

function Glyph({ children }: { children: React.ReactNode }) {
  return <svg className="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}
export const PlusGlyph = () => <Glyph><path d="M12 5v14M5 12h14" /></Glyph>;
export const MoreGlyph = () => <Glyph><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></Glyph>;
export const ChevronGlyph = () => <Glyph><path d="m6 9 6 6 6-6" /></Glyph>;
const GridGlyph = () => <Glyph><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M4 10h16" /></Glyph>;

// "移动到" menu: every folder except the current one, plus 未分类. Used by the row's ⋯ button and the 目录 line.
export function ImageMoveMenu({ folders, colors, current, up, onMove }: {
  folders: readonly ImageFolder[];
  colors: Record<string, string>;
  current: string | null;
  // Opens upwards when there is no room below.
  up: boolean;
  onMove: (folder: string | null) => void;
}) {
  const targets = folders.filter((folder) => folder.name !== current);
  return (
    <ArcMenu className={`dropdown row-menu image-move-menu ${up ? "up" : ""}`} label="移动到" origin={up ? "bottom left" : "top left"}>
      <p className="menu-label">移动到</p>
      {targets.map((folder) => (
        <button type="button" role="menuitem" key={folder.name} onClick={() => onMove(folder.name)}>
          <i className="menu-dot" aria-hidden="true" style={{ background: colors[folder.name] }} /><span className="menu-text">{folder.name}</span>
        </button>
      ))}
      {current !== null && (
        <button type="button" role="menuitem" onClick={() => onMove(null)}>
          <i className="menu-dot" aria-hidden="true" style={{ background: UNCATEGORIZED_COLOR }} /><span className="menu-text">未分类</span>
        </button>
      )}
      {targets.length === 0 && current === null && <p className="menu-empty">还没有目录，先在左边新建一个</p>}
    </ArcMenu>
  );
}

// Mini window: a select next to the search box, like the 话术 mini window.
export function ImageFolderSelect({ library }: { library: ImageLibrary }) {
  return (
    <label className="mini-folder">
      <span className="sr-only">目录</span>
      <select value={library.filter} onChange={(event) => library.setFilter(event.target.value)}>
        <option value={IMAGE_FILTER_ALL}>全部</option>
        <option value={IMAGE_FILTER_PINNED}>收藏</option>
        {library.folders.map((folder) => <option key={folder.name} value={imageFolderFilter(folder.name)}>{folder.name}</option>)}
        <option value={IMAGE_FILTER_UNCATEGORIZED}>未分类</option>
      </select>
      <ChevronGlyph />
    </label>
  );
}

// Sidebar in the 图片 view: 全部图片, the folders, 未分类. 设置 stays in the page's footer.
export function ImageFolderNav({ library }: { library: ImageLibrary }) {
  const { folders, filter, setFilter } = library;
  const counts = useMemo(() => countImagesByFolder(library.images ?? [], folders), [library.images, folders]);
  const pinnedCount = useMemo(() => countPinnedImages(library.images ?? []), [library.images]);
  const colors = useMemo(() => imageFolderColors(folders), [folders]);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ from: string; value: string } | null>(null);
  const [menu, setMenu] = useState("");
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [deleteArm, setDeleteArm] = useState("");
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const newInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);

  const creating = newFolder !== null;
  useEffect(() => { if (creating) newInputRef.current?.focus(); }, [creating]);
  const renamingFrom = renaming?.from;
  useEffect(() => {
    if (!renamingFrom) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingFrom]);

  const menuFolder = menu && folders.some((folder) => folder.name === menu) ? menu : "";
  useEffect(() => {
    if (!menuFolder) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setMenu("");
      setDeleteArm("");
    };
    window.addEventListener("keydown", close, true);
    return () => window.removeEventListener("keydown", close, true);
  }, [menuFolder]);

  function startNewFolder() {
    setNewFolder("");
    setMenu("");
    setRenaming(null);
  }

  function cancelNewFolder() {
    setNewFolder(null);
    window.setTimeout(() => createButtonRef.current?.focus(), 0);
  }

  async function submitNewFolder() {
    if (newFolder === null || busy.current) return;
    busy.current = true;
    try {
      const name = await library.createFolder(newFolder);
      if (name === null) return; // The message is in the toast; the name stays so it can be fixed.
      setNewFolder(null);
      setFilter(imageFolderFilter(name));
    } finally {
      busy.current = false;
    }
  }

  async function submitRename() {
    if (!renaming || busy.current) return;
    const { from, value } = renaming;
    if (normalizeFolderName(value) === from) { setRenaming(null); return; }
    busy.current = true;
    try {
      const name = await library.renameFolder(from, value);
      if (name !== null) setRenaming(null);
    } finally {
      busy.current = false;
    }
  }

  async function removeFolder(name: string) {
    setMenu("");
    setDeleteArm("");
    await library.deleteFolder(name);
  }

  const folderRow = (folder: ImageFolder) => {
    const name = folder.name;
    const active = filter === imageFolderFilter(name);
    const isRenaming = renaming?.from === name;
    return (
      <div key={name} className={`directory-row fixed ${active ? "active" : ""}`}>
        {isRenaming ? (
          <form className="directory-rename" onSubmit={(event) => { event.preventDefault(); void submitRename(); }}>
            <i className="directory-color-marker" aria-hidden="true" style={{ background: colors[name] }} />
            <input ref={renameInputRef} value={renaming.value} aria-label={`重命名 ${name}`} maxLength={IMAGE_FOLDER_NAME_MAX}
              onChange={(event) => setRenaming({ from: name, value: event.target.value })}
              onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setRenaming(null); } }}
              onBlur={() => window.setTimeout(() => setRenaming((current) => current?.from === name ? null : current), 120)} />
          </form>
        ) : (
          <button type="button" className="nav-item directory-main" onClick={() => setFilter(imageFolderFilter(name))} title={name} aria-current={active ? "page" : undefined}>
            <span className="nav-icon"><i className="directory-color-marker" aria-hidden="true" style={{ background: colors[name] }} /></span>
            <span className="nav-label">{name}</span><b>{counts.byFolder[name] ?? 0}</b>
          </button>
        )}
        {!isRenaming && <button type="button" className="folder-more" aria-label={`管理目录 ${name}`} aria-haspopup="menu" aria-expanded={menu === name} title="重命名、颜色、删除"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setDeleteArm("");
            setMenuPos({ top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 270)), left: rect.left });
            setMenu((value) => value === name ? "" : name);
          }}><MoreGlyph /></button>}
      </div>
    );
  };

  const menuColor = menuFolder ? colors[menuFolder]?.toLowerCase() : "";
  const menuCount = menuFolder ? counts.byFolder[menuFolder] ?? 0 : 0;

  return (
    <>
      <nav className="nav-list" aria-label="快捷入口">
        <button type="button" className={`nav-item image-all ${filter === IMAGE_FILTER_ALL ? "active" : ""}`} aria-current={filter === IMAGE_FILTER_ALL ? "page" : undefined} onClick={() => setFilter(IMAGE_FILTER_ALL)}>
          <span className="nav-icon"><GridGlyph /></span><span className="nav-label">全部图片</span><b>{counts.total}</b>
        </button>
        <button type="button" className={`nav-item image-pinned ${filter === IMAGE_FILTER_PINNED ? "active" : ""}`} aria-current={filter === IMAGE_FILTER_PINNED ? "page" : undefined} onClick={() => setFilter(IMAGE_FILTER_PINNED)}>
          <span className="nav-icon"><Icon name="star" /></span><span className="nav-label">收藏</span><b>{pinnedCount}</b>
        </button>
      </nav>
      <div className="nav-heading">
        <span>目录</span>
        <button ref={createButtonRef} type="button" onClick={startNewFolder} aria-label="新建目录" title="新建目录"><PlusGlyph /></button>
      </div>
      <div className="nav-scroll directory-list">
        {folders.map(folderRow)}
        {newFolder !== null && (
          <form className="directory-new" onSubmit={(event) => { event.preventDefault(); void submitNewFolder(); }}>
            <i className="directory-color-marker hollow" aria-hidden="true" />
            <input ref={newInputRef} value={newFolder} placeholder="目录名称" title="输入名称，回车创建" aria-label="新目录名称" maxLength={IMAGE_FOLDER_NAME_MAX}
              onChange={(event) => setNewFolder(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelNewFolder(); } }}
              onBlur={() => window.setTimeout(() => setNewFolder((current) => current !== null && !current.trim() ? null : current), 120)} />
          </form>
        )}
        <div className={`directory-row fixed ${filter === IMAGE_FILTER_UNCATEGORIZED ? "active" : ""}`}>
          <button type="button" className="nav-item directory-main" aria-current={filter === IMAGE_FILTER_UNCATEGORIZED ? "page" : undefined} onClick={() => setFilter(IMAGE_FILTER_UNCATEGORIZED)}>
            <span className="nav-icon"><i className="directory-color-marker hollow" aria-hidden="true" /></span><span className="nav-label">未分类</span><b>{counts.uncategorized}</b>
          </button>
        </div>
      </div>
      {menuFolder && createPortal(
        <>
          <div className="menu-scrim" role="presentation" onMouseDown={() => { setMenu(""); setDeleteArm(""); }} />
          <div className="dropdown folder-menu" role="menu" aria-label={`管理目录 ${menuFolder}`} style={{ top: menuPos.top, left: menuPos.left }}>
            <button type="button" role="menuitem" onClick={() => { setMenu(""); setRenaming({ from: menuFolder, value: menuFolder }); }}>重命名</button>
            <p className="menu-label">颜色</p>
            <div className="swatches" role="group" aria-label="目录颜色">
              {CATEGORY_PALETTE.map((color) => (
                <button key={color} type="button" aria-label={`颜色 ${color}`} aria-pressed={menuColor === color.toLowerCase()} className={menuColor === color.toLowerCase() ? "on" : ""} style={{ background: color }}
                  onClick={() => { setMenu(""); void library.setFolderColor(menuFolder, color); }} />
              ))}
            </div>
            <div className="menu-divider" />
            {deleteArm === menuFolder
              ? <button type="button" role="menuitem" className="danger" onClick={() => void removeFolder(menuFolder)}>{menuCount > 0 ? `确认删除，${menuCount} 张移到未分类` : "确认删除"}</button>
              : <button type="button" role="menuitem" className="danger" onClick={() => setDeleteArm(menuFolder)}>删除目录…</button>}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
