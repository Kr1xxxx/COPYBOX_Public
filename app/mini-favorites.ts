import type { SecretItem } from "./clipbox-core";

export const MINI_FAVORITE_COUNT = 5;

// Starred snippets first (keeping list order), then the rest by copy count, then by last use.
export function pickMiniFavorites(items: SecretItem[], limit = MINI_FAVORITE_COUNT): SecretItem[] {
  const starred = items.filter((item) => item.pinned);
  const rest = items
    .filter((item) => !item.pinned && ((item.useCount || 0) > 0 || (item.lastUsedAt || 0) > 0))
    .toSorted((a, b) => (b.useCount || 0) - (a.useCount || 0) || (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
  return [...starred, ...rest].slice(0, limit);
}
