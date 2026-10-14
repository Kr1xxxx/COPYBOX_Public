import { SYNC_BASE_URL, sharedSourceUrl, type SyncSummary } from "./shared-library.ts";

// Settings of the company 话术 library on this device: the 同步码 (or an address) typed in, empty until someone does.
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
// A 404 from a 同步码 address means the code is wrong (or nothing was published for it yet).
export async function fetchSharedLibraryText(value: string): Promise<string> {
  const target = sharedSourceUrl(value);
  if (!target) throw new Error("还没有填同步码");
  const byCode = target.startsWith(SYNC_BASE_URL);
  let address: URL;
  try { address = new URL(target); } catch { throw new Error("同步码不对，请检查一下"); }
  if (address.protocol !== "https:" && address.protocol !== "http:") throw new Error("同步码不对，请检查一下");
  const notFound = (status: number) => byCode && status === 404 ? "找不到这个同步码，请检查一下" : `公司话术库地址打不开（${status}）`;
  if (window.clipboxDesktop?.fetchSharedLibrary) {
    try { return await window.clipboxDesktop.fetchSharedLibrary(address.href); } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(/（404）/.test(message) ? notFound(404) : message);
    }
  }
  try {
    const response = await fetch(address, { credentials: "omit", cache: "no-store" });
    if (!response.ok) throw new Error(notFound(response.status));
    return await response.text();
  } catch (error) {
    throw error instanceof Error && /公司话术库|同步码/.test(error.message) ? error : new Error("无法连接到公司话术库地址");
  }
}
