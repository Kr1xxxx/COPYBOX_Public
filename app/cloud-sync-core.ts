// Sync between this computer and the person's own copy on copyboxx.com (D-064). Pure functions only: what the cloud copy
// looks like, how it is merged with what is here, and which parts of 账号 entries a Mac keeps to itself.
//
// Merging is three-way. After every sync this computer remembers a fingerprint of each entry as it was then (the "base").
// Next time an entry that differs from its base was changed on that side; changed on one side only → that side wins;
// changed on both → the later edit wins (ties keep this computer's). An entry missing on one side that the other side
// has unchanged since the base was deleted there, so it goes here too. Nothing is ever lost on a first sync: without a
// base everything from both sides is kept.
import type { SecretItem } from "./clipbox-core.ts";
import type { VaultItem } from "./secret-items-store.ts";

export const CLOUD_FORMAT = 1;
// The cloud copy is refused above this size, before anything is sent: the server keeps at most 1.9 MB of
// JSON.stringify(data) per person while the copies live in D1 (D-063, tools/website/api.mjs maxD1Blob).
export const CLOUD_MAX_BYTES = 1_900_000;

export type CloudDoc = {
  format: typeof CLOUD_FORMAT;
  snippets: SecretItem[];
  snippetFolders: string[];
  sharedSeen: string[];
  accounts: VaultItem[];
};

export type SyncBase = { snippets: Record<string, string>; accounts: Record<string, string> };
export const EMPTY_BASE: SyncBase = { snippets: {}, accounts: {} };

export type MergeCounts = { added: number; updated: number; removed: number };

// What this computer does with 账号 entries. A Mac keeps passwords, API secrets and recovery codes on the Mac only
// (Krix, 2026-10-15): it never uploads its own and never stores the cloud's. Windows has no API category (D-038), so API
// entries other computers uploaded stay in the cloud copy untouched and are not stored here.
export type SyncPolicy = { keepSecretsLocal: boolean; storesType: (type: VaultItem["type"]) => boolean };

export function syncPolicy(platform: string | undefined): SyncPolicy {
  if (platform === "darwin") return { keepSecretsLocal: true, storesType: () => true };
  return { keepSecretsLocal: false, storesType: (type) => type !== "apikey" };
}

