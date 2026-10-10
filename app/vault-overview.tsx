"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArcSegmented } from "./arc/segmented";
import { lastFour } from "./apikey-core";
import { paymentHint, type MarkItem } from "./payment-core";
import { clearSampleEntries, isSampleId } from "./vault-samples";
import { classifySecret } from "./secret-classify";
import { openSecretItemsStore, type SecretItemsStore } from "./secret-items-store";
import { SiteBadge } from "./site-badge";
import { detectSite, paymentSite, type Site } from "./site-core";
import { accountTitle } from "./totp-core";
import { openTotpStore } from "./totp-store";

export type VaultTab = "all" | "login" | "payment" | "apikey" | "recovery" | "totp";
type EntryKind = Exclude<VaultTab, "all"> | "other";

export type LegacySecret = { id: string; label: string; secret: string };

type Entry = {
  id: string; tab: EntryKind; title: string; hint: string; site: Site;
  // An old 秘密 entry: it stays where it is; its type is only a guess (or Lock's choice).
  legacy?: boolean;
  // Where Lock's own sorting for this entry is kept, and what it was before that.
  target: string; autoTab: EntryKind; autoSite: Site;
};

export const TYPE_LABEL: Record<EntryKind, string> = { login: "密码", payment: "收款", apikey: "API", recovery: "恢复", totp: "验证码", other: "其他" };
const TYPE_GROUP_LABEL: Record<EntryKind, string> = { login: "账号密码", payment: "收款信息", apikey: "API 密钥", recovery: "恢复码", totp: "验证码", other: "其他" };
const TYPE_ORDER: EntryKind[] = ["login", "payment", "apikey", "recovery", "totp", "other"];
const UNKNOWN_SITE: Site = { key: "other", name: "其他网站", color: "#8a8a85", letter: "·" };
const KIND_CHOICES: EntryKind[] = ["login", "payment", "apikey", "totp", "recovery", "other"];

