// Talks to the Copyboxx server for 登录 and 同步 (D-064): email code sign-in, the person's cloud copy, sign-out and
// deleting the account. The desktop shell sends the requests (no browser rules in between, only https://copyboxx.com/api/);
// the web preview uses a pretend server kept in the page (cloud-demo.ts). Without either (a plain browser) there is no 登录.
import { demoCloudRequest } from "./cloud-demo.ts";
import { secureSecretStore } from "./secret-settings.ts";
import type { ClipboxDesktop } from "./desktop-bridge";

export type CloudRequest = { method: "GET" | "POST" | "PUT" | "DELETE"; path: string; body?: unknown; token?: string };
export type CloudResponse = { status: number; text: string };
export type CloudTransport = (request: CloudRequest) => Promise<CloudResponse>;

/** How this page reaches the server, or null when 登录 is not offered here. */
export function cloudTransport(desktop: ClipboxDesktop | undefined = typeof window === "undefined" ? undefined : window.clipboxDesktop): CloudTransport | null {
  if (desktop?.cloudDemo) return demoCloudRequest;
  if (desktop?.cloudRequest) return desktop.cloudRequest;
  return null;
}

export type CloudErrorCode = "signed_out" | "replaced" | "bad_code" | "bad_email" | "rate_limited" | "mail_failed" | "conflict" | "too_large" | "unavailable" | "network" | "server";

export class CloudError extends Error {
  readonly code: CloudErrorCode;
  readonly version?: number;
  constructor(code: CloudErrorCode, message: string, version?: number) {
    super(message);
    this.code = code;
    this.version = version;
  }
}

/** How many computers one account can be signed in on at once (the server's limit, D-069). */
export const MAX_DEVICES = 3;

const MESSAGES: Record<CloudErrorCode, string> = {
  signed_out: "登录已过期，请重新登录",
  // The server ended this computer's sign-in because the account signed in on a 4th one (D-069).
  replaced: `这个账号在别的电脑上登录了。一个账号最多同时登录 ${MAX_DEVICES} 台电脑，这台电脑已退出登录，要同步请重新登录`,
  bad_code: "验证码不对或已过期，请重新输入",
  bad_email: "邮箱格式不对，请检查一下",
  rate_limited: "发送太频繁了，请过一会儿再试",
  mail_failed: "验证码邮件没有发出去，请稍后再试",
  conflict: "另一台电脑刚同步过，请再同步一次",
  too_large: "要同步的内容太多，超过了云端的上限，这次没有上传，这台电脑上的内容没有变化",
  unavailable: "登录同步暂时不能用，请稍后再试",
  network: "连不上服务器，请检查网络后再试",
  server: "服务器出了点问题，请稍后再试",
};

function parse(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  } catch { return {}; }
}

async function call(transport: CloudTransport, request: CloudRequest): Promise<Record<string, unknown>> {
  let response: CloudResponse;
  try { response = await transport(request); } catch { throw new CloudError("network", MESSAGES.network); }
  const body = parse(response.text);
  if (response.status >= 200 && response.status < 300) return body;
  const code = typeof body.error === "string" ? body.error : "";
  if (response.status === 401 && request.token) throw code === "device_limit" ? new CloudError("replaced", MESSAGES.replaced) : new CloudError("signed_out", MESSAGES.signed_out);
  if (response.status === 409) throw new CloudError("conflict", MESSAGES.conflict, typeof body.version === "number" ? body.version : undefined);
  if (response.status === 429 || code === "rate_limited") throw new CloudError("rate_limited", MESSAGES.rate_limited);
  if (code === "bad_email") throw new CloudError("bad_email", MESSAGES.bad_email);
  if (response.status === 413 || code === "too_large") throw new CloudError("too_large", MESSAGES.too_large);
  if (response.status === 503 || code === "unavailable") throw new CloudError("unavailable", MESSAGES.unavailable);
  if (code === "mail_failed") throw new CloudError("mail_failed", MESSAGES.mail_failed);
  if (code === "bad_code" || response.status === 401) throw new CloudError("bad_code", MESSAGES.bad_code);
  throw new CloudError("server", typeof body.message === "string" && body.message ? body.message : MESSAGES.server);
}

export function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

/** Shown in the server's list of signed-in computers. */
export function deviceName(platform: string | undefined) {
  return platform === "darwin" ? "Mac 电脑" : platform === "win32" ? "Windows 电脑" : "电脑";
}

