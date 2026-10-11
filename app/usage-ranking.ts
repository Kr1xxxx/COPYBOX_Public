// 话术使用排行: built only from the per-snippet copy count and last-used time that the vault already keeps.
// Nothing about what was typed into the highlighted blocks is ever recorded.
import type { SecretItem } from "./clipbox-core";

// Copying the same snippet again within this time counts once, so a double click or a mis-click does not skew the ranking.
export const USAGE_REPEAT_WINDOW_MS = 60_000;
export const USAGE_STALE_DAYS = 30;
export const USAGE_TOP_LIMIT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export function recordCopy(item: SecretItem, now: number): SecretItem {
  const last = item.lastUsedAt;
  if (typeof last === "number" && now >= last && now - last < USAGE_REPEAT_WINDOW_MS && (item.useCount || 0) > 0) return item;
  return { ...item, lastUsedAt: now, useCount: (item.useCount || 0) + 1 };
}

export type UsageRanking = { top: SecretItem[]; stale: SecretItem[]; never: SecretItem[] };

export function rankUsage(items: SecretItem[], now: number): UsageRanking {
  const snippets = items.filter((item) => item.kind === "snippet" && !item.deletedAt);
  const used = (item: SecretItem) => (item.useCount || 0) > 0 || typeof item.lastUsedAt === "number";
  const top = snippets.filter((item) => (item.useCount || 0) > 0)
    .sort((a, b) => (b.useCount || 0) - (a.useCount || 0) || (b.lastUsedAt || 0) - (a.lastUsedAt || 0))
    .slice(0, USAGE_TOP_LIMIT);
  const stale = snippets.filter((item) => used(item) && typeof item.lastUsedAt === "number" && now - item.lastUsedAt >= USAGE_STALE_DAYS * DAY_MS)
    .sort((a, b) => (a.lastUsedAt || 0) - (b.lastUsedAt || 0));
  const never = snippets.filter((item) => !used(item)).sort((a, b) => b.createdAt - a.createdAt);
  return { top, stale, never };
}
