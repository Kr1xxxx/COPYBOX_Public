// One round of 同步 with the cloud copy (D-064): download, merge into this computer, upload what changed. The page
// supplies how 话术 and 账号 are merged and saved here (each inside its own save queue), so this file stays testable.
import { CloudError, CLOUD_BASE_KEY, type CloudApi } from "./cloud-client.ts";
import { CLOUD_FORMAT, CLOUD_MAX_BYTES, EMPTY_BASE, readCloudDoc, sameCloudDoc, type CloudDoc, type MergeCounts, type SnippetSide, type SyncBase } from "./cloud-sync-core.ts";
import type { VaultItem } from "./secret-items-store.ts";

type Merged<T> = { cloud: T; base: Record<string, string>; counts: MergeCounts };

export type SyncSteps = {
  api: CloudApi;
  token: string;
  base: SyncBase;
  // Merges the cloud's 话术 into this computer and saves; returns what to upload.
  snippets: (remote: SnippetSide, base: Record<string, string>) => Promise<Merged<SnippetSide>>;
  // Same for 账号, or null while the 账号 page is locked: the cloud's entries then stay as they are.
  accounts: ((remote: VaultItem[], base: Record<string, string>) => Promise<Merged<VaultItem[]>>) | null;
};

export type SyncResult = { base: SyncBase; counts: MergeCounts; accountsSkipped: boolean };

const add = (first: MergeCounts, second: MergeCounts): MergeCounts => ({ added: first.added + second.added, updated: first.updated + second.updated, removed: first.removed + second.removed });

export async function syncOnce(steps: SyncSteps): Promise<SyncResult> {
  let counts: MergeCounts = { added: 0, updated: 0, removed: 0 };
  // Another computer can upload between our download and upload; then download again and merge again.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { version, data } = await steps.api.getVault(steps.token);
    const remote = readCloudDoc(data);
    // A missing cloud copy (the server's row lost or restored), or a section of it with nothing in it, says nothing about
    // what another computer deleted: that section is a first sync again and both sides are kept. Otherwise the base
    // would mark everything untouched here as "deleted elsewhere" and wipe it from every computer (D-093). Per section,
    // because a computer whose 账号 page is locked uploads 话术 with no 账号.
    const base: SyncBase = {
      snippets: remote?.snippets.length ? steps.base.snippets : EMPTY_BASE.snippets,
      accounts: remote?.accounts.length ? steps.base.accounts : EMPTY_BASE.accounts,
    };
    const snippets = await steps.snippets({ items: remote?.snippets ?? [], folders: remote?.snippetFolders ?? [], sharedSeen: remote?.sharedSeen ?? [] }, base.snippets);
    const accounts = steps.accounts ? await steps.accounts(remote?.accounts ?? [], base.accounts) : null;
    counts = add(counts, add(snippets.counts, accounts?.counts ?? { added: 0, updated: 0, removed: 0 }));
    const doc: CloudDoc = {
      format: CLOUD_FORMAT,
      snippets: snippets.cloud.items,
      snippetFolders: snippets.cloud.folders,
      sharedSeen: snippets.cloud.sharedSeen,
      accounts: accounts ? accounts.cloud : remote?.accounts ?? [],
    };
    const next: SyncBase = { snippets: snippets.base, accounts: accounts ? accounts.base : steps.base.accounts };
    if (sameCloudDoc(remote, doc)) return { base: next, counts, accountsSkipped: !steps.accounts };
    if (new TextEncoder().encode(JSON.stringify(doc)).length > CLOUD_MAX_BYTES) throw new CloudError("too_large", "要同步的内容太多，超过了云端的上限，这次没有上传，这台电脑上的内容没有变化");
    try {
      await steps.api.putVault(steps.token, version, doc);
      return { base: next, counts, accountsSkipped: !steps.accounts };
    } catch (error) {
      if (!(error instanceof CloudError) || error.code !== "conflict") throw error;
      // This computer already holds the merge. The next round merges the newer cloud copy on top of it against the same
      // base, so what was changed here still counts as changed here.
    }
  }
  throw new CloudError("conflict", "另一台电脑正在同步，请稍后再试");
}

// ---- the base of the last sync, kept per email ---------------------------------------------------------------------

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

export function readSyncBase(email: string, storage: Storage = localStorage): SyncBase {
  try {
    const value = JSON.parse(storage.getItem(CLOUD_BASE_KEY) || "null") as (SyncBase & { email?: string }) | null;
    if (value && value.email === email && value.snippets && value.accounts) return { snippets: value.snippets, accounts: value.accounts };
  } catch { /* no base: the next sync keeps everything from both sides */ }
  return EMPTY_BASE;
}

export function writeSyncBase(email: string, base: SyncBase, storage: Storage = localStorage) {
  try { storage.setItem(CLOUD_BASE_KEY, JSON.stringify({ email, ...base })); } catch { /* next sync keeps both sides */ }
}

export function clearSyncBase(storage: Storage = localStorage) {
  try { storage.removeItem(CLOUD_BASE_KEY); } catch { /* nothing kept */ }
}
