// Pure helpers for 收款信息 in the hidden 保险箱 (Mac only): kinds, fields, checks and the English text sent to customers.

export type PaymentKind = "bank" | "paypal" | "wise" | "cnwallet" | "other";

export type PaymentField = {
  key: string;
  label: string;
  // Shown as the label in the English block that is copied to the customer.
  english: string;
  required?: boolean;
  multiline?: boolean;
  placeholder?: string;
};

export const PAYMENT_KINDS: { value: PaymentKind; label: string }[] = [
  { value: "bank", label: "银行电汇" },
  { value: "paypal", label: "PayPal" },
  { value: "wise", label: "Wise" },
  { value: "cnwallet", label: "支付宝·微信" },
  { value: "other", label: "其他" },
];

export const PAYMENT_FIELDS: Record<PaymentKind, PaymentField[]> = {
  bank: [
    { key: "holder", label: "收款人户名", english: "Beneficiary Name", required: true },
    { key: "bank", label: "银行名称", english: "Bank Name", required: true },
    { key: "account", label: "账号 / IBAN", english: "Account No. / IBAN", required: true },
    { key: "swift", label: "SWIFT / BIC", english: "SWIFT / BIC", required: true, placeholder: "8 或 11 位" },
    { key: "bankAddress", label: "银行地址", english: "Bank Address" },
    { key: "currency", label: "币种", english: "Currency", placeholder: "例如 USD" },
    { key: "intermediary", label: "中转行", english: "Intermediary Bank" },
  ],
  paypal: [{ key: "email", label: "PayPal 邮箱", english: "PayPal Email", required: true }],
  wise: [
    { key: "holder", label: "收款人户名", english: "Account Holder", required: true },
    { key: "account", label: "账号 / IBAN", english: "Account No. / IBAN", required: true },
    { key: "routing", label: "Routing / SWIFT", english: "Routing No. / SWIFT" },
    { key: "email", label: "Wise 邮箱", english: "Wise Email" },
    { key: "currency", label: "币种", english: "Currency", placeholder: "例如 USD" },
  ],
  cnwallet: [
    { key: "holder", label: "姓名", english: "Name" },
    { key: "account", label: "账号 / 手机号", english: "Account", required: true },
  ],
  other: [{ key: "detail", label: "收款说明", english: "Payment Details", required: true, multiline: true }],
};

export const PAYMENT_NAME_MAX = 40;
export const PAYMENT_FIELD_MAX = 300;
export const PAYMENT_MAX_ITEMS = 50;

// Optional on every typed entry (older data simply has none): 收藏, last copied, and when it went to the 回收站.
export type EntryMeta = { pinned?: boolean; lastUsedAt?: number; trashedAt?: number };

export type LoginItem = EntryMeta & {
  id: string;
  type: "login";
  name: string;
  url: string;
  username: string;
  password: string;
  // Id of a 验证码 account (clipbox.totp.v1) whose current code is shown with this login.
  totpId?: string;
  note: string;
  // Set when this login was made from a 笔记 (「转为登录」): the note exactly as it was, so 还原 can bring it back.
  fromNote?: NoteItem;
  createdAt: number;
  updatedAt: number;
};

// 笔记: free text written in Markdown. Nothing in it is hidden; it is encrypted like every other entry.
export type NoteItem = EntryMeta & {
  id: string;
  type: "note";
  name: string;
  body: string;
  createdAt: number;
  updatedAt: number;
};

// Backup codes a site gives out once ("恢复码"): one text with a code per line.
export type RecoveryItem = EntryMeta & {
  id: string;
  type: "recovery";
  name: string;
  // Website or service, free text ("Google", "shopify.com"); the badge and the grouping follow it.
  site: string;
  codes: string[];
  note: string;
  createdAt: number;
  updatedAt: number;
};

// 地址 (D-076): a company's postal address. Nothing in it is hidden. `fields` holds the parts (address-core.ts); being a
// record with no "account" / "email" key, older app versions that read it as 收款信息 still show it without failing.
export type AddressItem = EntryMeta & {
  id: string;
  type: "address";
  name: string;
  fields: Record<string, string>;
  createdAt: number;
  updatedAt: number;
};

// Lock's own sorting of an entry in 全部: another type (only for old 秘密) and/or another website. Not shown in any list.
export type MarkItem = {
  id: string;
  type: "mark";
  // "legacy:<id>" for an old 秘密 entry, "<type>:<id>" for a 保险箱 entry.
  target: string;
  as?: "login" | "payment" | "address" | "apikey" | "totp" | "recovery" | "note" | "other";
  site?: string;
  updatedAt: number;
};

// One hidden value of an API entry. The label is what a person (and the command line's --field) calls it, unique per entry.
export type ApiSecretField = { id: string; label: string; value: string };

