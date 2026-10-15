"use client";

import { useMemo, useState } from "react";
import { patchEntry, purgeEntry } from "./account-entries";
import { type AccountEntry, type EntryKind, CATEGORY_LABEL, TYPE_LABEL, UNKNOWN_SITE, groupBySite, matchesQuery } from "./account-view";
import { copyTextWithExpiry } from "./clipboard";
import type { MarkItem } from "./payment-core";
import { openSecretItemsStore } from "./secret-items-store";
import { SiteBadge } from "./site-badge";
import { Icon } from "./ui-atoms";
import { clearSampleEntries, isSampleId, previewClearSamples } from "./vault-samples";

const KIND_CHOICES: EntryKind[] = ["login", "payment", "apikey", "totp", "recovery", "note", "other"];

// The 账号 list: one row style for every type, each row led by its website's logo (the card title carries it only when 收起).
// The row opens its entry; one button copies the most useful thing;
// everything else (打开, 改归类) is in the 「…」 menu.
export type AccountView = "all" | "pinned" | "recent" | "trash";

export function AccountList({ deviceKey, entries, trashed, marks, category, view = "all", query, selecting = false, folded = false, onSelectingChange, onOpen, onPinLegacy, onTrashLegacy, onToast }: {
  deviceKey: string; entries: AccountEntry[]; trashed: AccountEntry[]; marks: Record<string, MarkItem>; category: EntryKind | "all"; view?: AccountView; query: string;
  selecting?: boolean; folded?: boolean; onSelectingChange?: (selecting: boolean) => void;
  onOpen: (entry: AccountEntry) => void; onPinLegacy: (id: string) => void; onTrashLegacy: (ids: string[]) => Promise<void>; onToast: (message: string) => void;
}) {
  const [menuId, setMenuId] = useState("");
  const [editing, setEditing] = useState("");
  const [kindDraft, setKindDraft] = useState<EntryKind>("other");
  const [siteDraft, setSiteDraft] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [error, setError] = useState("");
  // null = not asking; otherwise the names that 删除范例 would remove, shown before anything is deleted.
  const [sampleNames, setSampleNames] = useState<string[] | null>(null);

  const [purgeId, setPurgeId] = useState("");
  // 选择: the targets ticked in the list; leaving the mode forgets them (set while rendering, no effect needed).
  const [picked, setPicked] = useState<string[]>([]);
  const [seenSelecting, setSeenSelecting] = useState(selecting);
  if (seenSelecting !== selecting) { setSeenSelecting(selecting); if (!selecting) setPicked([]); }
  const shown = useMemo(() => {
    const base = view === "trash" ? trashed : view === "pinned" ? entries.filter((entry) => entry.pinned) : view === "recent" ? entries.filter((entry) => entry.lastUsedAt).sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0)).slice(0, 20) : entries;
    return base.filter((entry) => (view !== "all" || category === "all" || entry.tab === category) && matchesQuery(entry, query));
  }, [entries, trashed, category, view, query]);
  // 最近使用 and 回收站 are plain lists (newest first); everything else is one card per website.
  const groups = useMemo(() => (view === "recent" || view === "trash" ? (shown.length ? [{ key: "flat", title: view === "recent" ? "最近使用" : "回收站", site: UNKNOWN_SITE, entries: shown }] : []) : groupBySite(shown)), [shown, view]);
  const siteNames = useMemo(() => [...new Set(entries.map((entry) => entry.site).filter((site) => site.key !== "other" && site.key !== "payment" && site.key !== "note").map((site) => site.name))], [entries]);
  const hasSamples = view === "all" && category === "all" && !query.trim() && entries.some((entry) => !entry.legacy && isSampleId(entry.id));

  async function copy(entry: AccountEntry) {
    if (!entry.copy) return;
    try {
      const text = await entry.copy.text();
      await copyTextWithExpiry(text);
      if (!entry.legacy) void patchEntry(deviceKey, entry, { lastUsedAt: Date.now() }).catch(() => undefined);
      setCopiedId(entry.target);
      window.setTimeout(() => setCopiedId((current) => (current === entry.target ? "" : current)), 1600);
      onToast("已复制");
    } catch {
      onToast("复制失败，请重试");
    }
  }

  async function saveMark(entry: AccountEntry) {
    const store = openSecretItemsStore(deviceKey);
    const site = siteDraft.trim().slice(0, 40);
    const as = entry.legacy && kindDraft !== entry.autoTab ? kindDraft : undefined;
    try {
      if (!site && !as) await store.remove(`mark:${entry.target}`);
      else {
        const mark: MarkItem = { id: `mark:${entry.target}`, type: "mark", target: entry.target, ...(as ? { as } : {}), ...(site ? { site } : {}), updatedAt: Date.now() };
        await store.put(mark);
      }
      setEditing("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败，请重试");
    }
  }

  async function change(task: Promise<void>) {
    try { await task; } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败，请重试"); }
  }

  // 删除 = move to the 回收站 (new types by a mark, old 秘密 through the page's own trash); nothing is lost, 恢复 brings it back.
  async function trashEntries(list: AccountEntry[]) {
    if (list.length === 0) return;
    try {
      const stamp = Date.now();
      for (const entry of list) if (!entry.legacy) await patchEntry(deviceKey, entry, { trashedAt: stamp });
      const old = list.filter((entry) => entry.legacy).map((entry) => entry.id);
      if (old.length > 0) await onTrashLegacy(old);
      onToast(list.length === 1 ? "已移到回收站，可以恢复" : `已把 ${list.length} 条移到回收站，可以恢复`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败，请重试");
    }
  }

  const pickedEntries = shown.filter((entry) => picked.includes(entry.target));
  const togglePicked = (target: string) => setPicked((current) => (current.includes(target) ? current.filter((value) => value !== target) : [...current, target]));
  async function trashPicked() {
    const list = pickedEntries;
    setPicked([]);
    onSelectingChange?.(false);
    await trashEntries(list);
  }

  async function removeSamples() {
    try {
      setSampleNames(null);
      await clearSampleEntries(deviceKey);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败，请重试");
    }
  }

  if (error) return <p className="settings-note" role="alert">{error}</p>;
  if (view === "all" && entries.length === 0) return <p className="totp-empty">还没有账号。点右上角「新增」，添加登录、收款信息、验证码或笔记。</p>;
  if (shown.length === 0) return <p className="totp-empty">{query.trim() ? "没有找到匹配的内容。" : view === "pinned" ? "还没有收藏内容。点条目右边「…」里的「收藏」添加。" : view === "recent" ? "复制过的内容会出现在这里。" : view === "trash" ? "回收站里没有新添加的类型。" : `「${category === "all" ? "全部" : CATEGORY_LABEL[category]}」里还没有内容。点右上角「新增」添加。`}</p>;
  return (
    <>
      {hasSamples && (
        <div className="vault-sample-note">
          <span>{sampleNames === null ? "里面带了几条「范例」，是假数据，看完可以删掉。" : sampleNames.length === 0 ? "现在没有可删除的范例（改过的范例算你的数据，不会删）。" : `将删除 ${sampleNames.length} 条：${sampleNames.join("、")}。改过的范例和你自己的内容不会删。`}</span>
          {sampleNames === null
            ? <button type="button" className="secondary-button" onClick={() => void previewClearSamples(deviceKey).then(setSampleNames).catch(() => setError("读取失败，请重试"))}>删除范例…</button>
            : <span className="settings-inline-actions"><button type="button" className="secondary-button" onClick={() => setSampleNames(null)}>取消</button>
              {sampleNames.length > 0 && <button type="button" className="secondary-button danger" onClick={() => void removeSamples()}>确认删除</button>}</span>}
        </div>
      )}
      <div className="vault-groups">
        {groups.map((group) => (
          <section key={group.key} className="vault-group" aria-label={group.title}>
            <h3>{folded && !selecting && group.key !== "payment" && group.key !== "note" && group.key !== "flat" && <SiteBadge site={group.site} size={20} />}{group.title}<span className="vault-count">{group.entries.length}</span></h3>
            {(!folded || selecting || group.key === "flat") && <ul className="totp-list">
              {group.entries.map((entry) => (
                <li key={entry.target} className={`vault-entry-row acct-row${selecting ? " selecting" : ""}`}>
                  {selecting && <button type="button" className={`row-check ${picked.includes(entry.target) ? "on" : ""}`} role="checkbox" aria-checked={picked.includes(entry.target)} aria-label={`选择 ${entry.title}`} onClick={() => togglePicked(entry.target)}><Icon name="check" /></button>}
                  <button type="button" className="vault-entry" disabled={view === "trash"} onClick={() => (selecting ? togglePicked(entry.target) : onOpen(entry))}>
                    <SiteBadge site={entry.site} size={26} />
                    <span className="vault-type-chip">{TYPE_LABEL[entry.tab]}</span>
                    <span className="totp-who"><strong>{entry.title}</strong><small>{entry.hint}</small></span>
                  </button>
                  {view === "trash" ? (
                    <span className="settings-inline-actions acct-trash-actions">
                      <button type="button" className="secondary-button" onClick={() => void change(patchEntry(deviceKey, entry, { trashedAt: undefined }))}>恢复</button>
                      {purgeId === entry.target
                        ? <><button type="button" className="secondary-button" onClick={() => setPurgeId("")}>取消</button><button type="button" className="secondary-button danger-text" onClick={() => { setPurgeId(""); void change(purgeEntry(deviceKey, entry)); }}>确认永久删除</button></>
                        : <button type="button" className="secondary-button" onClick={() => setPurgeId(entry.target)}>永久删除</button>}
                    </span>
                  ) : selecting ? null : <>
                  {entry.copy && <button type="button" className={`icon-button acct-copy${copiedId === entry.target ? " copied" : ""}`} aria-label={`${entry.copy.label} ${entry.title}`} title={entry.copy.label} onClick={() => void copy(entry)}><Icon name={copiedId === entry.target ? "check" : "copy"} /></button>}
                  <span className="acct-menu-wrap">
                    <button type="button" className="icon-button" aria-label={`更多操作 ${entry.title}`} aria-haspopup="menu" aria-expanded={menuId === entry.target} onClick={() => setMenuId(menuId === entry.target ? "" : entry.target)}><Icon name="more" /></button>
                    {menuId === entry.target && <>
                      <div className="menu-scrim" role="presentation" onMouseDown={() => setMenuId("")} />
                      <div className="dropdown acct-menu" role="menu" aria-label={`${entry.title} 的操作`}>
                        <button type="button" role="menuitem" onClick={() => { setMenuId(""); onOpen(entry); }}>打开 / 修改</button>
                        <button type="button" role="menuitem" onClick={() => { setMenuId(""); if (entry.legacy) onPinLegacy(entry.id); else void change(patchEntry(deviceKey, entry, { pinned: entry.pinned ? undefined : true })); }}>{entry.pinned ? "取消收藏" : "收藏"}</button>
                        <button type="button" role="menuitem" onClick={() => { setMenuId(""); setEditing(entry.target); setKindDraft(entry.tab); setSiteDraft(marks[entry.target]?.site ?? ""); }}>改归类</button>
                        <div className="menu-divider" />
                        <button type="button" role="menuitem" className="danger" onClick={() => { setMenuId(""); void trashEntries([entry]); }}>移到回收站</button>
                      </div>
                    </>}
                  </span>
                  </>}
                  {editing === entry.target && (
                    <form className="vault-sort-form" onSubmit={(event) => { event.preventDefault(); void saveMark(entry); }}>
                      {entry.legacy && <label>类型<select value={kindDraft} onChange={(event) => setKindDraft(event.target.value as EntryKind)}>
                        {KIND_CHOICES.map((kind) => <option key={kind} value={kind}>{CATEGORY_LABEL[kind]}</option>)}</select></label>}
                      <label>所属网站<input value={siteDraft} list="vault-site-names" maxLength={40} autoComplete="off" placeholder="例如：Google，不填就自动识别" onChange={(event) => setSiteDraft(event.target.value)} /></label>
                      <div className="settings-inline-actions">
                        <button type="button" className="secondary-button" onClick={() => setEditing("")}>取消</button>
                        <button type="submit" className="primary-button">保存</button>
                      </div>
                    </form>
                  )}
                </li>
              ))}
            </ul>}
          </section>
        ))}
      </div>
      {selecting && view !== "trash" && <div className="bulk-bar" role="toolbar" aria-label="批量操作">
        <strong>已选 {pickedEntries.length} 条</strong>
        <button type="button" className="ghost-button" onClick={() => setPicked(pickedEntries.length === shown.length ? [] : shown.map((entry) => entry.target))}>{pickedEntries.length === shown.length ? "全不选" : "全选"}</button>
        <span className="spacer" />
        <button type="button" className="secondary-button danger-text" disabled={pickedEntries.length === 0} onClick={() => void trashPicked()}>移到回收站</button>
        <button type="button" className="primary-button" onClick={() => onSelectingChange?.(false)}>完成</button>
      </div>}
      <datalist id="vault-site-names">{siteNames.map((name) => <option key={name} value={name} />)}</datalist>
    </>
  );
}
