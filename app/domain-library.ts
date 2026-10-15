// Company 话术 by email domain: someone signed in to 登录同步 (D-064) with an address at a domain the company bound on
// the server gets that company's library from GET /api/library, in the same format a 同步码 delivers (D-052).
// A typed 同步码 always wins. While this computer receives a domain library, the build's own preset (D-066) is not
// applied on start, so the two never fight. The marker below stays on this computer (never in a 完整备份).
import type { SyncSummary } from "./shared-library.ts";

export const DOMAIN_LIBRARY_KEY = "clipbox.domain-library.v1";

export type DomainLibraryMark = { domain: string; at: number };

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
const defaultStorage = (): Storage => localStorage;

export function readDomainLibrary(storage: Storage = defaultStorage()): DomainLibraryMark | null {
  try {
    const value = JSON.parse(storage.getItem(DOMAIN_LIBRARY_KEY) || "null") as DomainLibraryMark | null;
    return value && typeof value.domain === "string" && value.domain && typeof value.at === "number" ? value : null;
  } catch { return null; }
}

export function writeDomainLibrary(mark: DomainLibraryMark | null, storage: Storage = defaultStorage()) {
  try {
    if (mark) storage.setItem(DOMAIN_LIBRARY_KEY, JSON.stringify(mark));
    else storage.removeItem(DOMAIN_LIBRARY_KEY);
  } catch { /* asked again on the next round */ }
}

export function emailDomain(email: string) {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).trim().toLowerCase() : "";
}

/** Whether a library bound to `domain` belongs to this email: exactly its domain, like the server (D-072). */
export function emailAtDomain(email: string, domain: string) {
  const own = emailDomain(email);
  return Boolean(own) && own === domain.trim().toLowerCase();
}

/** Ask the server only when signed in and no 同步码 is typed. */
export function shouldFetchDomainLibrary({ syncCode, email }: { syncCode: string; email: string }) {
  return !syncCode.trim() && Boolean(email);
}

/** The build's own 话术 are added on start only without a 同步码 and while no domain library comes in. */
export function shouldApplyPreset({ preset, syncCode, mark }: { preset: string; syncCode: string; mark: DomainLibraryMark | null }) {
  return Boolean(preset) && !syncCode.trim() && !mark;
}

/**
 * Keeps the marker in line with who is signed in: cleared when signed out, and when the account's email is at another
 * domain than the library came from (signed in as someone else). Returns the marker that still holds.
 */
export function settleDomainMark(email: string, storage: Storage = defaultStorage()): DomainLibraryMark | null {
  const mark = readDomainLibrary(storage);
  if (!mark) return null;
  if (!emailAtDomain(email, mark.domain)) {
    writeDomainLibrary(null, storage);
    return null;
  }
  return mark;
}

/** The server's answer: remember the domain and hand back the library to apply, or forget it and apply nothing. */
export function takeDomainAnswer(answer: { domain: string | null; text: string | null }, now: number, storage: Storage = defaultStorage()): { domain: string; text: string } | null {
  if (answer.domain && answer.text) {
    writeDomainLibrary({ domain: answer.domain, at: now }, storage);
    return { domain: answer.domain, text: answer.text };
  }
  writeDomainLibrary(null, storage);
  return null;
}

/** Same quiet rule as a 同步码: a toast only when something changed. */
export function syncChangedSomething(summary: SyncSummary) {
  return Boolean(summary.added || summary.updated || summary.keptMine || summary.retired);
}

/** The domain to name in Settings: only while signed in at that domain, a library comes in and no 同步码 is typed. */
export function domainLibraryActive(domain: string, email: string, syncCode: string) {
  return !syncCode.trim() && emailAtDomain(email, domain) ? domain : "";
}

/** The line in Settings → 登录同步 while a domain library comes in. */
export function domainLibraryLine(domain: string) {
  return `公司话术：按邮箱自动获取（${domain}）`;
}