export function createCloudApi(transport: CloudTransport) {
  return {
    async sendCode(email: string) {
      await call(transport, { method: "POST", path: "/api/auth/code", body: { email: normalizeEmail(email) } });
    },
    async verify(email: string, code: string, device: string) {
      const body = await call(transport, { method: "POST", path: "/api/auth/verify", body: { email: normalizeEmail(email), code: code.trim(), device } });
      if (typeof body.token !== "string" || !body.token) throw new CloudError("server", MESSAGES.server);
      const signedOut = Array.isArray(body.signedOut) ? body.signedOut.filter((name): name is string => typeof name === "string") : [];
      return { token: body.token, email: typeof body.email === "string" ? body.email : normalizeEmail(email), signedOut };
    },
    async getVault(token: string) {
      const body = await call(transport, { method: "GET", path: "/api/vault", token });
      return { version: typeof body.version === "number" ? body.version : 0, data: body.data ?? null };
    },
    async putVault(token: string, baseVersion: number, data: unknown) {
      const body = await call(transport, { method: "PUT", path: "/api/vault", token, body: { baseVersion, data } });
      if (typeof body.version !== "number") throw new CloudError("server", MESSAGES.server);
      return body.version;
    },
    // Company 话术 for this email's domain (bound on the server), in a 同步码 library's format; nulls when none.
    async getLibrary(token: string) {
      const body = await call(transport, { method: "GET", path: "/api/library", token });
      const domain = typeof body.domain === "string" && body.domain.trim() ? body.domain.trim() : null;
      const library = body.library;
      // A library object or a bare list of entries (both read by parseSharedLibrary).
      const text = library && typeof library === "object" ? JSON.stringify(library) : null;
      return { domain, text };
    },
    async logout(token: string) {
      await call(transport, { method: "POST", path: "/api/auth/logout", token });
    },
    async deleteAccount(token: string) {
      await call(transport, { method: "DELETE", path: "/api/account", token });
    },
  };
}
export type CloudApi = ReturnType<typeof createCloudApi>;

// ---- who is signed in on this computer ----------------------------------------------------------------------------

// The email and last sync stay on this computer (never in a 完整备份, data-transfer.ts LOCAL_ONLY_KEYS), and so does the
// base of the last sync. The sign-in itself: Windows Credential Manager on Windows (like the device key, D-053);
// elsewhere the page's storage, as for the other secret settings (an unsigned Mac app can lose Keychain items, D-012).
export const CLOUD_ACCOUNT_KEY = "clipbox.cloud-account.v1";
export const CLOUD_SESSION_KEY = "clipbox.cloud-session.v1";
export const CLOUD_BASE_KEY = "clipbox.cloud-sync-base.v1";
const SESSION_NAME = "cloud-session";

export type CloudAccount = { email: string; lastSyncAt?: number; lastResult?: string };

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
const defaultStorage = (): Storage => localStorage;

export function readCloudAccount(storage: Storage = defaultStorage()): CloudAccount | null {
  try {
    const value = JSON.parse(storage.getItem(CLOUD_ACCOUNT_KEY) || "null") as CloudAccount | null;
    return value && typeof value.email === "string" && value.email ? value : null;
  } catch { return null; }
}

export function writeCloudAccount(account: CloudAccount | null, storage: Storage = defaultStorage()) {
  try {
    if (account) storage.setItem(CLOUD_ACCOUNT_KEY, JSON.stringify(account));
    else storage.removeItem(CLOUD_ACCOUNT_KEY);
  } catch { /* shown again as signed out next start */ }
}

export async function readSessionToken(storage: Storage = defaultStorage()): Promise<string> {
  const secure = secureSecretStore();
  if (secure) {
    try { return (await secure.get(SESSION_NAME)) ?? ""; } catch { return ""; }
  }
  try { return storage.getItem(CLOUD_SESSION_KEY) ?? ""; } catch { return ""; }
}

export async function writeSessionToken(token: string, storage: Storage = defaultStorage()) {
  const secure = secureSecretStore();
  if (secure) {
    await secure.set(SESSION_NAME, token);
    if ((await secure.get(SESSION_NAME)) !== token) throw new Error("没能保存登录状态，请再试一次");
    return;
  }
  storage.setItem(CLOUD_SESSION_KEY, token);
}

export async function clearSessionToken(storage: Storage = defaultStorage()) {
  const secure = secureSecretStore();
  if (secure) { try { await secure.remove(SESSION_NAME); } catch { /* the server already forgot it */ } }
  try { storage.removeItem(CLOUD_SESSION_KEY); } catch { /* nothing kept */ }
}
