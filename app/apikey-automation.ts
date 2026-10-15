// The command line's secret-get / secret-verify for API entries (D-061). An entry is addressed as clipbox://apikey/<id>
// (「复制引用」 in the entry), one of its fields by name with "field" (any case; or "1", "2"… by position). Without
// "field" the first field (the key) is used, as before. Pure: the page loads the items and asks for consent first.
import { apiSecretFields, findApiField } from "./apikey-core.ts";
import { AutomationCommandError, parseAutomationCommand, secretValueProfile, type AutomationResult } from "./clipbox-automation.ts";
import type { ApiKeyItem } from "./payment-core.ts";

const PREFIX = "clipbox://apikey/";

export function formatApiKeyReference(id: string) {
  if (!id) throw new AutomationCommandError("INVALID_SECRET_REFERENCE", "秘密引用不能为空");
  return `${PREFIX}${encodeURIComponent(id)}`;
}

// True for a secret-get / secret-verify command that names an API entry; everything else goes the old way.
export function isApiKeySecretCommand(command: unknown): boolean {
  const record = command && typeof command === "object" ? (command as { action?: unknown; reference?: unknown }) : {};
  return (record.action === "secret-get" || record.action === "secret-verify") && typeof record.reference === "string" && record.reference.startsWith(PREFIX);
}

function idFromReference(reference: string) {
  const matched = /^clipbox:\/\/apikey\/([^/?#]+)$/.exec(reference);
  try {
    const id = matched ? decodeURIComponent(matched[1]) : "";
    if (id && formatApiKeyReference(id) === reference) return id;
  } catch { /* falls through */ }
  throw new AutomationCommandError("INVALID_SECRET_REFERENCE", "秘密引用格式无效");
}

type ApiLike = Pick<ApiKeyItem, "id" | "type" | "name" | "key" | "secret" | "fields" | "note" | "updatedAt" | "trashedAt">;

export function runApiKeySecretCommand(items: readonly { type: string; id: string }[], commandValue: unknown): AutomationResult {
  const command = parseAutomationCommand(commandValue);
  if (command.action !== "secret-get" && command.action !== "secret-verify") throw new AutomationCommandError("INVALID_ACTION", "不支持的命令");
  const id = idFromReference(command.reference);
  const item = items.find((entry): entry is ApiLike => entry.type === "apikey" && entry.id === id && !(entry as ApiLike).trashedAt);
  if (!item) throw new AutomationCommandError("NOT_FOUND", "未找到对应的 API 条目");
  const fields = apiSecretFields(item);
  const field = command.field === undefined ? fields[0] : findApiField(fields, command.field);
  if (!field) throw new AutomationCommandError("FIELD_NOT_FOUND", `这个条目没有「${command.field}」，可用的有：${fields.map((entry) => entry.label).join("、")}`);
  if (command.action === "secret-verify") {
    return { action: "secret-verify", match: field.value === command.candidate, clipboard: secretValueProfile(command.candidate), stored: secretValueProfile(field.value) };
  }
  return {
    action: "secret-get",
    secret: {
      reference: command.reference, title: item.name, value: field.value, folder: "", updatedAt: item.updatedAt,
      field: field.label, fields: fields.map((entry) => entry.label), ...(item.note ? { note: item.note } : {}),
    },
  };
}
