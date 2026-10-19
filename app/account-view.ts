// What the 账号 page (Mac) shows: entries of every type, grouped one card per website. Pure functions, no storage.
import type { Site } from "./site-core.ts";

export type EntryKind = "login" | "payment" | "address" | "apikey" | "recovery" | "totp" | "note" | "other";

export type AccountEntry = {
  id: string; tab: EntryKind; title: string; hint: string; site: Site;
  // An old 秘密 entry: it stays where it is; its type is only a guess (or Lock's choice).
  legacy?: boolean;
  pinned?: boolean; lastUsedAt?: number; trashedAt?: number;
  // Where Lock's own sorting for this entry is kept, and what it was before that.
  target: string; autoTab: EntryKind; autoSite: Site;
  // The one most useful thing to copy from this entry (password, code, key, whole payment block); none for old entries.
  copy?: { label: string; text: () => Promise<string> };
  // More text the search looks in (a note's whole content).
  search?: string;
};

export const TYPE_LABEL: Record<EntryKind, string> = { login: "登录", payment: "收款", address: "地址", apikey: "API", recovery: "恢复", totp: "验证码", note: "笔记", other: "其他" };
export const CATEGORY_LABEL: Record<EntryKind, string> = { login: "登录", payment: "收款信息", address: "地址", apikey: "API 密钥", recovery: "恢复码", totp: "验证码", note: "笔记", other: "其他" };
export const CATEGORY_ORDER: EntryKind[] = ["login", "payment", "address", "apikey", "totp", "recovery", "note", "other"];

export const UNKNOWN_SITE: Site = { key: "other", name: "其他网站", color: "#8a8a85", letter: "·" };
// Notes are not about one website: they sit together in one card unless Lock gives one a website.
export const NOTE_SITE: Site = { key: "note", name: "笔记", color: "#8a7a5c", letter: "记" };
export const PAYMENT_SITE: Site = { key: "payment", name: "收款信息", color: "#4a7a68", letter: "收" };
export const ADDRESS_SITE: Site = { key: "address", name: "地址", color: "#5c6f8a", letter: "址" };

export type SiteGroup = { key: string; title: string; site: Site; entries: AccountEntry[] };

// A name-only guess ("Example" from an API key's service) and a real domain ("example.com") are the same website when the
// name is the domain's first part. Names that match no domain stay as they are.
function domainOf(key: string) {
  return key.includes(".") && !key.startsWith("name:") ? key : "";
}

export function mergeSiteKeys(entries: AccountEntry[]): AccountEntry[] {
  const domains = new Map<string, Site>();
  for (const entry of entries) {
    const domain = domainOf(entry.site.key);
    if (domain) { domains.set(domain, entry.site); domains.set(domain.split(".")[0], entry.site); }
  }
  return entries.map((entry) => {
    const key = entry.site.key;
    const label = key.startsWith("name:") ? key.slice(5) : entry.site.name.toLowerCase();
    const same = !domainOf(key) && key !== "payment" && key !== "address" && key !== "other" && key !== "note" ? domains.get(label) : undefined;
    return same ? { ...entry, site: same } : entry;
  });
}

// One card per website, A to Z; 其他网站 after them, then 笔记, 地址, and 收款 last (payment and addresses are not websites, so each
// type gets one card of its own).
export function groupBySite(entries: AccountEntry[]): SiteGroup[] {
  const groups = new Map<string, SiteGroup>();
  for (const entry of mergeSiteKeys(entries)) {
    const site = entry.tab === "payment" ? PAYMENT_SITE : entry.tab === "address" ? ADDRESS_SITE : entry.site;
    const key = site.key;
    const group = groups.get(key) ?? { key, title: site.name, site, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  const rank = (group: SiteGroup) => (group.key === "payment" ? 4 : group.key === "address" ? 3 : group.key === "note" ? 2 : group.key === "other" ? 1 : 0);
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, "zh-CN"));
}

export function matchesQuery(entry: AccountEntry, query: string): boolean {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  return [entry.title, entry.site.name, entry.hint, entry.search ?? ""].some((part) => part.toLowerCase().includes(text));
}
