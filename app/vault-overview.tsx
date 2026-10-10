"use client";

import { useEffect, useMemo, useState } from "react";
import { ArcSegmented } from "./arc/segmented";
import { lastFour } from "./apikey-core";
import { paymentHint } from "./payment-core";
import { openSecretItemsStore } from "./secret-items-store";
import { SiteBadge } from "./site-badge";
import { detectSite, type Site } from "./site-core";
import { accountTitle } from "./totp-core";
import { openTotpStore } from "./totp-store";

export type VaultTab = "all" | "login" | "payment" | "apikey" | "totp";

type Entry = { id: string; tab: Exclude<VaultTab, "all">; title: string; hint: string; site: Site };

export const TYPE_LABEL: Record<Exclude<VaultTab, "all">, string> = { login: "密码", payment: "收款", apikey: "API", totp: "验证码" };
const TYPE_GROUP_LABEL: Record<Exclude<VaultTab, "all">, string> = { login: "账号密码", payment: "收款信息", apikey: "API 密钥", totp: "验证码" };
const TYPE_ORDER: Exclude<VaultTab, "all">[] = ["login", "payment", "apikey", "totp"];

// A payment entry belongs to its service when the kind says so (PayPal, Wise), else it has no site.
function paymentSite(kind: string, name: string): Site {
  if (kind === "paypal") return detectSite({ name: "PayPal" });
  if (kind === "wise") return detectSite({ name: "Wise" });
  return detectSite({ name });
}

export function groupEntries(entries: Entry[], by: "site" | "type") {
  const groups = new Map<string, { key: string; title: string; site?: Site; entries: Entry[] }>();
  for (const entry of entries) {
    const key = by === "site" ? entry.site.key : entry.tab;
    const group = groups.get(key) ?? { key, title: by === "site" ? entry.site.name : TYPE_GROUP_LABEL[entry.tab], site: by === "site" ? entry.site : undefined, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  const list = [...groups.values()];
  if (by === "type") return list.sort((a, b) => TYPE_ORDER.indexOf(a.key as Exclude<VaultTab, "all">) - TYPE_ORDER.indexOf(b.key as Exclude<VaultTab, "all">));
  return list.sort((a, b) => (a.key === "other" ? 1 : b.key === "other" ? -1 : a.title.localeCompare(b.title, "zh-CN")));
}

// 全部: everything in the 保险箱, grouped by website (default) or by type. Empty groups are not shown.
export function VaultOverview({ deviceKey, onOpen }: { deviceKey: string; onOpen: (tab: Exclude<VaultTab, "all">, id: string) => void }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");
  const [by, setBy] = useState<"site" | "type">("site");

  useEffect(() => {
    let live = true;
    Promise.all([openSecretItemsStore(deviceKey).list(), openTotpStore(deviceKey).list()]).then(([items, totps]) => {
      if (!live) return;
      const list: Entry[] = [];
      for (const item of items) {
        if (item.type === "login") list.push({ id: item.id, tab: "login", title: item.name, hint: item.username, site: detectSite({ url: item.url, name: item.name }) });
        else if (item.type === "apikey") list.push({ id: item.id, tab: "apikey", title: item.name, hint: `${item.service ? `${item.service} · ` : ""}尾号 ${lastFour(item.key)}`, site: detectSite({ apiKey: item.key, url: item.endpoint, name: item.service || item.name }) });
        else list.push({ id: item.id, tab: "payment", title: item.name, hint: paymentHint(item), site: paymentSite(item.kind, item.name) });
      }
      for (const account of totps) list.push({ id: account.id, tab: "totp", title: accountTitle(account), hint: account.name && account.issuer ? account.name : "验证码", site: detectSite({ issuer: account.issuer, name: account.name }) });
      setEntries(list);
    }).catch((reason: Error) => { if (live) setError(reason.message); });
    return () => { live = false; };
  }, [deviceKey]);

  const groups = useMemo(() => groupEntries(entries ?? [], by), [entries, by]);

  if (error) return <p className="settings-note" role="alert">{error}</p>;
  if (entries === null) return <p className="settings-note">正在读取…</p>;
  if (entries.length === 0) return <p className="totp-empty">保险箱还是空的。切到上面的标签，添加账号密码、收款信息或验证码。</p>;
  return (
    <>
      <ArcSegmented className="settings-segment vault-tabs" label="分组方式" value={by} onSelect={(next) => setBy(next as "site" | "type")}
        options={[{ value: "site", label: "按网站" }, { value: "type", label: "按类型" }]} />
      <div className="vault-groups">
        {groups.map((group) => (
          <section key={group.key} className="vault-group" aria-label={group.title}>
            <h3>{group.site && <SiteBadge site={group.site} size={20} />}{group.title}<span className="vault-count">{group.entries.length}</span></h3>
            <ul className="totp-list">
              {group.entries.map((entry) => (
                <li key={`${entry.tab}:${entry.id}`}>
                  <button type="button" className="vault-entry" onClick={() => onOpen(entry.tab, entry.id)}>
                    <span className="vault-type-chip">{TYPE_LABEL[entry.tab]}</span>
                    <span className="totp-who"><strong>{entry.title}</strong><small>{entry.hint}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
