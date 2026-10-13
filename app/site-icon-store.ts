// Encrypted local cache of website icons fetched once from the sites themselves (Mac 保险箱). One AES-GCM envelope in its
// own localStorage key, keyed from the device key like the other 保险箱 data. A site with no icon is remembered too, and asked again after a month.
import { derivePbkdf2AesKey } from "./key-cache.ts";
import { assertWritesOpen } from "./write-gate.ts";

export const SITE_ICONS_KEY = "clipbox.site-icons.v1";
const ITERATIONS = 310_000;
const LABEL = new TextEncoder().encode("clipbox-site-icons:icons");
const RETRY_MS = 30 * 86_400_000;
const MAX_ENTRIES = 300;

// data "" = the site has no usable icon.
export type SiteIconEntry = { data: string; at: number };
export type SiteIconMap = Record<string, SiteIconEntry>;
type Envelope = { version: 1; salt: string; iv: string; ciphertext: string; iterations: number };
export type SiteIconStorage = Pick<Storage, "getItem" | "setItem">;

function toBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function deriveKey(deviceKey: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  return derivePbkdf2AesKey(deviceKey, salt, iterations);
}

// A rewrite keeps the salt of what is stored (the IV is new every time), so the key is the same and comes from memory.
function saltFor(raw: string | null) {
  try {
    const stored = raw ? (JSON.parse(raw) as Partial<Envelope>) : null;
    if (stored && stored.iterations === ITERATIONS && typeof stored.salt === "string") {
      const salt = fromBase64(stored.salt);
      if (salt.length === 16) return salt;
    }
  } catch { /* unreadable: start a new salt */ }
  return crypto.getRandomValues(new Uint8Array(16));
}

export function needsFetch(map: SiteIconMap, key: string, now: number) {
  const entry = map[key];
  return !entry || (!entry.data && now - entry.at > RETRY_MS);
}

export function isIconData(value: string) {
  return /^data:image\/(png|x-icon|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}

export async function readSiteIcons(deviceKey: string, storage: SiteIconStorage = localStorage): Promise<SiteIconMap> {
  const raw = storage.getItem(SITE_ICONS_KEY);
  if (!raw) return {};
  try {
    const envelope = JSON.parse(raw) as Envelope;
    const key = await deriveKey(deviceKey, fromBase64(envelope.salt), envelope.iterations);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(envelope.iv), additionalData: LABEL }, key, fromBase64(envelope.ciphertext));
    return (JSON.parse(new TextDecoder().decode(plain)) as { icons: SiteIconMap }).icons ?? {};
  } catch {
    // Only a cache: if it cannot be read, icons are fetched again.
    return {};
  }
}

export async function writeSiteIcons(deviceKey: string, map: SiteIconMap, storage: SiteIconStorage = localStorage) {
  const newest = Object.entries(map).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_ENTRIES);
  const salt = saltFor(storage.getItem(SITE_ICONS_KEY));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(deviceKey, salt, ITERATIONS);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: LABEL }, key, new TextEncoder().encode(JSON.stringify({ icons: Object.fromEntries(newest) })));
  const envelope: Envelope = { version: 1, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(encrypted)), iterations: ITERATIONS };
  assertWritesOpen();
  storage.setItem(SITE_ICONS_KEY, JSON.stringify(envelope));
}