// ---- fingerprints -------------------------------------------------------------------------------------------------

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, inner]) => inner !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${stable(inner)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

// FNV-1a over the text, 2 × 32 bits. Only tells "same or not"; never used for anything secret.
export function fingerprint(value: unknown): string {
  const text = stable(value);
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ text.length;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code ^ (a >>> 7), 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

function omit<T extends object>(value: T, keys: string[]): T {
  const copy = { ...value } as Record<string, unknown>;
  for (const key of keys) delete copy[key];
  return copy as T;
}

// Copy counts and last-copied times change on every copy and never count as an edit. 话术 numbers belong to each computer
// (two computers can both have a #001), so they are not compared or taken from the other side either.
function snippetComparable(item: SecretItem) {
  return omit(item, ["lastUsedAt", "useCount", "snippetNumber"]);
}

function accountComparable(item: VaultItem, policy: SyncPolicy) {
  const plain = policy.keepSecretsLocal ? withoutSecrets(item) : item;
  return omit(plain, ["lastUsedAt"]);
}

// ---- the secret parts of a 账号 entry -----------------------------------------------------------------------------

/** The entry with its password / API values / recovery codes emptied, and the original note of a converted entry dropped (it may hold them). */
export function withoutSecrets(item: VaultItem): VaultItem {
  if (item.type === "login") return { ...omit(item, ["fromNote"]), password: "" };
  if (item.type === "apikey") {
    return { ...omit(item, ["fromNote"]), key: "", secret: "", ...(item.fields ? { fields: item.fields.map((field) => ({ ...field, value: "" })) } : {}) };
  }
  if (item.type === "recovery") return { ...item, codes: [] };
  return item;
}

/** The entry with its secret parts taken from `source` (the same entry elsewhere), or emptied when there is none. */
export function withSecretsFrom(item: VaultItem, source: VaultItem | undefined): VaultItem {
  const bare = withoutSecrets(item);
  if (!source || source.type !== item.type) return bare;
  if (bare.type === "login" && source.type === "login") return { ...bare, password: source.password, ...(source.fromNote ? { fromNote: source.fromNote } : {}) };
  if (bare.type === "apikey" && source.type === "apikey") {
    const values = new Map((source.fields ?? []).map((field) => [field.id, field.value]));
    return {
      ...bare,
      key: source.key,
      secret: source.secret,
      ...(bare.fields ? { fields: bare.fields.map((field) => ({ ...field, value: values.get(field.id) ?? "" })) } : {}),
      ...(source.fromNote ? { fromNote: source.fromNote } : {}),
    };
  }
  if (bare.type === "recovery" && source.type === "recovery") return { ...bare, codes: source.codes };
  return bare;
}

// ---- the three-way merge ------------------------------------------------------------------------------------------

type Picked<T> = { item: T; from: "local" | "remote"; key: string };
type MergeOptions<T> = { key: (item: T) => string; hash: (item: T) => string; stamp: (item: T) => number };

function keyed<T>(list: T[], key: (item: T) => string, id: (item: T) => string) {
  const map = new Map<string, T>();
  const order: string[] = [];
  for (const item of list) {
    let name = key(item);
    // Two entries with the same company id here: the second one is matched by its own id.
    if (map.has(name)) name = `id:${id(item)}`;
    if (map.has(name)) continue;
    map.set(name, item);
    order.push(name);
  }
  return { map, order };
}

export function threeWayMerge<T extends { id: string }>(local: T[], remote: T[], base: Record<string, string>, options: MergeOptions<T>) {
  const here = keyed(local, options.key, (item) => item.id);
  const there = keyed(remote, options.key, (item) => item.id);
  const picked: Picked<T>[] = [];
  const counts: MergeCounts = { added: 0, updated: 0, removed: 0 };

  for (const key of here.order) {
    const mine = here.map.get(key)!;
    const theirs = there.map.get(key);
    const known = base[key];
    const mineHash = options.hash(mine);
    if (theirs) {
      const theirHash = options.hash(theirs);
      if (theirHash === mineHash) { picked.push({ item: mine, from: "local", key }); continue; }
      const mineChanged = known === undefined || known !== mineHash;
      const theirChanged = known === undefined || known !== theirHash;
      const takeTheirs = theirChanged && (!mineChanged || options.stamp(theirs) > options.stamp(mine));
      if (takeTheirs) counts.updated += 1;
      picked.push(takeTheirs ? { item: theirs, from: "remote", key } : { item: mine, from: "local", key });
    } else if (known !== undefined && known === mineHash) {
      counts.removed += 1; // deleted on another computer, untouched here since
    } else {
      picked.push({ item: mine, from: "local", key });
    }
  }
  for (const key of there.order) {
    if (here.map.has(key)) continue;
    const theirs = there.map.get(key)!;
    const known = base[key];
    if (known !== undefined && known === options.hash(theirs)) continue; // deleted here, untouched elsewhere
    counts.added += 1;
    picked.push({ item: theirs, from: "remote", key });
  }
  const nextBase: Record<string, string> = {};
  for (const entry of picked) nextBase[entry.key] = options.hash(entry.item);
  return { picked, counts, base: nextBase };
}

// ---- 话术 ---------------------------------------------------------------------------------------------------------

export function isSyncedSnippet(item: SecretItem) {
  return item.kind === "snippet";
}

const snippetKey = (item: SecretItem) => (item.shared?.id ? `shared:${item.shared.id}` : item.id);
const snippetHash = (item: SecretItem) => fingerprint(snippetComparable(item));
const snippetStamp = (item: SecretItem) => Math.max(item.updatedAt || 0, item.deletedAt || 0);

export type SnippetSide = { items: SecretItem[]; folders: string[]; sharedSeen: string[] };

function union(first: string[], second: string[]) {
  const seen = new Set(first);
  return [...first, ...second.filter((value) => typeof value === "string" && !seen.has(value) && (seen.add(value), true))];
}

/**
 * Merges the 话术 here with the cloud's. `local.items` is the whole vault list: other kinds pass through untouched.
 * Returns the vault list to save here and the part to upload.
 */
export function mergeSnippets(local: SnippetSide, remote: SnippetSide, base: Record<string, string>) {
  const mine = local.items.filter(isSyncedSnippet);
  const merged = threeWayMerge(mine, remote.items.filter(isSyncedSnippet), base, { key: snippetKey, hash: snippetHash, stamp: snippetStamp });
  const mineById = new Map(mine.map((item) => [snippetKey(item), item]));
  // An entry taken from the cloud keeps this computer's number and copy count when it already exists here.
  const snippets = merged.picked.map(({ item, from, key }) => {
    if (from === "local") return item;
    const existing = mineById.get(key);
    if (!existing) return item; // a clash with a number used here is renumbered when the vault is saved
    return { ...item, snippetNumber: existing.snippetNumber, lastUsedAt: existing.lastUsedAt, useCount: existing.useCount };
  });
  const items = [...local.items.filter((item) => !isSyncedSnippet(item)), ...snippets];
  const folders = union(local.folders, [...remote.folders, ...snippets.map((item) => item.folder ?? "").filter(Boolean)]);
  const sharedSeen = union(local.sharedSeen, remote.sharedSeen);
  return {
    items,
    folders,
    sharedSeen,
    cloud: { items: snippets, folders, sharedSeen } satisfies SnippetSide,
    base: merged.base,
    counts: merged.counts,
    changed: fingerprint(items) !== fingerprint(local.items) || fingerprint(folders) !== fingerprint(local.folders) || fingerprint(sharedSeen) !== fingerprint(local.sharedSeen),
  };
}

// ---- 账号 ---------------------------------------------------------------------------------------------------------

const accountStamp = (item: VaultItem) => Math.max(item.updatedAt || 0, item.type === "mark" ? 0 : item.trashedAt || 0);

/** Merges the 账号 entries here with the cloud's, keeping the Mac's secrets on the Mac. */
export function mergeAccounts(local: VaultItem[], remote: VaultItem[], base: Record<string, string>, policy: SyncPolicy) {
  const stored = remote.filter((item) => policy.storesType(item.type));
  const passThrough = remote.filter((item) => !policy.storesType(item.type));
  const merged = threeWayMerge(local, stored, base, { key: (item) => item.id, hash: (item) => fingerprint(accountComparable(item, policy)), stamp: accountStamp });
  const localById = new Map(local.map((item) => [item.id, item]));
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  const items = merged.picked.map(({ item, from }) => {
    if (from === "local") return item;
    const existing = localById.get(item.id);
    const kept = existing && existing.type !== "mark" && item.type !== "mark" ? { ...item, lastUsedAt: existing.lastUsedAt } as VaultItem : item;
    return policy.keepSecretsLocal ? withSecretsFrom(kept, existing) : kept;
  });
  const cloud = [
    ...merged.picked.map(({ item }) => (policy.keepSecretsLocal ? withSecretsFrom(item, remoteById.get(item.id)) : item)),
    ...passThrough,
  ];
  return { items, cloud, base: merged.base, counts: merged.counts, changed: fingerprint(items) !== fingerprint(local) };
}

// ---- the cloud copy -----------------------------------------------------------------------------------------------

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Reads what the server returned; anything unusable is treated as an empty cloud copy, never as "delete everything". */
export function readCloudDoc(data: unknown): CloudDoc | null {
  if (!isObject(data)) return null;
  if (data.format !== CLOUD_FORMAT) throw new Error("云端的内容来自更新版本的 Copyboxx，请先更新再同步");
  const valid = <T extends { id?: unknown }>(list: T[]) => list.filter((item) => isObject(item) && typeof item.id === "string" && item.id.length > 0);
  return {
    format: CLOUD_FORMAT,
    snippets: valid(asArray<SecretItem>(data.snippets)),
    snippetFolders: asArray<string>(data.snippetFolders).filter((name) => typeof name === "string"),
    sharedSeen: asArray<string>(data.sharedSeen).filter((id) => typeof id === "string"),
    accounts: valid(asArray<VaultItem>(data.accounts)).filter((item) => typeof item.type === "string"),
  };
}

export function sameCloudDoc(first: CloudDoc | null, second: CloudDoc) {
  return first !== null && fingerprint(first) === fingerprint(second);
}

/**
 * A guard against a broken or emptied cloud copy: when one sync would delete most of what is here, nothing is deleted
 * and the person is told instead.
 */
export function tooManyRemovals(counts: MergeCounts, before: number) {
  return counts.removed > 20 && counts.removed > before / 2;
}

export function describeCounts(counts: MergeCounts) {
  const parts = [counts.added && `新增 ${counts.added} 条`, counts.updated && `更新 ${counts.updated} 条`, counts.removed && `删除 ${counts.removed} 条`].filter(Boolean);
  return parts.length ? parts.join("，") : "没有变化";
}
