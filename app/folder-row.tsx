import type { Ref } from "react";
import { Icon } from "./ui-atoms";

export type FolderRenaming = { from: string; value: string; error: string };

// One row of the folder list in the sidebar: name and count, rename form, ⋯ menu button and drag handle
// (moved out of page.tsx unchanged).
export function FolderRow({ folder, sortable, active, count, color, dragging, dragOver, renaming, renameInputRef, menuOpen, onSelect, onSubmitRename, onRenameChange, onRenameCancel, onRenameBlur, onOpenMenu, onBeginDrag }: {
  folder: string;
  sortable: boolean;
  active: boolean;
  count: number;
  color: string | undefined;
  dragging: boolean;
  dragOver: boolean;
  renaming: FolderRenaming | null;
  renameInputRef: Ref<HTMLInputElement>;
  menuOpen: boolean;
  onSelect: () => void;
  onSubmitRename: () => void;
  onRenameChange: (renaming: FolderRenaming) => void;
  onRenameCancel: () => void;
  onRenameBlur: () => void;
  onOpenMenu: (rect: DOMRect) => void;
  onBeginDrag: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div {...(sortable ? { "data-sort-scope": "folder", "data-sort-id": folder } : {})} className={`directory-row ${sortable ? "" : "fixed"} ${active ? "active" : ""} ${dragging ? "dragging" : ""} ${dragOver ? "drag-over" : ""}`}>
      {sortable && !renaming && <button type="button" className="folder-drag-handle" aria-label={`拖动目录 ${folder}`} title="按住拖动排序" onPointerDown={onBeginDrag}><Icon name="grip" /></button>}
      {renaming ? (
        <form className="directory-rename" onSubmit={(event) => { event.preventDefault(); onSubmitRename(); }}>
          <i className="directory-color-marker" aria-hidden="true" style={{ background: color }} />
          <input ref={renameInputRef} value={renaming.value} aria-label={`重命名 ${folder}`} aria-invalid={Boolean(renaming.error)} maxLength={30}
            onChange={(event) => onRenameChange({ ...renaming, value: event.target.value, error: "" })}
            onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onRenameCancel(); } }}
            onBlur={onRenameBlur} />
          {renaming.error && <small className="directory-error" role="alert">{renaming.error}</small>}
        </form>
      ) : (
        <button type="button" className="nav-item directory-main" onClick={onSelect} title={folder}><span className="nav-icon"><i className="directory-color-marker" aria-hidden="true" style={{ background: color }} /></span><span className="nav-label">{folder}</span><b>{count}</b></button>
      )}
      {!renaming && <button type="button" className="folder-more" aria-label={`管理目录 ${folder}`} aria-haspopup="menu" aria-expanded={menuOpen} title="重命名、颜色、删除"
        onClick={(event) => onOpenMenu(event.currentTarget.getBoundingClientRect())}><Icon name="more" /></button>}
      
    </div>
  );
}
