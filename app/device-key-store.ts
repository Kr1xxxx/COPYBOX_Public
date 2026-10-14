// Where the vault's device key lives (D-053). It encrypts the 话术, the 图片 and (without a 账号页密码) the 账号 data.
// Browser trial and macOS: in the page's storage next to the data, as before (D-015). Windows desktop: in Windows Credential
// Manager (DPAPI, this Windows user only), so a copied data folder can no longer be opened.
//
// Moving it never risks the data: the key itself stays the same (nothing is re-encrypted), every key that might open the
// vault is tried, and the copy next to the data is removed only after Credential Manager has stored the key and given the
// same value back. If Credential Manager cannot be read, the copy next to the data is used and kept.
export const DEVICE_KEY = "clipbox.device-key.v1";

type KeyStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type SecureKeyStore = { get: () => Promise<string | null>; set: (key: string) => Promise<void> };

/** Windows Credential Manager through the desktop bridge, or null where the key stays in the page's storage. */
export function secureKeyStore(): SecureKeyStore | null {
  const desktop = typeof window === "undefined" ? undefined : window.clipboxDesktop;
  if (desktop?.platform !== "win32" || !desktop.deviceKeyGet || !desktop.deviceKeySet) return null;
  return { get: desktop.deviceKeyGet, set: desktop.deviceKeySet };
}

/** The keys to try for opening the vault, most likely first: the protected one, then any copy next to the data. */
export async function deviceKeyCandidates(storage: KeyStorage, secure: SecureKeyStore | null, name = DEVICE_KEY): Promise<string[]> {
  const keys: string[] = [];
  if (secure) {
    try {
      const stored = await secure.get();
      if (stored) keys.push(stored);
    } catch { /* unreadable: fall back to the copy next to the data, which is then kept */ }
  }
  const local = storage.getItem(name);
  if (local && !keys.includes(local)) keys.push(local);
  return keys;
}

/** After `key` opened the vault: make sure Credential Manager holds it, then remove the copy next to the data. */
export async function settleDeviceKey(key: string, storage: KeyStorage, secure: SecureKeyStore | null, name = DEVICE_KEY): Promise<"moved" | "kept"> {
  if (!secure) return "kept";
  try {
    if ((await secure.get()) !== key) {
      await secure.set(key);
      if ((await secure.get()) !== key) return "kept";
    }
  } catch {
    return "kept";
  }
  // A different leftover copy (one that did not open the vault) is left alone.
  if (storage.getItem(name) === key) storage.removeItem(name);
  return "moved";
}

/** A password-sealed 完整备份 must carry the key, or it could not be opened on a new computer (D-053). */
export async function withDeviceKey<T extends { localStorage: Record<string, string> }>(payload: T, secure: SecureKeyStore | null): Promise<T> {
  if (!secure || payload.localStorage[DEVICE_KEY]) return payload;
  const key = await secure.get();
  if (!key) return payload;
  return { ...payload, localStorage: { ...payload.localStorage, [DEVICE_KEY]: key } };
}
