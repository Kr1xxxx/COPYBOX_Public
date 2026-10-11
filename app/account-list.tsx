"use client";

import { useMemo, useState } from "react";
import { type AccountEntry, type EntryKind, CATEGORY_LABEL, TYPE_LABEL, groupBySite, matchesQuery } from "./account-view";
import { copyTextWithExpiry } from "./clipboard";
import type { MarkItem } from "./payment-core";
import { openSecretItemsStore } from "./secret-items-store";
import { SiteBadge } from "./site-badge";
import { Icon } from "./ui-atoms";
import { clearSampleEntries, isSampleId, previewClearSamples } from "./vault-samples";

const KIND_CHOICES: EntryKind[] = ["login", "payment", "apikey", "totp", "recovery", "other"];

// The 账号 list: one row style for every type. The row opens its entry; one button copies the most useful thing;
// everything else (打开, 改归类) is in the 「…」 menu.
export function AccountList({ deviceKey, entries, marks, category, query, onOpen, onToast }: {
  deviceKey: string; entries: AccountEntry[]; marks: Record<string, MarkItem>; category: EntryKind | "all"; query: string;
  onOpen: (entry: AccountEntry) => void; onToast: (message: string) => void;
}) {
  const [menuId, setMenuId] = useState("");
  const [editing, setEditing] = useState("");
  const [kindDraft, setKindDraft] = useState<EntryKind>("other");
  const [siteDraft, setSiteDraft] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [error, setError] = useState("");
  // null = not asking; otherwise the names that 删除范例 would remove, shown before anything is deleted.
  const [sampleNames, setSampleNames] = useState<string[] | null>(null);

  const shown = useMemo(() => entries.filter((entry) => (category === "all" || entry.tab === category) && matchesQuery(entry, query)), [entries, category, query]);
  const groups = useMemo(() => groupBySite(shown), [shown]);
  const siteNames = useMemo(() => [...new Set(entries.map((entry) => entry.site).filter((site) => site.key !== "other" && site.key !== "payment").map((site) => site.name))], [entries]);
  const hasSamples = category === "all" && !query.trim() && entries.some((entry) => !entry.legacy && isSampleId(entry.id));

  async function copy(entry: AccountEntry) {
    if (!entry.copy) return;
    try {
      const text = await entry.copy.text();
      await copyTextWithExpiry(text);
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

  async function removeSamples() {
    try {
      setSampleNames(null);
      await clearSampleEntries(deviceKey);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败，请重试");
    }
  }

  if (error) return <p className="settings-note" role="alert">{error}</p>;
  if (entries.length === 0) return <p className="totp-empty">还没有账号。点右上角「新增」，添加登录、收款信息或验证码。</p>;
  if (shown.length === 0) return <p className="totp-empty">{query.trim() ? "没有找到匹配的内容。" : `「${category === "all" ? "全部" : CATEGORY_LABEL[category]}」里还没有内容。点右上角「新增」添加。`}</p>;
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
            <h3>{group.key !== "payment" && <SiteBadge site={group.site} size={20} />}{group.title}<span className="vault-count">{group.entries.length}</span></h3>
            <ul className="totp-list">
              {group.entries.map((entry) => (
                <li key={entry.target} className="vault-entry-row acct-row">
                  <button type="button" className="vault-entry" onClick={() => onOpen(entry)}>
                    <span className="vault-type-chip">{TYPE_LABEL[entry.tab]}</span>
                    <span className="totp-who"><strong>{entry.title}</strong><small>{entry.hint}</small></span>
                  </button>
                  {entry.copy && <button type="button" className={`icon-button acct-copy${copiedId === entry.target ? " copied" : ""}`} aria-label={`${entry.copy.label} ${entry.title}`} title={entry.copy.label} onClick={() => void copy(entry)}><Icon name={copiedId === entry.target ? "check" : "copy"} /></button>}
                  <span className="acct-menu-wrap">
                    <button type="button" className="icon-button" aria-label={`更多操作 ${entry.title}`} aria-haspopup="menu" aria-expanded={menuId === entry.target} onClick={() => setMenuId(menuId === entry.target ? "" : entry.target)}><Icon name="more" /></button>
                    {menuId === entry.target && <>
                      <div className="menu-scrim" role="presentation" onMouseDown={() => setMenuId("")} />
                      <div className="dropdown acct-menu" role="menu" aria-label={`${entry.title} 的操作`}>
                        <button type="button" role="menuitem" onClick={() => { setMenuId(""); onOpen(entry); }}>打开 / 修改</button>
                        <button type="button" role="menuitem" onClick={() => { setMenuId(""); setEditing(entry.target); setKindDraft(entry.tab); setSiteDraft(marks[entry.target]?.site ?? ""); }}>改归类</button>
                      </div>
                    </>}
                  </span>
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
            </ul>
          </section>
        ))}
      </div>
      <datalist id="vault-site-names">{siteNames.map((name) => <option key={name} value={name} />)}</datalist>
    </>
  );
}
