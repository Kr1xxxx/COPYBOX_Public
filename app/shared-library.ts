import type { SecretItem, SharedContent, SharedLink, SnippetMeta } from "./clipbox-core.ts";
import { extractPlaceholders, productGroupsForRawProduct } from "./snippet-import.ts";
import { normalizeImportedSnippetFolder } from "./snippet-folders.ts";

// The company 话术 library: one JSON file that every employee's app reads. Entries have a stable id, so a sync can tell
// "new", "changed" and "removed" apart. A sync never overwrites what an employee wrote or edited, and never deletes.

export const SHARED_FORMAT = "clipbox-shared-library";

export type SharedSnippet = SharedContent & { id: string; folder: string };

export type SyncSummary = {
  at: number;
  total: number;
  added: number;
  updated: number;
  /** Company changed a 话术 the employee had edited: their version stays, the company version waits. */
  keptMine: number;
  retired: number;
  restored: number;
  skipped: number;
};

function without(link: SharedLink, key: "retired" | "pending"): SharedLink {
  const copy = { ...link };
  delete copy[key];
  return copy;
}
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const list = (value: unknown) => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);

// Small stable string hash (cyrb53); only used to notice that text changed, not for security.
export function contentHash(content: SharedContent) {
  const source = JSON.stringify([content.label, content.secret, content.note, content.summary, content.scene, content.action,
    content.productGroups, content.rawProduct, content.chineseText, content.placeholders, content.requiredInputs, content.usageNote, content.requiresVerification]);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export function contentOf(item: SecretItem): SharedContent {
  const meta = item.snippetMeta;
  return {
    label: item.label,
    secret: item.secret,
    note: item.note || "",
    summary: item.summary || "",
    scene: meta?.scene || "",
    action: meta?.action || "",
    productGroups: meta?.productGroups || [],
    rawProduct: meta?.rawProduct || "",
    chineseText: meta?.chineseText || "",
    placeholders: meta?.placeholders || [],
    requiredInputs: meta?.requiredInputs || [],
    usageNote: meta?.usageNote || "",
    requiresVerification: Boolean(meta?.requiresVerification),
  };
}

function withContent(item: SecretItem, content: SharedContent): SecretItem {
  const stage = item.snippetMeta?.stage || item.folder || "";
  const snippetMeta: SnippetMeta = {
    ...item.snippetMeta,
    stage,
    scene: content.scene,
    action: content.action,
    productGroups: content.productGroups,
    rawProduct: content.rawProduct,
    chineseText: content.chineseText,
    placeholders: content.placeholders,
    requiredInputs: content.requiredInputs,
    usageNote: content.usageNote,
    requiresVerification: content.requiresVerification,
  };
  return { ...item, label: content.label, secret: content.secret, note: content.note, summary: content.summary, snippetMeta };
}

function readEntry(raw: unknown): SharedSnippet | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const id = text(entry.id);
  const secret = text(entry.secret);
  const label = text(entry.label);
  if (!id || !secret || !label) return null;
  const rawProduct = text(entry.rawProduct);
  const productGroups = list(entry.productGroups);
  const placeholders = list(entry.placeholders);
  const chineseText = text(entry.chineseText);
  return {
    id,
    label,
    secret,
    folder: normalizeImportedSnippetFolder(text(entry.folder)) || "询盘接待",
    note: text(entry.note),
    summary: text(entry.summary),
    scene: text(entry.scene) || label,
    action: text(entry.action),
    productGroups: productGroups.length || !rawProduct ? productGroups : productGroupsForRawProduct(rawProduct),
    rawProduct,
    chineseText,
    placeholders: placeholders.length ? placeholders : extractPlaceholders(`${secret}\n${chineseText}`),
    requiredInputs: list(entry.requiredInputs),
    usageNote: text(entry.usageNote),
    requiresVerification: entry.requiresVerification === true,
  };
}

// Limits on a company library (audit D): a bigger file is refused, entries past the count are skipped, and an entry with
// an overlong field is skipped, so a bad or hostile file cannot fill up or freeze the app.
export const SHARED_MAX_BYTES = 5 * 1024 * 1024;
export const SHARED_MAX_ITEMS = 5000;
export const SHARED_MAX_FIELD = 20000;
export const SHARED_TOO_BIG = "公司话术库文件太大（超过 5 MB）";

function tooLong(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  return Object.values(raw as Record<string, unknown>).some((value) => (typeof value === "string" ? value.length > SHARED_MAX_FIELD : Array.isArray(value) && value.length > 200));
}

export function parseSharedLibrary(source: string): { items: SharedSnippet[]; skipped: number } {
  if (source.length > SHARED_MAX_BYTES) throw new Error(SHARED_TOO_BIG);
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { throw new Error("这不是有效的公司话术库文件"); }
  const entries = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? (parsed as { items?: unknown }).items : undefined;
  if (!Array.isArray(entries)) throw new Error("这不是有效的公司话术库文件");
  const seen = new Set<string>();
  const items: SharedSnippet[] = [];
  let skipped = 0;
  for (const raw of entries) {
    if (items.length >= SHARED_MAX_ITEMS || tooLong(raw)) { skipped += 1; continue; }
    const entry = readEntry(raw);
    if (!entry || seen.has(entry.id)) { skipped += 1; continue; }
    seen.add(entry.id);
    items.push(entry);
  }
  return { items, skipped };
}

