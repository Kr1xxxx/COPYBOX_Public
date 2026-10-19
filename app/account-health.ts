// 密码体检 and 导出账号表格: both work only on what is already on this device; nothing is sent anywhere.
import { ADDRESS_FIELDS } from "./address-core.ts";
import { apiSecretFields, storedApiFields } from "./apikey-core.ts";
import { PAYMENT_FIELDS, PAYMENT_KINDS, type LoginItem, type PaymentKind } from "./payment-core.ts";
import type { VaultItem } from "./secret-items-store.ts";
import { accountTitle, parseTotpInput, type TotpAccount } from "./totp-core.ts";

export const SHORT_PASSWORD = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * DAY_MS;
// When 密码体检 was last opened (ms); after two months the check runs by itself and a red dot shows if it finds anything.
export const CHECKUP_SEEN_KEY = "clipbox.password-checkup-seen.v1";
export const CHECKUP_EVERY_MS = 60 * DAY_MS;

export type PasswordHealth = { reused: LoginItem[][]; weak: LoginItem[]; short: LoginItem[]; old: LoginItem[] };

// Weak: long enough, but fewer than three of lower case, upper case, digits, symbols (e.g. "password2024", "1234567890").
export function isWeakPassword(password: string): boolean {
  return [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((kind) => kind.test(password)).length < 3;
}

// Never opened counts as due, so a problem shows from the start; afterwards once every two months.
export function checkupDue(seenAt: number | null, now: number): boolean {
  return seenAt === null || now - seenAt >= CHECKUP_EVERY_MS;
}

export function hasProblems(health: PasswordHealth): boolean {
  return health.reused.length + health.weak.length + health.short.length + health.old.length > 0;
}

// Logins in the 回收站 or without a password are left out. 「一年没改」 reads when the password last changed.
export function passwordHealth(items: VaultItem[], now: number): PasswordHealth {
  const logins = items.filter((item): item is LoginItem => item.type === "login" && !item.trashedAt && item.password !== "");
  const byPassword = new Map<string, LoginItem[]>();
  for (const login of logins) byPassword.set(login.password, [...(byPassword.get(login.password) ?? []), login]);
  return {
    reused: [...byPassword.values()].filter((group) => group.length > 1),
    weak: logins.filter((login) => [...login.password].length >= SHORT_PASSWORD && isWeakPassword(login.password)),
    short: logins.filter((login) => [...login.password].length < SHORT_PASSWORD),
    old: logins.filter((login) => now - (login.passwordChangedAt ?? login.updatedAt) > YEAR_MS),
  };
}

export const SHEET_HEADER = ["类型", "名称", "网址", "用户名", "密码或密钥", "备注", "密码修改日期"];

function cell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function day(ms: number) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// 收款信息 and 地址 as 「名称: 内容」 lines, so the table reads well and comes back field by field.
function labeled(fields: { key: string; label: string }[], values: Record<string, string>) {
  return fields.filter((field) => (values[field.key] ?? "").trim()).map((field) => `${field.label}: ${values[field.key].trim()}`).join("\n");
}

// A line that starts with a known 「名称: 」 starts that field; any other line continues the field before it.
function unlabel(text: string, fields: { key: string; label: string }[]): Record<string, string> {
  const values: Record<string, string> = {};
  let current = "";
  for (const line of text.split("\n")) {
    const field = fields.find((candidate) => line.startsWith(`${candidate.label}: `));
    if (field) { current = field.key; values[current] = line.slice(field.label.length + 2); }
    else if (current) values[current] += `\n${line}`;
  }
  return values;
}

const KIND_LINE = "方式";

// A 验证码 with the usual settings is just its secret; anything else goes as an otpauth:// link so nothing is lost.
function totpCell(account: TotpAccount) {
  if (account.digits === 6 && account.period === 30 && account.algorithm === "SHA1") return account.secret;
  return `otpauth://totp/${encodeURIComponent(account.name || account.issuer)}?secret=${account.secret}&issuer=${encodeURIComponent(account.issuer)}&digits=${account.digits}&period=${account.period}&algorithm=${account.algorithm}`;
}

// Every 账号 entry outside the 回收站 as one table row. Old 秘密 come last as 其他.
export function accountRows(items: VaultItem[], totps: TotpAccount[], legacy: { label: string; secret: string }[] = []): string[][] {
  const rows: string[][] = [];
  for (const item of items) {
    if (item.type === "mark" || item.trashedAt) continue;
    if (item.type === "login") rows.push(["登录", item.name, item.url, item.username, item.password, item.note, day(item.passwordChangedAt ?? item.updatedAt)]);
    else if (item.type === "apikey") {
      const fields = apiSecretFields(item);
      const secret = fields.length === 1 ? fields[0].value : fields.map((field) => `${field.label}: ${field.value}`).join("\n");
      rows.push(["API 密钥", item.name, item.endpoint, "", secret, [item.expires && `到期 ${item.expires}`, item.note ?? ""].filter(Boolean).join("\n"), ""]);
    } else if (item.type === "payment") {
      const kind = PAYMENT_KINDS.find((entry) => entry.value === item.kind)?.label ?? "";
      rows.push(["收款信息", item.name, "", "", "", [`${KIND_LINE}: ${kind}`, labeled(PAYMENT_FIELDS[item.kind] ?? [], item.fields)].filter(Boolean).join("\n"), ""]);
    } else if (item.type === "address") rows.push(["地址", item.name, "", "", "", labeled(ADDRESS_FIELDS, item.fields), ""]);
    else if (item.type === "recovery") rows.push(["恢复码", item.name, item.site, "", item.codes.join("\n"), item.note, ""]);
    else if (item.type === "note") rows.push(["笔记", item.name, "", "", "", item.body, ""]);
  }
  for (const account of totps) if (!account.trashedAt) rows.push(["验证码", accountTitle(account), "", account.name, totpCell(account), "", ""]);
  for (const secret of legacy) rows.push(["其他", secret.label, "", "", secret.secret, "", ""]);
  return rows;
}

// The table as a CSV file Excel opens directly (BOM + CRLF).
export function accountCsv(items: VaultItem[], totps: TotpAccount[], legacy: { label: string; secret: string }[] = []): string {
  return "\uFEFF" + [SHEET_HEADER, ...accountRows(items, totps, legacy)].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export type SheetImport = { items: VaultItem[]; totps: TotpAccount[]; skipped: number; unreadable: number };

const rowKey = (row: string[]) => JSON.stringify(row.slice(0, 6).map((value) => value.trim()));

// Reads an exported 账号表格 back. Rows already here (same type, name, website, user, password and note) are skipped;
// 其他, a 收款信息 of an unknown 方式 and the types this platform has no category for come back as 笔记 with their text.
export function accountsFromSheet(rows: string[][], existing: string[][], hidden: string[], now: number, newId: () => string): SheetImport {
  const header = rows[0]?.map((value) => value.trim()) ?? [];
  if (SHEET_HEADER.slice(0, 6).some((name, index) => header[index] !== name)) throw new Error("这不是 Copyboxx 导出的账号表格（第一行应是 类型、名称、网址…）");
  const seen = new Set(existing.map(rowKey));
  const result: SheetImport = { items: [], totps: [], skipped: 0, unreadable: 0 };
  for (const raw of rows.slice(1)) {
    const row = [...raw, "", "", "", "", "", "", ""].slice(0, 7).map((value) => value ?? "");
    const [type, name, url, username, secret, note, changed] = row.map((value, index) => (index === 4 || index === 5 ? value : value.trim()));
    if (!type && !name) continue;
    if (seen.has(rowKey(row))) { result.skipped += 1; continue; }
    seen.add(rowKey(row));
    const base = { id: newId(), name: Array.from(name || "（没有标题）").slice(0, 40).join(""), createdAt: now, updatedAt: now };
    const asNote = () => result.items.push({ ...base, type: "note", body: [secret, note].filter(Boolean).join("\n") });
    if (type === "登录" && secret) {
      const changedAt = Date.parse(changed);
      result.items.push({ ...base, type: "login", url, username, password: secret, note, ...(changedAt > 0 ? { passwordChangedAt: changedAt } : {}) });
    } else if (type === "API 密钥" && secret && !hidden.includes("apikey")) {
      const lines = secret.split("\n").filter((line) => line.trim());
      const labelled = lines.length > 1 && lines.every((line) => /^[^:\n]{1,30}: /.test(line));
      const fields = labelled ? lines.map((line, index) => ({ id: `f${index}`, label: line.slice(0, line.indexOf(": ")), value: line.slice(line.indexOf(": ") + 2) })) : [{ id: "f0", label: "密钥", value: secret.trim() }];
      const expiry = /^到期 (\d{4}-\d{2}-\d{2})(?:\n|$)/.exec(note);
      result.items.push({ ...base, type: "apikey", service: "", endpoint: url, expires: expiry?.[1] ?? "", note: expiry ? note.slice(expiry[0].length) : note, ...storedApiFields(fields) });
    } else if (type === "恢复码" && secret && !hidden.includes("recovery")) {
      result.items.push({ ...base, type: "recovery", site: url, codes: secret.split("\n").map((code) => code.trim()).filter(Boolean), note });
    } else if (type === "收款信息" && PAYMENT_KINDS.some((entry) => note.startsWith(`${KIND_LINE}: ${entry.label}\n`))) {
      const kind = PAYMENT_KINDS.find((entry) => note.startsWith(`${KIND_LINE}: ${entry.label}\n`))!.value as PaymentKind;
      result.items.push({ ...base, type: "payment", kind, fields: unlabel(note, PAYMENT_FIELDS[kind]) });
    } else if (type === "地址" && note) {
      result.items.push({ ...base, type: "address", fields: unlabel(note, ADDRESS_FIELDS) });
    } else if (type === "验证码" && secret) {
      try {
        const draft = parseTotpInput(secret, username);
        result.totps.push({ ...draft, issuer: draft.issuer || name, id: base.id, createdAt: now });
      } catch { result.unreadable += 1; }
    } else if (["笔记", "收款信息", "地址", "其他", "API 密钥", "恢复码"].includes(type) && (secret || note)) asNote();
    else result.unreadable += 1;
  }
  return result;
}
