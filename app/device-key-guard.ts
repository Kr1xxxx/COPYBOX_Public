// Opens the vault with a device key that lives in the desktop shell (OS-encrypted) instead of
// next to the vault. An older vault whose key was stored in the page is moved over and
// re-encrypted with a fresh key, so a key left behind in old storage files cannot open the
// current vault. Every step can be repeated after a crash.

export type KeyRecord = { key: string; previous?: string };

export type KeyBridge = {
  deviceKeyAvailable?: () => Promise<boolean>;
  deviceKeyGet?: () => Promise<KeyRecord | null>;
  deviceKeySet?: (record: KeyRecord) => Promise<boolean>;
};

export type GuardStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type GuardDeps<Data, Envelope> = {
  bridge: KeyBridge;
  storage: GuardStorage;
  vaultKey: string;
  legacyKeyKey: string;
  decrypt: (envelope: Envelope, key: string) => Promise<Data>;
  encrypt: (data: Data, key: string) => Promise<Envelope>;
  createKey: () => string;
  createEmpty: () => Data;
};

export async function deviceKeyProtectionAvailable(bridge: KeyBridge | undefined): Promise<boolean> {
  if (!bridge?.deviceKeyAvailable || !bridge.deviceKeyGet || !bridge.deviceKeySet) return false;
  try { return Boolean(await bridge.deviceKeyAvailable()); } catch { return false; }
}

async function saveRecord(bridge: KeyBridge, record: KeyRecord) {
  await bridge.deviceKeySet!(record);
  const back = await bridge.deviceKeyGet!();
  if (!back || back.key !== record.key || back.previous !== record.previous) throw new Error("Device key was not saved");
}

export async function openGuardedVault<Data, Envelope>(deps: GuardDeps<Data, Envelope>): Promise<{ data: Data; key: string }> {
  const { bridge, storage } = deps;
  const raw = storage.getItem(deps.vaultKey);
  const legacy = storage.getItem(deps.legacyKeyKey);
  let record: KeyRecord | null = null;
  try { record = await bridge.deviceKeyGet!(); } catch { record = null; /* unreadable: the old key (if any) can still recover */ }

  if (!raw) {
    // First start: the key goes straight to the protected store; the page never keeps a copy.
    const key = record?.key || legacy || deps.createKey();
    const data = deps.createEmpty();
    await saveRecord(bridge, { key });
    storage.setItem(deps.vaultKey, JSON.stringify(await deps.encrypt(data, key)));
    storage.removeItem(deps.legacyKeyKey);
    return { data, key };
  }

  const envelope = JSON.parse(raw) as Envelope;
  const candidates = [record?.key, record?.previous, legacy].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
  if (candidates.length === 0) throw new Error("Local vault key is missing");
  let data: Data | undefined;
  let working = "";
  for (const candidate of candidates) {
    try { data = await deps.decrypt(envelope, candidate); working = candidate; break; } catch { /* try the next one */ }
  }
  if (data === undefined) throw new Error("Local vault could not be decrypted");

  const settled = record?.key === working && !record.previous && !legacy;
  if (settled) return { data, key: working };

  if (record?.key === working) {
    // The vault already uses the protected key; only leftovers need clearing.
    await saveRecord(bridge, { key: working });
    storage.removeItem(deps.legacyKeyKey);
    return { data, key: working };
  }

  // The vault still uses an old key: switch to a fresh protected one.
  const next = record?.key && record.key !== working ? record.key : deps.createKey();
  await saveRecord(bridge, { key: next, previous: working });
  const rewritten = JSON.stringify(await deps.encrypt(data, next));
  await deps.decrypt(JSON.parse(rewritten) as Envelope, next); // must open before it replaces the old copy
  storage.setItem(deps.vaultKey, rewritten);
  await saveRecord(bridge, { key: next });
  storage.removeItem(deps.legacyKeyKey);
  return { data, key: next };
}
