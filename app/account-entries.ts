"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { lastFour } from "./apikey-core";
import { type AccountEntry, type EntryKind, UNKNOWN_SITE } from "./account-view";
import { buildEnglishBlock, paymentHint, type MarkItem } from "./payment-core";
import { classifySecret } from "./secret-classify";
import { VAULT_CHANGED_EVENT, openSecretItemsStore } from "./secret-items-store";
import { detectSite, paymentSite, type Site } from "./site-core";
import { accountTitle, generateTotp } from "./totp-core";
import { openTotpStore } from "./totp-store";
import { SAMPLES_DONE_KEY, restoreSampleEntries } from "./vault-samples";

export type LegacySecret = { id: string; label: string; secret: string };

// A recognised site, or the shared 其他网站 group; never a group made from the first word of a title.
export function knownSiteOrOther(site: Site): Site {
  return site.key.startsWith("name:") || site.key === "other" ? UNKNOWN_SITE : site;
}

// Every entry of the 账号 page (all five stored types plus the old 秘密), read from the encrypted stores. It reloads
// whenever a store is written, so the sidebar counts and the list always agree. Examples go in once before the first read.
export function useAccountEntries(deviceKey: string, legacySecrets: LegacySecret[], enabled: boolean, refreshKey = 0) {
  const [loaded, setLoaded] = useState<{ base: AccountEntry[]; marks: Record<string, MarkItem> } | null>(null);
  const [error, setError] = useState("");
  const [rev, setRev] = useState(0);
  const seeded = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const bump = () => setRev((value) => value + 1);
    window.addEventListener(VAULT_CHANGED_EVENT, bump);
    return () => window.removeEventListener(VAULT_CHANGED_EVENT, bump);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !deviceKey) return;
    let live = true;
    (async () => {
      if (!seeded.current) {
        seeded.current = true;
        try {
          if (localStorage.getItem(SAMPLES_DONE_KEY) !== "1") {
            // Added beside whatever is already there (old 秘密, earlier 验证码): only the missing 范例 go in, nothing is changed.
            await restoreSampleEntries(deviceKey);
            localStorage.setItem(SAMPLES_DONE_KEY, "1");
          }
        } catch {
          // Examples are a nicety: if anything is unreadable nothing is written and the page opens as it is.
        }
      }
      const [items, totps] = await Promise.all([openSecretItemsStore(deviceKey).list(), openTotpStore(deviceKey).list()]);
      if (!live) return;
      const list: AccountEntry[] = [];
      const marks: Record<string, MarkItem> = {};
      const add = (entry: Omit<AccountEntry, "target" | "autoTab" | "autoSite">) => list.push({ ...entry, target: `${entry.legacy ? "legacy" : entry.tab}:${entry.id}`, autoTab: entry.tab, autoSite: entry.site });
      for (const item of items) {
        if (item.type === "mark") marks[item.target] = item;
        else if (item.type === "login") add({ id: item.id, tab: "login", title: item.name, hint: item.username, site: detectSite({ url: item.url, name: item.name }), copy: { label: "复制密码", text: async () => item.password } });
        else if (item.type === "apikey") add({ id: item.id, tab: "apikey", title: item.name, hint: `${item.service ? `${item.service} · ` : ""}尾号 ${lastFour(item.key)}`, site: detectSite({ apiKey: item.key, url: item.endpoint, name: item.service || item.name }), copy: { label: "复制密钥", text: async () => item.key } });
        else if (item.type === "recovery") add({ id: item.id, tab: "recovery", title: item.name, hint: `${item.codes.length} 个恢复码`, site: detectSite({ name: item.site || item.name }), copy: { label: "复制全部恢复码", text: async () => item.codes.join("\n") } });
        else add({ id: item.id, tab: "payment", title: item.name, hint: paymentHint(item), site: paymentSite(item.kind, item.name), copy: { label: "复制收款信息", text: async () => buildEnglishBlock(item) } });
      }
      for (const account of totps) add({ id: account.id, tab: "totp", title: accountTitle(account), hint: account.name && account.issuer ? account.name : "验证码", site: detectSite({ issuer: account.issuer, name: account.name }), copy: { label: "复制验证码", text: () => generateTotp(account, Date.now()) } });
      for (const secret of legacySecrets) {
        const tab = classifySecret(secret.label, secret.secret);
        add({ id: secret.id, tab, legacy: true, title: secret.label || "（没有标题）", hint: "来自「其他」", site: knownSiteOrOther(detectSite({ apiKey: tab === "apikey" ? secret.secret : undefined, name: secret.label })) });
      }
      setError("");
      setLoaded({ base: list, marks });
    })().catch((reason: Error) => { if (live) setError(reason.message); });
    return () => { live = false; };
  }, [deviceKey, legacySecrets, enabled, rev, refreshKey]);

  const entries = useMemo(() => loaded && loaded.base.map((entry): AccountEntry => {
    const mark = loaded.marks[entry.target];
    if (!mark) return entry;
    return { ...entry, tab: entry.legacy && mark.as ? mark.as : entry.tab, site: mark.site ? knownSiteOrOther(detectSite({ name: mark.site })) : entry.site };
  }), [loaded]);
  return { entries, marks: loaded?.marks ?? {}, error };
}

export function countByKind(entries: AccountEntry[] | null): Record<EntryKind, number> {
  const counts: Record<EntryKind, number> = { login: 0, payment: 0, apikey: 0, recovery: 0, totp: 0, other: 0 };
  for (const entry of entries ?? []) counts[entry.tab] += 1;
  return counts;
}
