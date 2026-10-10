import type { SyncSummary } from "./shared-library.ts";

// Settings of the company 话术 library on this device. The address is empty until someone types one in.
export const SHARED_URL_KEY = "clipbox.shared-library-url";
const SHARED_LAST_KEY = "clipbox.shared-library-last";

function read(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function write(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* the sync still worked, only the memory of it is lost */ } }

export function readSharedUrl() { return (read(SHARED_URL_KEY) || "").trim(); }
export function writeSharedUrl(url: string) { write(SHARED_URL_KEY, url.trim()); }

export function readSharedSummary(): SyncSummary | null {
  try {
    const parsed = JSON.parse(read(SHARED_LAST_KEY) || "null") as SyncSummary | null;
    return parsed && typeof parsed.at === "number" ? parsed : null;
  } catch { return null; }
}
export function writeSharedSummary(summary: SyncSummary) { write(SHARED_LAST_KEY, JSON.stringify(summary)); }

// The desktop app reads the address itself (no browser limits); the web version needs an address that allows it.
export async function fetchSharedLibraryText(url: string): Promise<string> {
  const target = url.trim();
  if (!target) throw new Error("还没有填公司话术库地址");
  if (window.clipboxDesktop?.fetchSharedLibrary) return window.clipboxDesktop.fetchSharedLibrary(target);
  let address: URL;
  try { address = new URL(target, window.location.href); } catch { throw new Error("地址不对，要以 https:// 开头"); }
  if (address.protocol !== "https:" && address.protocol !== "http:") throw new Error("地址不对，要以 https:// 开头");
  try {
    const response = await fetch(address, { credentials: "omit", cache: "no-store" });
    if (!response.ok) throw new Error(`公司话术库地址打不开（${response.status}）`);
    return await response.text();
  } catch (error) {
    throw error instanceof Error && /公司话术库/.test(error.message) ? error : new Error("无法连接到公司话术库地址");
  }
}
