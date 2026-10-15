// Small settings the user typed that should not sit in plain text next to the data (D-057, audit A7): the two own TinyPNG
// keys and the 企业同步码 (or company library address). Windows desktop: Windows Credential Manager (DPAPI, this Windows
// user only), like the AI key and the device key. Browser trial and macOS: the page's storage, as before (the browser
// has no credential store; an unsigned Mac app can lose its Keychain items after an update, D-012).
//
// They are read once on start into memory, so nothing gets slower. Moving them never loses one: a value is written to the
// page's storage first and that copy is removed only after Credential Manager stored it and gave the same value back. A
// plain copy found on start is the newest value (an older app, a failed move, a restored backup) and is moved then.
import type { ClipboxDesktop } from "./desktop-bridge";

// The page's storage names and the names in Credential Manager (src-tauri/src/secret_store.rs). The storage names are the
// ones image-compress.ts and shared-library-client.ts have always used.
export const SECRET_SETTINGS: Record<string, string> = {
  "clipbox.tinify.key.v1": "tinify-key-1",
  "clipbox.tinify.key2.v1": "tinify-key-2",
  "clipbox.shared-library-url": "shared-library-url",
};

type KeyStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type SecureSecretStore = {
  get: (name: string) => Promise<string | null>;
  set: (name: string, value: string) => Promise<void>;
  remove: (name: string) => Promise<void>;
};

/** Windows Credential Manager through the desktop bridge, or null where these settings stay in the page's storage. */
export function secureSecretStore(desktop: ClipboxDesktop | undefined = typeof window === "undefined" ? undefined : window.clipboxDesktop): SecureSecretStore | null {
  if (desktop?.platform !== "win32" || !desktop.secretGet || !desktop.secretSet || !desktop.secretDelete) return null;
  return { get: desktop.secretGet, set: desktop.secretSet, remove: desktop.secretDelete };
}

/**
 * The settings as the rest of the page sees them: a storage that keeps the three secret settings in memory (backed by
 * Credential Manager) and passes every other name through to the page's storage. Until `load` has finished, and for a
 * setting Credential Manager could not read, the page's own copy is used.
 */
export function createSecretSettings(storage: KeyStorage, secure: SecureSecretStore | null) {
  const memory = new Map<string, string>();
  const chains = new Map<string, Promise<void>>();
  let loaded: Promise<void> | null = null;

  const isSecret = (key: string) => Object.prototype.hasOwnProperty.call(SECRET_SETTINGS, key);
  const inMemory = (key: string) => secure !== null && isSecret(key) && memory.has(key);

  // Writes for one setting run one after another, so Credential Manager always ends with the last value typed.
  function queue(key: string, step: () => Promise<void>) {
    const next = (chains.get(key) ?? Promise.resolve()).then(step, step);
    chains.set(key, next);
    return next;
  }

  // Credential Manager holds `value` (or nothing, for ""), then the plain copy goes; on any failure the copy stays.
  async function moveOut(key: string, value: string) {
    if (!secure) return;
    const name = SECRET_SETTINGS[key];
    try {
      if (value.trim()) {
        if ((await secure.get(name)) !== value) {
          await secure.set(name, value);
          if ((await secure.get(name)) !== value) return;
        }
      } else {
        await secure.remove(name);
        if ((await secure.get(name)) !== null) return;
      }
    } catch {
      return;
    }
    // A newer value typed meanwhile keeps its own copy until its own move.
    try { if (storage.getItem(key) === value) storage.removeItem(key); } catch { /* the copy stays; moved next start */ }
  }

  async function loadOne(key: string) {
    if (!secure) return;
    let plain: string | null = null;
    try { plain = storage.getItem(key); } catch { plain = null; }
    if (plain !== null) {
      // The plain copy is the newest value: keep using it now and move it.
      memory.set(key, plain.trim());
      await queue(key, () => moveOut(key, plain));
      return;
    }
    try {
      memory.set(key, ((await secure.get(SECRET_SETTINGS[key])) ?? "").trim());
    } catch { /* unreadable: nothing in memory, so the page's storage (empty) is used and a new value is kept there */ }
  }

  return {
    /** Reads the three settings once (moving any plain copy); safe to call again, it runs only once. Never throws. */
    load(): Promise<void> {
      loaded ??= Promise.all(Object.keys(SECRET_SETTINGS).map((key) => loadOne(key).catch(() => undefined))).then(() => undefined);
      return loaded;
    },
    /** Waits for every write started so far (tests, and before a backup is sealed). */
    settled(): Promise<void> {
      return Promise.all([...chains.values()]).then(() => undefined);
    },
    storage: {
      getItem(key: string): string | null {
        if (inMemory(key)) return memory.get(key) || null;
        return storage.getItem(key);
      },
      setItem(key: string, value: string) {
        if (!secure || !isSecret(key)) { storage.setItem(key, value); return; }
        memory.set(key, value.trim());
        // Next to the data first, then moved, so a crash in between never loses it.
        try { storage.setItem(key, value); } catch { /* the move below still runs */ }
        void queue(key, () => moveOut(key, value));
      },
      removeItem(key: string) {
        if (!secure || !isSecret(key)) { storage.removeItem(key); return; }
        memory.set(key, "");
        // An empty copy marks "removed" until Credential Manager has let go of the old value too.
        try { storage.setItem(key, ""); } catch { /* the removal below still runs */ }
        void queue(key, () => moveOut(key, ""));
      },
    } satisfies KeyStorage,
    /** The values a password-sealed 完整备份 must carry, so a new computer gets them back (they are no longer in storage). */
    forBackup(): Record<string, string> {
      if (!secure) return {};
      return Object.fromEntries([...memory].filter(([, value]) => value));
    },
  };
}

type SecretSettings = ReturnType<typeof createSecretSettings>;
let shared: SecretSettings | null = null;

function page(): SecretSettings {
  if (!shared) {
    const storage: KeyStorage = typeof localStorage === "undefined"
      ? { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }
      : localStorage;
    shared = createSecretSettings(storage, secureSecretStore());
  }
  return shared;
}

/** The page's settings storage with the secret settings handled as above. */
export function secretAwareStorage(): KeyStorage {
  return page().storage;
}

/** Called once on start, before anything reads the keys or the 同步码. */
export function loadSecretSettings(): Promise<void> {
  return page().load();
}

/** A 完整备份 carries the secret settings even where they live in Credential Manager (D-057). */
export async function withSecretSettings<T extends { localStorage: Record<string, string> }>(payload: T): Promise<T> {
  await page().settled();
  const extra = Object.entries(page().forBackup()).filter(([key]) => !payload.localStorage[key]);
  if (!extra.length) return payload;
  return { ...payload, localStorage: { ...payload.localStorage, ...Object.fromEntries(extra) } };
}