export type ApiKeyItem = EntryMeta & {
  id: string;
  type: "apikey";
  name: string;
  // Free text, filled in from the key's prefix when left empty ("Google", "OpenAI"…).
  service: string;
  key: string;
  // The second half of a Key + Secret pair.
  secret: string;
  // Since D-061: every hidden value of the entry, in order (Key, Secret, Client ID…). When present it is the truth, and
  // key / secret above repeat its first two values so older app versions still read the entry. Entries saved before have
  // no fields; apiSecretFields() reads them from key / secret.
  fields?: ApiSecretField[];
  // Free text shown under the fields, not hidden.
  note?: string;
  // Set when this entry was made from a 笔记 (「转为 API」): the note exactly as it was, so 还原 can bring it back.
  fromNote?: NoteItem;
  endpoint: string;
  // YYYY-MM-DD, or "" when the key does not expire.
  expires: string;
  createdAt: number;
  updatedAt: number;
};

export type PaymentItem = EntryMeta & {
  id: string;
  type: "payment";
  kind: PaymentKind;
  name: string;
  fields: Record<string, string>;
  createdAt: number;
  updatedAt: number;
};

export function paymentKindLabel(kind: PaymentKind): string {
  return PAYMENT_KINDS.find((entry) => entry.value === kind)?.label ?? "其他";
}

export function stripSpaces(raw: string): string {
  return raw.replace(/\s+/g, "");
}

export function looksLikeIban(raw: string): boolean {
  return /^[A-Za-z]{2}\d{2}[A-Za-z0-9]{8,30}$/.test(stripSpaces(raw));
}

// ISO 13616: move the first four characters to the end, turn letters into numbers (A=10), the number mod 97 must be 1.
export function isValidIban(raw: string): boolean {
  const iban = stripSpaces(raw).toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(iban)) return false;
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (char) => String(char.charCodeAt(0) - 55));
  let remainder = 0;
  for (const char of digits) remainder = (remainder * 10 + Number(char)) % 97;
  return remainder === 1;
}

export function isValidSwift(raw: string): boolean {
  return /^[A-Za-z]{6}[A-Za-z0-9]{2}([A-Za-z0-9]{3})?$/.test(stripSpaces(raw));
}

export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim());
}

// Trims everything; account numbers, SWIFT and e-mail addresses lose all spaces, an IBAN is also made upper case.
export function normalizePaymentFields(kind: PaymentKind, fields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of PAYMENT_FIELDS[kind]) {
    let value = (fields[field.key] ?? "").trim();
    if (!field.multiline) value = value.replace(/[ \t]*[\r\n]+[ \t]*/g, " ");
    if (field.key === "swift" || field.key === "email" || field.key === "routing") value = stripSpaces(value);
    if (field.key === "swift") value = value.toUpperCase();
    if (field.key === "account" && (kind === "bank" || kind === "wise")) {
      value = stripSpaces(value);
      if (looksLikeIban(value)) value = value.toUpperCase();
    }
    if (field.key === "currency") value = value.toUpperCase();
    out[field.key] = value;
  }
  return out;
}

// Returns a plain message per problem, keyed by field ("name" for the title).
export function validatePayment(kind: PaymentKind, name: string, rawFields: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!name.trim()) errors.name = "请填写名称";
  const fields = normalizePaymentFields(kind, rawFields);
  for (const field of PAYMENT_FIELDS[kind]) {
    const value = fields[field.key];
    if (field.required && !value) errors[field.key] = `请填写${field.label}`;
    else if (value.length > PAYMENT_FIELD_MAX) errors[field.key] = `${field.label}太长，最多 ${PAYMENT_FIELD_MAX} 个字`;
  }
  if (kind === "bank" || kind === "wise") {
    const account = fields.account;
    if (account && looksLikeIban(account) && !isValidIban(account)) errors.account = "IBAN 校验没通过，请对照原件再看一遍";
  }
  if (kind === "bank" && fields.swift && !errors.swift && !isValidSwift(fields.swift)) errors.swift = "SWIFT / BIC 应是 8 或 11 位字母和数字";
  if (fields.email && !errors.email && !isValidEmail(fields.email)) errors.email = "邮箱格式不对";
  return errors;
}

export function clampPaymentName(raw: string): string {
  return Array.from(raw.trim().replace(/\s+/g, " ")).slice(0, PAYMENT_NAME_MAX).join("");
}

// The whole block, ready to paste to a customer, e.g. "Beneficiary Name: …".
export function buildEnglishBlock(item: Pick<PaymentItem, "kind" | "fields">): string {
  const lines: string[] = [];
  for (const field of PAYMENT_FIELDS[item.kind]) {
    const value = (item.fields[field.key] ?? "").trim();
    if (!value) continue;
    lines.push(field.multiline ? `${field.english}:\n${value}` : `${field.english}: ${value}`);
  }
  return lines.join("\n");
}

// A short clue for the list: last 4 of the account, or the e-mail.
export function paymentHint(item: Pick<PaymentItem, "kind" | "fields">): string {
  const account = item.fields.account;
  if (account) return `${paymentKindLabel(item.kind)} · 尾号 ${account.slice(-4)}`;
  if (item.fields.email) return `${paymentKindLabel(item.kind)} · ${item.fields.email}`;
  return paymentKindLabel(item.kind);
}

export function groupIban(iban: string): string {
  return stripSpaces(iban).replace(/(.{4})/g, "$1 ").trim();
}
