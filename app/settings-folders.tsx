"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORY_PALETTE } from "./category-colors";
import type { ItemKind } from "./clipbox-core";
import { PLAIN_NOTES, SECRET_WORD } from "./platform";
import { usePointerReorder } from "./use-pointer-reorder";
import { useSortFlipAnimation } from "./use-sort-flip-animation";

export type SettingsFolderGroup = { kind: ItemKind; title: string; folders: { name: string; count: number; color: string; locked: boolean }[] };

export function SettingsFolders({ groups, onAdd, onRename, onDelete, onColor, onMove, onReorder }: {
  groups: SettingsFolderGroup[];
  onAdd: (kind: ItemKind, name: string) => Promise<string>;
  onRename: (kind: ItemKind, from: string, to: string) => Promise<string>;
  onDelete: (kind: ItemKind, folder: string) => Promise<string>;
  onColor: (kind: ItemKind, folder: string, color: string | null) => void;
  onMove: (kind: ItemKind, folder: string, delta: -1 | 1) => void;
  onReorder: (kind: ItemKind, source: string, target: string) => void;
}) {
  const { prepareSortAnimation } = useSortFlipAnimation();
  // Row ids are "<kind>:<name>"; a drag only counts when both rows belong to the same list.
  const reorder = usePointerReorder({
    enabled: true,
    scope: "settings-folder",
    onDrop: (sourceId, targetId) => {
      const kind = sourceId.slice(0, sourceId.indexOf(":")) as ItemKind;
      if (targetId.slice(0, targetId.indexOf(":")) !== kind) return;
      prepareSortAnimation("settings-folder");
      onReorder(kind, sourceId.slice(kind.length + 1), targetId.slice(kind.length + 1));
    },
  });
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
  const [adding, setAdding] = useState<{ kind: ItemKind; value: string } | null>(null);
  const [colorKey, setColorKey] = useState("");
  const [armKey, setArmKey] = useState("");
  const [error, setError] = useState("");
  const editRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const editingKey = editing?.key;
  const addingKind = adding?.kind;
  useEffect(() => { if (editingKey) { editRef.current?.focus(); editRef.current?.select(); } }, [editingKey]);
  useEffect(() => { if (addingKind) addRef.current?.focus(); }, [addingKind]);

  async function finish(task: Promise<string>, done: () => void) {
    const failure = await task;
    setError(failure);
    if (!failure) done();
  }

  return (
    <div className="settings-folders">
      {groups.map((group) => (
        <div className="settings-folder-group" key={group.kind}>
          <div className="settings-folder-head"><strong>{group.title}</strong>
            <button type="button" className="secondary-button" onClick={() => { setError(""); setAdding({ kind: group.kind, value: "" }); }}>新建目录</button>
          </div>
          {adding?.kind === group.kind && (
            <form className="settings-folder-form" data-local-esc onSubmit={(event) => { event.preventDefault(); void finish(onAdd(group.kind, adding.value), () => setAdding(null)); }}>
              <input ref={addRef} value={adding.value} maxLength={30} placeholder="目录名称" aria-label={`新建${group.title}`} onChange={(event) => setAdding({ kind: group.kind, value: event.target.value })} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setAdding(null); setError(""); } }} />
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
              <div className={`settings-folder ${reorder.draggingId === key ? "dragging" : ""} ${reorder.overId === key && reorder.draggingId !== key ? "drag-over" : ""}`} key={key} {...(folder.locked ? {} : { "data-sort-scope": "settings-folder", "data-sort-id": key })}>
                <div className="settings-folder-row">
                  {folder.locked || editing?.key === key
                    ? <span className="settings-folder-grip placeholder" aria-hidden="true" />
                    : <button type="button" className="settings-folder-grip" aria-label={`拖动排序 ${folder.name}`} title="按住拖动排序" onPointerDown={(event) => reorder.beginPointerDrag(event, key)}><span aria-hidden="true">⠿</span></button>}
                  <button type="button" className="settings-folder-dot" style={{ background: folder.color }} aria-label={`修改颜色 ${folder.name}`} aria-expanded={colorKey === key} onClick={() => setColorKey(colorKey === key ? "" : key)} />
                  {editing?.key === key ? (
                    <form className="settings-folder-form" data-local-esc onSubmit={(event) => { event.preventDefault(); void finish(onRename(group.kind, folder.name, editing.value), () => setEditing(null)); }}>
                      <input ref={editRef} value={editing.value} maxLength={30} aria-label={`重命名 ${folder.name}`} onChange={(event) => setEditing({ key, value: event.target.value })} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setEditing(null); setError(""); } }} />
                      <button type="submit" className="secondary-button">保存</button>
                      <button type="button" className="secondary-button" onClick={() => { setEditing(null); setError(""); }}>取消</button>
                    </form>
                  ) : (
                    <>
                      <span className="settings-folder-name" title={folder.name}>{folder.name}</span>
                      <small className="settings-folder-count">{folder.count} 条</small>
                      {folder.locked ? <span className="settings-folder-fixed" title="标准话术目录不能改名或删除">固定</span> : <span className="settings-folder-actions">
                        <button type="button" className="settings-mini-button" aria-label={`上移 ${folder.name}`} title="上移" disabled={folder.locked || !previous || previous.locked} onClick={() => onMove(group.kind, folder.name, -1)}>↑</button>
                        <button type="button" className="settings-mini-button" aria-label={`下移 ${folder.name}`} title="下移" disabled={folder.locked || !next || next.locked} onClick={() => onMove(group.kind, folder.name, 1)}>↓</button>
                        <button type="button" className="settings-mini-button" disabled={folder.locked} title={folder.locked ? "标准话术目录不能改名" : undefined} onClick={() => { setError(""); setArmKey(""); setEditing({ key, value: folder.name }); }}>改名</button>
                        {armKey === key
                          ? <button type="button" className="settings-mini-button danger" onClick={() => { setArmKey(""); void finish(onDelete(group.kind, folder.name), () => undefined); }}>{group.kind === "secret" && folder.count > 0 ? `确认删除（${folder.count} 条移到未分类）` : "确认删除"}</button>
                          : <button type="button" className="settings-mini-button danger" disabled={folder.locked} title={folder.locked ? "标准话术目录不能删除" : undefined} onClick={() => { setError(""); setArmKey(key); }}>删除</button>}
                      </span>}
                    </>
                  )}
                </div>
                {colorKey === key && (
                  <div className="settings-swatches" role="group" aria-label={`${folder.name} 的颜色`}>
                    <button type="button" className="settings-mini-button" onClick={() => onColor(group.kind, folder.name, null)}>自动</button>
                    {CATEGORY_PALETTE.map((color) => <button key={color} type="button" aria-label={`颜色 ${color}`} aria-pressed={folder.color.toLowerCase() === color.toLowerCase()} className={folder.color.toLowerCase() === color.toLowerCase() ? "on" : ""} style={{ background: color }} onClick={() => onColor(group.kind, folder.name, color)} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {error && <p className="settings-error" role="alert">{error}</p>}
      <p className="settings-note">标准话术目录固定，只能改颜色。话术目录里还有内容时不能删除{PLAIN_NOTES ? "。" : `；${SECRET_WORD}目录删除后，里面的内容会移到未分类。`}</p>
    </div>
  );
}