export function groupEntries(entries: Entry[], by: "site" | "type") {
  const groups = new Map<string, { key: string; title: string; site?: Site; entries: Entry[] }>();
  for (const entry of entries) {
    const key = by === "site" ? entry.site.key : entry.tab;
    const group = groups.get(key) ?? { key, title: by === "site" ? entry.site.name : TYPE_GROUP_LABEL[entry.tab], site: by === "site" ? entry.site : undefined, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  const list = [...groups.values()];
  if (by === "type") return list.sort((a, b) => TYPE_ORDER.indexOf(a.key as EntryKind) - TYPE_ORDER.indexOf(b.key as EntryKind));
  return list.sort((a, b) => (a.key === "other" ? 1 : b.key === "other" ? -1 : a.title.localeCompare(b.title, "zh-CN")));
}

// A recognised site, or the shared 其他网站 group; never a group made from the first word of a title.
function knownSiteOrOther(site: Site): Site {
  return site.key.startsWith("name:") || site.key === "other" ? UNKNOWN_SITE : site;
}

// 全部: everything in the 保险箱 and the old 秘密, grouped by website (default) or by type. Empty groups are not shown.
export function VaultOverview({ deviceKey, legacySecrets, onOpen, onOpenLegacy }: {
  deviceKey: string; legacySecrets: LegacySecret[]; onOpen: (tab: Exclude<VaultTab, "all">, id: string) => void; onOpenLegacy: (id: string) => void;
}) {
  const storeRef = useRef<SecretItemsStore | null>(null);
  const [base, setBase] = useState<Entry[] | null>(null);
  const [marks, setMarks] = useState<Record<string, MarkItem>>({});
  const [error, setError] = useState("");
  const [by, setBy] = useState<"site" | "type">("site");
  const [editing, setEditing] = useState("");
  const [kindDraft, setKindDraft] = useState<EntryKind>("other");
  const [siteDraft, setSiteDraft] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    const store = openSecretItemsStore(deviceKey);
    storeRef.current = store;
    Promise.all([store.list(), openTotpStore(deviceKey).list()]).then(([items, totps]) => {
      if (!live) return;
      const list: Entry[] = [];
      const found: Record<string, MarkItem> = {};
      const add = (entry: Omit<Entry, "target" | "autoTab" | "autoSite">) => list.push({ ...entry, target: `${entry.legacy ? "legacy" : entry.tab}:${entry.id}`, autoTab: entry.tab, autoSite: entry.site });
      for (const item of items) {
        if (item.type === "mark") found[item.target] = item;
        else if (item.type === "login") add({ id: item.id, tab: "login", title: item.name, hint: item.username, site: detectSite({ url: item.url, name: item.name }) });
        else if (item.type === "apikey") add({ id: item.id, tab: "apikey", title: item.name, hint: `${item.service ? `${item.service} · ` : ""}尾号 ${lastFour(item.key)}`, site: detectSite({ apiKey: item.key, url: item.endpoint, name: item.service || item.name }) });
        else if (item.type === "recovery") add({ id: item.id, tab: "recovery", title: item.name, hint: `${item.codes.length} 个恢复码`, site: detectSite({ name: item.site || item.name }) });
        else add({ id: item.id, tab: "payment", title: item.name, hint: paymentHint(item), site: paymentSite(item.kind, item.name) });
      }
      for (const account of totps) add({ id: account.id, tab: "totp", title: accountTitle(account), hint: account.name && account.issuer ? account.name : "验证码", site: detectSite({ issuer: account.issuer, name: account.name }) });
      for (const secret of legacySecrets) {
        const tab = classifySecret(secret.label, secret.secret);
        add({ id: secret.id, tab, legacy: true, title: secret.label || "（没有标题）", hint: "来自「秘密」", site: knownSiteOrOther(detectSite({ apiKey: tab === "apikey" ? secret.secret : undefined, name: secret.label })) });
      }
      setMarks(found);
      setBase(list);
    }).catch((reason: Error) => { if (live) setError(reason.message); });
    return () => { live = false; };
  }, [deviceKey, legacySecrets, reload]);

  const entries = useMemo(() => (base ?? []).map((entry): Entry => {
    const mark = marks[entry.target];
    if (!mark) return entry;
    return { ...entry, tab: entry.legacy && mark.as ? mark.as : entry.tab, site: mark.site ? knownSiteOrOther(detectSite({ name: mark.site })) : entry.site };
  }), [base, marks]);
  const groups = useMemo(() => groupEntries(entries, by), [entries, by]);
  const siteNames = useMemo(() => [...new Set(entries.map((entry) => entry.site).filter((site) => site.key !== "other").map((site) => site.name))], [entries]);

  const hasSamples = (base ?? []).some((entry) => !entry.legacy && isSampleId(entry.id));
  async function removeSamples() {
    try {
      await clearSampleEntries(deviceKey);
      setReload((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败，请重试");
    }
  }

  async function saveMark(entry: Entry) {
    const store = storeRef.current;
    if (!store) return;
    const site = siteDraft.trim().slice(0, 40);
    const as = entry.legacy && kindDraft !== entry.autoTab ? kindDraft : undefined;
    try {
      if (!site && !as) {
        await store.remove(`mark:${entry.target}`);
        setMarks((current) => { const next = { ...current }; delete next[entry.target]; return next; });
      } else {
        const mark: MarkItem = { id: `mark:${entry.target}`, type: "mark", target: entry.target, ...(as ? { as } : {}), ...(site ? { site } : {}), updatedAt: Date.now() };
        await store.put(mark);
        setMarks((current) => ({ ...current, [entry.target]: mark }));
      }
      setEditing("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败，请重试");
    }
  }

  if (error) return <p className="settings-note" role="alert">{error}</p>;
  if (base === null) return <p className="settings-note">正在读取…</p>;
  if (entries.length === 0) return <p className="totp-empty">保险箱还是空的。切到上面的标签，添加账号密码、收款信息或验证码。</p>;
  return (
    <>
      {hasSamples && <div className="vault-sample-note"><span>里面带了几条「范例」，是假数据，看完可以删掉。</span><button type="button" className="secondary-button" onClick={() => void removeSamples()}>删除范例</button></div>}
      <ArcSegmented className="settings-segment vault-tabs" label="分组方式" value={by} onSelect={(next) => setBy(next as "site" | "type")}
        options={[{ value: "site", label: "按网站" }, { value: "type", label: "按类型" }]} />
      <div className="vault-groups">
        {groups.map((group) => (
          <section key={group.key} className="vault-group" aria-label={group.title}>
            <h3>{group.site && <SiteBadge site={group.site} size={20} />}{group.title}<span className="vault-count">{group.entries.length}</span></h3>
            <ul className="totp-list">
              {group.entries.map((entry) => (
                <li key={entry.target} className="vault-entry-row">
                  <button type="button" className="vault-entry" onClick={() => (entry.legacy ? onOpenLegacy(entry.id) : onOpen(entry.tab as Exclude<VaultTab, "all">, entry.id))}>
                    <span className="vault-type-chip">{TYPE_LABEL[entry.tab]}</span>
                    <span className="totp-who"><strong>{entry.title}</strong><small>{entry.hint}</small></span>
                  </button>
                  <button type="button" className="ghost-button vault-sort" aria-label="改归类" aria-expanded={editing === entry.target}
                    onClick={() => { setEditing(editing === entry.target ? "" : entry.target); setKindDraft(entry.tab); setSiteDraft(marks[entry.target]?.site ?? ""); }}>改归类</button>
                  {editing === entry.target && (
                    <form className="vault-sort-form" onSubmit={(event) => { event.preventDefault(); void saveMark(entry); }}>
                      {entry.legacy && <label>类型<select value={kindDraft} onChange={(event) => setKindDraft(event.target.value as EntryKind)}>
                        {KIND_CHOICES.map((kind) => <option key={kind} value={kind}>{TYPE_GROUP_LABEL[kind]}</option>)}</select></label>}
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
