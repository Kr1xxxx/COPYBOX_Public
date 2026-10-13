// PBKDF2 (310 000 rounds) is slow on purpose. Every encrypted store derives its AES key from the same secret and a
// salt that stays the same between saves, so the result is the same key every time: it is worked out once and kept
// in memory (never stored). Nothing about what is written changes: same salt, same rounds, a fresh IV per write.

const MAX_KEYS = 16;
const derived = new Map<string, Promise<CryptoKey>>();

function saltText(salt: Uint8Array) {
  let text = "";
  for (let index = 0; index < salt.length; index += 1) text += salt[index].toString(16).padStart(2, "0");
  return text;
}

/** AES-GCM 256 key (encrypt + decrypt, not extractable) from PBKDF2-SHA-256, the same key as a fresh derivation. */
export function derivePbkdf2AesKey(secret: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const id = `${iterations}:${saltText(salt)}:${secret}`;
  const known = derived.get(id);
  if (known) {
    // Most recently used goes to the end, so the oldest is the one dropped when the cache is full.
    derived.delete(id);
    derived.set(id, known);
    return known;
  }
  const pending = (async () => {
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  })();
  derived.set(id, pending);
  // A failed derivation is not kept, so the next attempt tries again.
  pending.catch(() => { if (derived.get(id) === pending) derived.delete(id); });
  while (derived.size > MAX_KEYS) derived.delete(derived.keys().next().value as string);
  return pending;
}

/** Forgets every kept key (tests). */
export function clearDerivedKeys() {
  derived.clear();
}
