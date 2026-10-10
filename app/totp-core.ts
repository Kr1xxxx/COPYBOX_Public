// Pure helpers for the hidden 验证码 (TOTP, RFC 6238) feature on the Mac. No storage and no UI here.

export type TotpAlgorithm = "SHA1" | "SHA256" | "SHA512";

export type TotpAccount = {
  id: string;
  issuer: string;
  name: string;
  // Normalised base32 secret: upper case, no spaces or padding.
  secret: string;
  digits: number;
  period: number;
  algorithm: TotpAlgorithm;
  createdAt: number;
};

export const TOTP_MAX_ACCOUNTS = 30;
export const TOTP_NAME_MAX = 40;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function normalizeBase32(raw: string): string {
  return raw.replace(/[\s-]+/g, "").replace(/=+$/, "").toUpperCase();
}

export function isValidBase32(raw: string): boolean {
  const value = normalizeBase32(raw);
  return value.length >= 8 && /^[A-Z2-7]+$/.test(value);
}

export function base32Decode(raw: string): Uint8Array<ArrayBuffer> {
  const value = normalizeBase32(raw);
  if (!/^[A-Z2-7]*$/.test(value)) throw new Error("密钥格式不对");
  const bytes: number[] = [];
  let bits = 0;
  let buffer = 0;
  for (const char of value) {
    buffer = (buffer << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

export type TotpDraft = Pick<TotpAccount, "issuer" | "name" | "secret" | "digits" | "period" | "algorithm">;

function clampName(raw: string) {
  return Array.from(raw.trim().replace(/\s+/g, " ")).slice(0, TOTP_NAME_MAX).join("");
}

// Accepts an otpauth://totp/Issuer:name?secret=...&issuer=... link or a bare secret (spaces and dashes allowed).
export function parseTotpInput(raw: string, fallbackName = ""): TotpDraft {
  const text = raw.trim();
  if (!text) throw new Error("请粘贴密钥或 otpauth:// 链接");
  if (/^otpauth:/i.test(text)) {
    let url: URL;
    try { url = new URL(text); } catch { throw new Error("链接格式不对"); }
    if (url.hostname.toLowerCase() !== "totp") throw new Error("只支持基于时间的验证码（totp）");
    const params = url.searchParams;
    const secret = normalizeBase32(params.get("secret") ?? "");
    if (!isValidBase32(secret)) throw new Error("链接里的密钥不对");
    const label = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    const colon = label.indexOf(":");
    const labelIssuer = colon >= 0 ? label.slice(0, colon) : "";
    const labelName = colon >= 0 ? label.slice(colon + 1) : label;
    const algorithm = (params.get("algorithm") ?? "SHA1").toUpperCase();
    if (algorithm !== "SHA1" && algorithm !== "SHA256" && algorithm !== "SHA512") throw new Error("不支持这种算法");
    const digits = Number(params.get("digits") ?? 6);
    const period = Number(params.get("period") ?? 30);
    if (digits !== 6 && digits !== 7 && digits !== 8) throw new Error("不支持这个位数");
    if (!Number.isInteger(period) || period < 10 || period > 120) throw new Error("不支持这个刷新间隔");
    return {
      issuer: clampName(params.get("issuer") || labelIssuer),
      name: clampName(labelName || fallbackName),
      secret, digits, period, algorithm,
    };
  }
  const secret = normalizeBase32(text);
  if (!isValidBase32(secret)) throw new Error("密钥不对：只能有字母 A-Z 和数字 2-7，至少 8 位");
  return { issuer: "", name: clampName(fallbackName), secret, digits: 6, period: 30, algorithm: "SHA1" };
}

const HASH_NAMES: Record<TotpAlgorithm, string> = { SHA1: "SHA-1", SHA256: "SHA-256", SHA512: "SHA-512" };

export async function generateTotp(account: Pick<TotpAccount, "secret" | "digits" | "period" | "algorithm">, timeMs: number): Promise<string> {
  const counter = Math.floor(timeMs / 1000 / account.period);
  const message = new Uint8Array(8);
  new DataView(message.buffer).setBigUint64(0, BigInt(counter));
  const key = await crypto.subtle.importKey("raw", base32Decode(account.secret), { name: "HMAC", hash: HASH_NAMES[account.algorithm] }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 10 ** account.digits).padStart(account.digits, "0");
}

export function secondsLeft(period: number, timeMs: number): number {
  return period - (Math.floor(timeMs / 1000) % period);
}

// "123456" → "123 456", "12345678" → "1234 5678".
export function formatCode(code: string): string {
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)} ${code.slice(half)}`;
}

export function accountTitle(account: Pick<TotpAccount, "issuer" | "name">): string {
  return account.issuer || account.name || "未命名账号";
}
