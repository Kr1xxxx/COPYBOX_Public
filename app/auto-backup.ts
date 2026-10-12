// Automatic daily backup of everything (话术, 账号, 图片, settings). The file holds the same records the app keeps, as they are
// (already encrypted stays encrypted), the same content as the 完整备份 file but without a password, so it has the same
// protection as the data folder it sits in. The desktop app keeps the newest seven in its data folder; the browser trial
// keeps them in its own storage. Restoring always goes through applyPayload, which checks first and keeps a way back.
import { collectPayload, countImages, countPayload, parseBackupText, type TransferPayload } from "./data-transfer.ts";

export const AUTO_BACKUP_KEEP = 7;
export const AUTO_BACKUP_ENABLED_KEY = "clipbox.auto-backup.enabled";
const WEB_STORE_KEY = "clipbox.web-backups.v1";
export const AUTO_BACKUP_FORMAT = "clipbox-auto-backup";

export type BackupFile = { name: string; size: number };
export type BackupStore = {
  list: () => Promise<BackupFile[]>;
  save: (name: string, text: string) => Promise<void>;
  read: (name: string) => Promise<string>;
};

const NAME = /^clipbox-auto-(\d{4})-(\d{2})-(\d{2})\.json$/;
export const isAutoBackupName = (name: string) => NAME.test(name);

const two = (value: number) => String(value).padStart(2, "0");
// The date on this computer's clock, so "today" matches what the person sees.
export function autoBackupName(now: Date = new Date()) {
  return `clipbox-auto-${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}.json`;
}

export function backupDue(names: string[], now: Date = new Date()) {
  return !names.includes(autoBackupName(now));
}

// The names to delete so only the newest `keep` remain. Names that are not ours are never listed.
export function backupsToDelete(names: string[], keep = AUTO_BACKUP_KEEP) {
  return names.filter(isAutoBackupName).sort().reverse().slice(keep);
}

export function backupDateLabel(name: string) {
  const match = NAME.exec(name);
  return match ? `${Number(match[2])}月${Number(match[3])}日` : name;
}

export function backupSizeLabel(size: number) {
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}

export function readAutoBackupEnabled(storage: Pick<Storage, "getItem"> = localStorage) {
  try { return storage.getItem(AUTO_BACKUP_ENABLED_KEY) !== "off"; } catch { return true; }
}

export function writeAutoBackupEnabled(enabled: boolean, storage: Pick<Storage, "setItem"> = localStorage) {
  try { storage.setItem(AUTO_BACKUP_ENABLED_KEY, enabled ? "on" : "off"); } catch { /* the choice lasts for this session only */ }
}

export function webStore(storage: Pick<Storage, "getItem" | "setItem"> = localStorage): BackupStore {
  const load = (): Record<string, string> => {
    try { const value = JSON.parse(storage.getItem(WEB_STORE_KEY) || "{}"); return value && typeof value === "object" ? value : {}; } catch { return {}; }
  };
  return {
    list: async () => Object.entries(load()).filter(([name]) => isAutoBackupName(name)).map(([name, text]) => ({ name, size: text.length })).sort((a, b) => b.name.localeCompare(a.name)),
    save: async (name, text) => {
      const all = load();
      all[name] = text;
      for (const old of backupsToDelete(Object.keys(all))) delete all[old];
      storage.setItem(WEB_STORE_KEY, JSON.stringify(all));
    },
    read: async (name) => {
      const text = load()[name];
      if (typeof text !== "string") throw new Error("missing");
      return text;
    },
  };
}

export function desktopStore(bridge: Pick<NonNullable<Window["clipboxDesktop"]>, "backupSave" | "backupList" | "backupRead">): BackupStore | null {
  const { backupSave, backupList, backupRead } = bridge;
  if (!backupSave || !backupList || !backupRead) return null;
  return {
    list: async () => (await backupList()).filter((file) => isAutoBackupName(file.name)),
    save: (name, text) => backupSave(name, new TextEncoder().encode(text)),
    read: async (name) => new TextDecoder().decode(await backupRead(name)),
  };
}

export function getBackupStore(): BackupStore {
  return (typeof window !== "undefined" && window.clipboxDesktop && desktopStore(window.clipboxDesktop)) || webStore();
}

export function backupText(payload: TransferPayload, savedAt: number) {
  return JSON.stringify({ format: AUTO_BACKUP_FORMAT, version: 1, savedAt, payload });
}

// Reads a backup file's text back into the payload to restore; anything that is not one of ours is refused.
export function readBackupText(text: string): TransferPayload {
  return parseBackupText(text, AUTO_BACKUP_FORMAT);
}

// Saves today's backup when it is switched on and today's is not there yet. Never throws: a failed backup must not disturb the app.
export async function runAutoBackup(store: BackupStore, enabled: boolean, now: Date = new Date(), collect: () => Promise<TransferPayload> = collectPayload): Promise<"saved" | "skipped" | "failed"> {
  if (!enabled) return "skipped";
  try {
    if (!backupDue((await store.list()).map((file) => file.name), now)) return "skipped";
    await store.save(autoBackupName(now), backupText(await collect(), now.getTime()));
    return "saved";
  } catch {
    return "failed";
  }
}

export function describeBackup(payload: TransferPayload) {
  return { images: countImages(payload), ...countPayload(payload) };
}
