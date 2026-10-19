// 密码体检 and 导出账号表格: both work only on what is already on this device; nothing is sent anywhere.
import { addressBlock } from "./address-core.ts";
import { apiSecretFields } from "./apikey-core.ts";
import { buildEnglishBlock, type LoginItem } from "./payment-core.ts";
import type { VaultItem } from "./secret-items-store.ts";
import { accountTitle, type TotpAccount } from "./totp-core.ts";

export const SHORT_PASSWORD = 10;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export type PasswordHealth = { reused: LoginItem[][]; short: LoginItem[]; old: LoginItem[] };

// Logins in the 回收站 or without a password are left out. 「一年没改」 reads the entry's last change (updatedAt).
export function passwordHealth(items: VaultItem[], now: number): PasswordHealth {
  const logins = items.filter((item): item is LoginItem => item.type === "login" && !item.trashedAt && item.password !== "");
  const byPassword = new Map<string, LoginItem[]>();
  for (const login of logins) byPassword.set(login.password, [...(byPassword.get(login.password) ?? []), login]);
  return {
    reused: [...byPassword.values()].filter((group) => group.length > 1),
    short: logins.filter((login) => [...login.password].length < SHORT_PASSWORD),
    old: logins.filter((login) => now - login.updatedAt > YEAR_MS),
  };
}

const HEADER = ["类型", "名称", "网址", "用户名", "密码或密钥", "备注"];

function cell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Every 账号 entry outside the 回收站 as one CSV row, readable in Excel (BOM + CRLF). Old 秘密 come last as 其他.
export function accountCsv(items: VaultItem[], totps: TotpAccount[], legacy: { label: string; secret: string }[] = []): string {
  const rows: string[][] = [];
  for (const item of items) {
    if (item.type === "mark" || item.trashedAt) continue;
    if (item.type === "login") rows.push(["登录", item.name, item.url, item.username, item.password, item.note]);
    else if (item.type === "apikey") {
      const fields = apiSecretFields(item);
      const secret = fields.length === 1 ? fields[0].value : fields.map((field) => `${field.label}: ${field.value}`).join("\n");
      rows.push(["API 密钥", item.name, item.endpoint, "", secret, [item.service, item.expires && `到期 ${item.expires}`, item.note ?? ""].filter(Boolean).join("\n")]);
    } else if (item.type === "payment") rows.push(["收款信息", item.name, "", "", "", buildEnglishBlock(item)]);
    else if (item.type === "address") rows.push(["地址", item.name, "", "", "", addressBlock(item)]);
    else if (item.type === "recovery") rows.push(["恢复码", item.name, item.site, "", item.codes.join("\n"), item.note]);
    else if (item.type === "note") rows.push(["笔记", item.name, "", "", "", item.body]);
  }
  for (const account of totps) if (!account.trashedAt) rows.push(["验证码", accountTitle(account), "", account.name, account.secret, ""]);
  for (const secret of legacy) rows.push(["其他", secret.label, "", "", secret.secret, ""]);
  return "﻿" + [HEADER, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
