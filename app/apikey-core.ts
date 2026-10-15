// Pure helpers for API 密钥 in the 保险箱.
import type { ApiSecretField } from "./payment-core.ts";

export const APIKEY_REMIND_DAYS = 7;

// Pasted keys often carry a trailing newline or spaces; a key itself never has any.
export function cleanApiKey(raw: string): string {
  return raw.trim();
}

export function hasInnerSpace(value: string): boolean {
  return /\s/.test(value.trim());
}

export function lastFour(value: string): string {
  return value.length <= 4 ? value : value.slice(-4);
}

function parseDay(day: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const value = new Date(year, month - 1, date);
  return value.getFullYear() === year && value.getMonth() === month - 1 && value.getDate() === date ? value.getTime() : null;
}

export function isValidDay(day: string): boolean {
  return parseDay(day) !== null;
}

// Whole days from today until the expiry day (negative once it has passed); null when there is no valid date.
export function daysUntil(day: string, now: number): number | null {
  const at = parseDay(day);
  if (at === null) return null;
  const today = new Date(now);
  return Math.round((at - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000);
}

export type ExpiryState = { kind: "none" | "ok" | "soon" | "expired"; text: string };

export function expiryState(day: string, now: number): ExpiryState {
  const days = daysUntil(day, now);
  if (days === null) return { kind: "none", text: "" };
  if (days < 0) return { kind: "expired", text: `已过期 ${-days} 天` };
  if (days === 0) return { kind: "soon", text: "今天到期" };
  if (days <= APIKEY_REMIND_DAYS) return { kind: "soon", text: `${days} 天后到期` };
  return { kind: "ok", text: `${day} 到期` };
}

// ---- Several hidden fields per entry (D-061) ----

export type ApiField = ApiSecretField;
type FieldSource = { key: string; secret: string; fields?: unknown };

export const API_FIELD_MAX = 10;
export const API_FIELD_LABEL_MAX = 30;
export const API_NOTE_MAX = 2000;
// Offered when a field is added; the person can type any other name.
export const API_FIELD_SUGGESTIONS = ["Secret", "Client ID", "Client Secret", "App ID", "Token", "Access Key", "Secret Key"];

function isField(value: unknown): value is ApiField {
  const field = value as ApiField;
  return Boolean(field) && typeof field === "object" && typeof field.id === "string" && typeof field.label === "string" && typeof field.value === "string";
}

// The fields of an entry. Entries saved before D-061 (and old backups) have only key / secret: the key becomes the first
// field 「密钥」 and a non-empty secret the second 「Secret」, so nothing is lost and nothing has to be rewritten.
export function apiSecretFields(item: FieldSource): ApiField[] {
  if (Array.isArray(item.fields)) {
    const fields = item.fields.filter(isField);
    if (fields.length > 0) return fields.map((field) => ({ id: field.id, label: field.label, value: field.value }));
  }
  return [{ id: "key", label: "密钥", value: item.key ?? "" }, ...(item.secret ? [{ id: "secret", label: "Secret", value: item.secret }] : [])];
}

function labelKey(label: string) {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

// A field asked for by name (any case, extra spaces ignored), or by its position "1", "2"… when no label matches.
export function findApiField(fields: ApiField[], name: string): ApiField | undefined {
  const wanted = labelKey(name);
  if (!wanted) return undefined;
  const byLabel = fields.find((field) => labelKey(field.label) === wanted);
  if (byLabel) return byLabel;
  return /^\d+$/.test(wanted) ? fields[Number(wanted) - 1] : undefined;
}

// What gets stored: the fields themselves, plus key / secret repeating the first two values for older app versions.
export function storedApiFields(fields: ApiField[]): { fields: ApiField[]; key: string; secret: string } {
  return { fields, key: fields[0]?.value ?? "", secret: fields[1]?.value ?? "" };
}

export type ApiFieldErrors = Record<string, { label?: string; value?: string }>;

// Checks the fields of the editor: at least one value, every filled field named, names unique, the first value (the key
// people paste) without inner spaces. Returns the cleaned fields (empty rows dropped) and the errors per field id.
export function checkApiFields(draft: ApiField[]): { fields: ApiField[]; errors: ApiFieldErrors } {
  const errors: ApiFieldErrors = {};
  const fields = draft
    .map((field) => ({ id: field.id, label: field.label.trim().replace(/\s+/g, " "), value: cleanApiKey(field.value) }))
    .filter((field) => field.value || field.label);
  const seen = new Set<string>();
  fields.forEach((field, index) => {
    const found: { label?: string; value?: string } = {};
    if (!field.value) found.value = "请填写内容，或删掉这一行";
    else if (index === 0 && hasInnerSpace(field.value)) found.value = "中间不能有空格，请检查有没有多复制了别的内容";
    if (!field.label) found.label = "请给这一项起个名字";
    else if (Array.from(field.label).length > API_FIELD_LABEL_MAX) found.label = `名字最多 ${API_FIELD_LABEL_MAX} 个字`;
    else if (seen.has(labelKey(field.label))) found.label = "名字重复了";
    else if (/^\d+$/.test(field.label)) found.label = "名字不能只有数字";
    if (field.label) seen.add(labelKey(field.label));
    if (found.label || found.value) errors[field.id] = found;
  });
  if (fields.length === 0) errors[draft[0]?.id ?? "key"] = { value: "请至少填写一项" };
  return { fields, errors };
}

// The next name to offer for a new row: the first suggestion not used yet.
export function nextFieldLabel(fields: ApiField[]): string {
  const used = new Set(fields.map((field) => labelKey(field.label)));
  return API_FIELD_SUGGESTIONS.find((label) => !used.has(labelKey(label))) ?? "";
}

// The small line under the name: service, last four of the first field, and how many fields there are when more than one.
export function apiKeyHint(item: FieldSource & { service: string }): string {
  const fields = apiSecretFields(item);
  return `${item.service ? `${item.service} · ` : ""}尾号 ${lastFour(fields[0]?.value ?? "")}${fields.length > 1 ? ` · ${fields.length} 项` : ""}`;
}
