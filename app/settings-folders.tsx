"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ArcCollapsible } from "./arc/collapsible";
import { CATEGORY_PALETTE } from "./category-colors";
import type { ItemKind } from "./clipbox-core";
import { FOLDER_SHORT_NAME_ERROR, normalizeFolderShortName } from "./folder-short-name";
import { ReorderHandle } from "./reorder-handle";
import { Icon } from "./ui-atoms";
import { usePointerReorder } from "./use-pointer-reorder";
import { useSortFlipAnimation } from "./use-sort-flip-animation";

// 图片 is not an ItemKind (its folders live in the image store), so the groups take either.
export type SettingsFolderKind = ItemKind | "image";
// Image folders have no saved order and no automatic colour, and count 张 instead of 条.
export type SettingsFolderGroup = {
  kind: SettingsFolderKind; title: string; unit: string; nameMax: number; sortable: boolean; autoColor: boolean;
  // `shortName`: the one the person set ("" = none); `defaultShortName`: what the mini window shows without one.
  folders: { name: string; count: number; color: string; locked: boolean; shortName: string; defaultShortName: string }[];
};

export function SettingsFolders({ groups, onAdd, onRename, onDelete, onColor, onShortName, onMove, onReorder }: {
  groups: SettingsFolderGroup[];
  onAdd: (kind: SettingsFolderKind, name: string) => Promise<string>;
  onRename: (kind: SettingsFolderKind, from: string, to: string) => Promise<string>;
  onDelete: (kind: SettingsFolderKind, folder: string) => Promise<string>;
  onColor: (kind: SettingsFolderKind, folder: string, color: string | null) => void;
  onShortName: (kind: SettingsFolderKind, folder: string, shortName: string | null) => Promise<string>;
  onMove: (kind: SettingsFolderKind, folder: string, delta: -1 | 1) => void;
  onReorder: (kind: SettingsFolderKind, source: string, target: string) => void;
}) {
  const { prepareSortAnimation } = useSortFlipAnimation();
  // Row ids are "<kind>:<name>"; a drag only counts when both rows belong to the same list.
  const reorder = usePointerReorder({
    enabled: true,
    scope: "settings-folder",
    onDrop: (sourceId, targetId) => {
      const kind = sourceId.slice(0, sourceId.indexOf(":")) as SettingsFolderKind;
      if (targetId.slice(0, targetId.indexOf(":")) !== kind) return;
      prepareSortAnimation("settings-folder");
      onReorder(kind, sourceId.slice(kind.length + 1), targetId.slice(kind.length + 1));
    },
  });
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
  const [adding, setAdding] = useState<{ kind: SettingsFolderKind; value: string } | null>(null);
  const [colorKey, setColorKey] = useState("");
  // The 「⋯」 panel (short name on the mini window). Only one panel, colour or 「⋯」, is open at a time.
  const [more, setMore] = useState<{ key: string; value: string; error: string } | null>(null);
  const moreRef = useRef<HTMLInputElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [armKey, setArmKey] = useState("");
  const [error, setError] = useState("");
  const editRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const editingKey = editing?.key;
  const addingKind = adding?.kind;
  useEffect(() => { if (editingKey) { editRef.current?.focus(); editRef.current?.select(); } }, [editingKey]);
  useEffect(() => { if (addingKind) addRef.current?.focus(); }, [addingKind]);
  const moreKey = more?.key;
  useEffect(() => { if (moreKey) { moreRef.current?.focus(); moreRef.current?.select(); } }, [moreKey]);

  function closeMore(returnFocus: boolean) {
    setMore(null);
    if (returnFocus) moreTriggerRef.current?.focus();
  }

  // Esc in the panel closes only the panel (the form is marked data-local-esc, so Settings stays open).
  function escClosesMore(event: ReactKeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    closeMore(true);
  }

  async function saveShortName(kind: SettingsFolderKind, folder: string, value: string | null) {
    if (!more) return;
    // Checked here first, so a value that is too long is never sent anywhere.
    if (value !== null && normalizeFolderShortName(value) === null) { setMore({ ...more, error: FOLDER_SHORT_NAME_ERROR }); return; }
    const failure = await onShortName(kind, folder, value);
    if (failure) setMore((current) => current && { ...current, error: failure });
    else closeMore(true);
  }

  async function finish(task: Promise<string>, done: () => void) {
    const failure = await task;
    setError(failure);
    if (!failure) done();
  }

  return (
    <div className="settings-folders">
      {groups.map((group) => (
        <ArcCollapsible className="settings-folder-group" key={group.kind} title={group.title} meta={`${group.folders.length} 个目录`}>
          <div className="settings-folder-head">
            <button type="button" className="secondary-button" onClick={() => { setError(""); setAdding({ kind: group.kind, value: "" }); }}>新建目录</button>
          </div>
          {adding?.kind === group.kind && (
            <form className="settings-folder-form" data-local-esc onSubmit={(event) => { event.preventDefault(); void finish(onAdd(group.kind, adding.value), () => setAdding(null)); }}>
              <input ref={addRef} value={adding.value} maxLength={group.nameMax} placeholder="目录名称" aria-label={`新建${group.title}`} onChange={(event) => setAdding({ kind: group.kind, value: event.target.value })} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setAdding(null); setError(""); } }} />
              <button type="submit" className="secondary-button">创建</button>
              <button type="button" className="secondary-button" onClick={() => { setAdding(null); setError(""); }}>取消</button>
            </form>
          )}
          {group.folders.length === 0 && <p className="settings-note">还没有目录</p>}
          {group.folders.map((folder, index) => {
            const key = `${group.kind}:${folder.name}`;
            const previous = group.folders[index - 1];
            const next = group.folders[index + 1];
            return (
              <div className={`settings-folder ${reorder.draggingId === key ? "dragging" : ""} ${reorder.overId === key && reorder.draggingId !== key ? "drag-over" : ""}`} key={key} {...(!group.sortable ? {} : { "data-sort-scope": "settings-folder", "data-sort-id": key })}>
                <div className="settings-folder-row">
                  {!group.sortable || editing?.key === key
                    ? <span className="settings-folder-grip placeholder" aria-hidden="true" />
                    : <ReorderHandle className="settings-folder-grip" label={`拖动排序 ${folder.name}`} title="按住拖动，点一下可上移下移" canMoveUp={Boolean(previous)} canMoveDown={Boolean(next)} onBeginDrag={(event) => reorder.beginPointerDrag(event, key)} onMove={(delta) => onMove(group.kind, folder.name, delta)}><Icon name="grip" /></ReorderHandle>}
                  <button type="button" className="settings-folder-dot" style={{ background: folder.color }} aria-label={`修改颜色 ${folder.name}`} aria-expanded={colorKey === key} onClick={() => { setMore(null); setColorKey(colorKey === key ? "" : key); }} />
                  {editing?.key === key ? (
                    <form className="settings-folder-form" data-local-esc onSubmit={(event) => { event.preventDefault(); void finish(onRename(group.kind, folder.name, editing.value), () => setEditing(null)); }}>
                      <input ref={editRef} value={editing.value} maxLength={group.nameMax} aria-label={`重命名 ${folder.name}`} onChange={(event) => setEditing({ key, value: event.target.value })} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setEditing(null); setError(""); } }} />
                      <button type="submit" className="secondary-button">保存</button>
                      <button type="button" className="secondary-button" onClick={() => { setEditing(null); setError(""); }}>取消</button>
                    </form>
                  ) : (
                    <>
                      <span className="settings-folder-name" title={folder.name}>{folder.name}</span>
                      <small className="settings-folder-count">{folder.count} {group.unit}</small>
                      {folder.locked ? <span className="settings-folder-fixed" title="标准话术目录不能改名或删除">固定</span> : <span className="settings-folder-actions">
                        {group.sortable && <>
                        <button type="button" className="settings-mini-button" aria-label={`上移 ${folder.name}`} title="上移" disabled={!previous} onClick={() => onMove(group.kind, folder.name, -1)}>↑</button>
                        <button type="button" className="settings-mini-button" aria-label={`下移 ${folder.name}`} title="下移" disabled={!next} onClick={() => onMove(group.kind, folder.name, 1)}>↓</button>
                        </>}
                        <button type="button" className="settings-mini-button" disabled={folder.locked} title={folder.locked ? "标准话术目录不能改名" : undefined} onClick={() => { setError(""); setArmKey(""); setMore(null); setEditing({ key, value: folder.name }); }}>改名</button>
                        {armKey === key
                          ? <button type="button" className="settings-mini-button danger" onClick={() => { setArmKey(""); void finish(onDelete(group.kind, folder.name), () => undefined); }}>{group.kind !== "snippet" && folder.count > 0 ? `确认删除（${folder.count} ${group.unit}移到未分类）` : "确认删除"}</button>
                          : <button type="button" className="settings-mini-button danger" disabled={folder.locked} title={folder.locked ? "标准话术目录不能删除" : undefined} onClick={() => { setError(""); setArmKey(key); }}>删除</button>}
                        <button type="button" className="settings-mini-button settings-folder-more-button" aria-label={`更多设置 ${folder.name}`} title="更多设置" aria-expanded={more?.key === key} onClick={(event) => {
                          if (more?.key === key) { closeMore(false); return; }
                          moreTriggerRef.current = event.currentTarget;
                          setColorKey(""); setArmKey(""); setError("");
                          setMore({ key, value: folder.shortName, error: "" });
                        }}>⋯</button>
                      </span>}
                    </>
                  )}
                </div>
                {more?.key === key && (
                  <form className="settings-folder-more" data-local-esc aria-label={`${folder.name} 的更多设置`} onSubmit={(event) => { event.preventDefault(); void saveShortName(group.kind, folder.name, more.value); }}>
                    <label className="settings-folder-more-field">
                      <span>迷你窗口显示为</span>
                      <input ref={moreRef} value={more.value} placeholder={folder.defaultShortName} aria-label={`迷你窗口显示为 ${folder.name}`} aria-invalid={more.error ? true : undefined} aria-describedby={more.error ? "settings-short-name-error" : undefined} onChange={(event) => setMore({ key, value: event.target.value, error: "" })} onKeyDown={escClosesMore} />
                    </label>
                    <button type="submit" className="settings-mini-button" onKeyDown={escClosesMore}>保存</button>
                    <button type="button" className="settings-mini-button" disabled={!folder.shortName && !more.value.trim()} onKeyDown={escClosesMore} onClick={() => void saveShortName(group.kind, folder.name, null)}>恢复默认</button>
                    <button type="button" className="settings-mini-button" onKeyDown={escClosesMore} onClick={() => closeMore(true)}>取消</button>
                    {more.error && <p className="settings-folder-more-error" id="settings-short-name-error" role="alert">{more.error}</p>}
                  </form>
                )}
                {colorKey === key && (
                  <div className="settings-swatches" role="group" aria-label={`${folder.name} 的颜色`}>
                    {group.autoColor && <button type="button" className="settings-mini-button" onClick={() => onColor(group.kind, folder.name, null)}>自动</button>}
                    {CATEGORY_PALETTE.map((color) => <button key={color} type="button" aria-label={`颜色 ${color}`} aria-pressed={folder.color.toLowerCase() === color.toLowerCase()} className={folder.color.toLowerCase() === color.toLowerCase() ? "on" : ""} style={{ background: color }} onClick={() => onColor(group.kind, folder.name, color)} />)}
                  </div>
                )}
              </div>
            );
          })}
        </ArcCollapsible>
      ))}
      {error && <p className="settings-error" role="alert">{error}</p>}
      <p className="settings-note">标准话术目录固定，只能改颜色。话术目录里还有内容时不能删除。图片目录删除后，里面的图片会移到未分类。</p>
    </div>
  );
}
