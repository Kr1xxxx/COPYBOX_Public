// Pure helpers for 地址 in 账号 (D-076): the fields of a company address and the text that one click copies.
import type { AddressItem } from "./payment-core.ts";

export type AddressField = { key: string; label: string; multiline?: boolean; placeholder?: string };

export const ADDRESS_FIELDS: AddressField[] = [
  { key: "contact", label: "联系人", placeholder: "例如：张三" },
  { key: "phone", label: "电话" },
  { key: "address", label: "地址", multiline: true, placeholder: "省市区、街道、门牌号" },
  { key: "note", label: "备注", multiline: true },
];

export const ADDRESS_NAME_MAX = 40;
export const ADDRESS_FIELD_MAX = 300;

// Trims every part; one-line parts lose their line breaks.
export function normalizeAddressFields(fields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of ADDRESS_FIELDS) {
    const value = (fields[field.key] ?? "").trim();
    out[field.key] = field.multiline ? value : value.replace(/\s*[\r\n]+\s*/g, " ");
  }
  return out;
}

export function validateAddress(name: string, rawFields: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  const fields = normalizeAddressFields(rawFields);
  if (!name.trim()) errors.name = "请填写公司名称";
  if (!fields.address) errors.address = "请填写地址";
  for (const field of ADDRESS_FIELDS) if (fields[field.key].length > ADDRESS_FIELD_MAX) errors[field.key] = `${field.label}太长，最多 ${ADDRESS_FIELD_MAX} 个字`;
  return errors;
}

// The whole address as it is pasted into a form or a chat: company, then contact and phone, then the address. 备注 stays out.
export function addressBlock(item: Pick<AddressItem, "name" | "fields">): string {
  const person = [item.fields.contact, item.fields.phone].map((part) => (part ?? "").trim()).filter(Boolean).join(" ");
  return [item.name.trim(), person, (item.fields.address ?? "").trim()].filter(Boolean).join("\n");
}

// A short clue for the list: the address on one line.
export function addressHint(item: Pick<AddressItem, "fields">): string {
  return (item.fields.address ?? "").replace(/\s+/g, " ").trim();
}
