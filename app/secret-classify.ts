// Guesses what an old 秘密 entry is, from its title and content, so it can be sorted in the 保险箱 overview.
// A guess only: nothing is moved, and Lock can change it by hand. Pure function.
import { isValidIban } from "./payment-core.ts";
import { siteFromApiKey } from "./site-core.ts";
import { isValidBase32 } from "./totp-core.ts";

export type VaultKind = "login" | "payment" | "apikey" | "totp" | "recovery" | "other";

export function classifySecret(label: string, secret: string): VaultKind {
  const title = label.toLowerCase();
  const text = secret.trim();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (/恢复码|备份码|recovery|backup code/.test(title)) return "recovery";
  if (lines.length >= 4 && lines.every((line) => /^[A-Za-z0-9][A-Za-z0-9 -]{5,19}$/.test(line))) return "recovery";
  if (/^otpauth:\/\//i.test(text) || /验证码|2fa|totp|authenticator/.test(title)) return "totp";
  if (lines.length === 1 && /^[A-Za-z2-7 ]{16,}$/.test(text) && isValidBase32(text) && !/\s{2}/.test(text) && /[2-7]/.test(text)) return "totp";
  if (siteFromApiKey(text) || /api|密钥|token|secret key/.test(title) || (lines.length === 1 && /^[A-Za-z0-9_\-.]{32,}$/.test(text))) return "apikey";
  if (isValidIban(text.replace(/[^A-Za-z0-9]/g, "")) || /iban|swift|收款|银行|汇款|paypal|wise|户名|账号.*(银行|卡)/.test(title) || /户名|iban|swift|beneficiary/i.test(text)) return "payment";
  if (/密码|password|登录|login|账号|账户|account/.test(title) || /(密码|password)\s*[:：]/i.test(text)) return "login";
  return "other";
}