// Writes the 话术 of this app as a company library file (for whoever maintains the shared library).
export function exportSharedLibrary(items: SecretItem[], now: number) {
  const entries = items
    .filter((item) => item.kind === "snippet" && !item.deletedAt && item.secret.trim())
    .map((item) => ({ id: item.shared?.id || item.id, folder: item.folder || item.snippetMeta?.stage || "询盘接待", ...contentOf(item) }));
  return JSON.stringify({ format: SHARED_FORMAT, version: 1, updatedAt: now, items: entries }, null, 2) + "\n";
}

export type SharedMark = "update" | "retired" | null;
export function sharedMark(item: SecretItem): SharedMark {
  if (item.shared?.pending) return "update";
  if (item.shared?.retired) return "retired";
  return null;
}

type SyncOptions = {
  createId: () => string;
  now: number;
  /** Company ids this device has already received, so a 话术 the employee deleted does not come back. */
  seen: ReadonlySet<string>;
};

export function syncSharedLibrary(current: SecretItem[], incoming: SharedSnippet[], skipped: number, options: SyncOptions) {
  const summary: SyncSummary = { at: options.now, total: incoming.length, added: 0, updated: 0, keptMine: 0, retired: 0, restored: 0, skipped };
  const seen = new Set(options.seen);
  const byId = new Map(incoming.map((entry) => [entry.id, entry]));
  const have = new Set<string>();

  const next = current.map((item) => {
    const link = item.shared;
    if (!link) return item;
    have.add(link.id);
    if (item.deletedAt) return item;
    const entry = byId.get(link.id);
    if (!entry) {
      if (link.retired) return item;
      summary.retired += 1;
      return { ...item, shared: { ...link, retired: true } };
    }
    let linked = link;
    if (link.retired) {
      linked = without(link, "retired");
      summary.restored += 1;
    }
    const incomingHash = contentHash(entry);
    const edited = contentHash(contentOf(item)) !== link.baseHash;
    if (incomingHash === link.baseHash) {
      // The company went back to the text this device already has: a waiting newer version is no longer true.
      return linked === link && !link.pending ? item : { ...item, shared: without(linked, "pending") };
    }
    if (!edited) {
      summary.updated += 1;
      return withContent({ ...item, shared: { id: link.id, baseHash: incomingHash } }, entry);
    }
    if (linked.pending?.hash === incomingHash) return linked === link ? item : { ...item, shared: linked };
    summary.keptMine += 1;
    return { ...item, shared: { ...linked, pending: { content: contentOf(withContent(item, entry)), hash: incomingHash } } };
  });

  const added: SecretItem[] = [];
  for (const entry of incoming) {
    if (have.has(entry.id) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    const base: SecretItem = {
      id: options.createId(),
      label: entry.label,
      secret: entry.secret,
      note: entry.note,
      color: "#ffcfa8",
      kind: "snippet",
      folder: entry.folder,
      pinned: false,
      createdAt: options.now,
      updatedAt: options.now,
      shared: { id: entry.id, baseHash: contentHash(entry) },
    };
    added.push(withContent({ ...base, snippetMeta: { stage: entry.folder } as SnippetMeta }, entry));
    summary.added += 1;
  }
  for (const entry of incoming) seen.add(entry.id);
  return { items: [...added, ...next], summary, seen: [...seen] };
}

// Employee picks the company version: it replaces the text and the 话术 counts as untouched again.
export function acceptSharedUpdate(item: SecretItem, now: number): SecretItem {
  const pending = item.shared?.pending;
  if (!item.shared || !pending) return item;
  return withContent({ ...item, updatedAt: now, shared: { ...without(item.shared, "pending"), baseHash: pending.hash } }, pending.content);
}

// Employee keeps their own text: the company version is set aside and only a newer one will be offered again.
export function keepMySharedVersion(item: SecretItem): SecretItem {
  const pending = item.shared?.pending;
  if (!item.shared || !pending) return item;
  return { ...item, shared: { id: item.shared.id, baseHash: pending.hash, ...(item.shared.retired ? { retired: true } : {}) } };
}

export function describeSync(summary: SyncSummary) {
  const parts: string[] = [];
  if (summary.added) parts.push(`新增 ${summary.added} 条`);
  if (summary.updated) parts.push(`更新 ${summary.updated} 条`);
  if (summary.keptMine) parts.push(`${summary.keptMine} 条你改过的保留了你的版本`);
  if (summary.retired) parts.push(`${summary.retired} 条公司已停用`);
  if (summary.restored) parts.push(`${summary.restored} 条重新启用`);
  return parts.length ? parts.join("，") : "已是最新，没有变化";
}

// Where the company library comes from (Settings → 同步). People type the 同步码 they were given (e.g. XS-7KQ2M9AB),
// which picks their group's file on copyboxx.com; a full http(s) address still works for a file hosted elsewhere.
export const SYNC_BASE_URL = "https://copyboxx.com/sync/";
export const SHARED_SYNC_INTERVAL_MS = 30 * 60 * 1000;
const SYNC_CODE = /^[A-Za-z0-9-]{6,40}$/;

export function sharedSourceUrl(value: string): string {
  const typed = value.trim();
  if (!typed) return "";
  if (SYNC_CODE.test(typed)) return `${SYNC_BASE_URL}${typed.toUpperCase()}/snippets.json`;
  return typed;
}
