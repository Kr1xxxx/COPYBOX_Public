// Validation shared only by the MCP adapters. Existing UI commands keep their own rules.
import { AutomationCommandError } from "./clipbox-automation.ts";

export function mcpError(code: string, message: string): never {
  throw new AutomationCommandError(code, message);
}

export function record(input: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) mcpError("INVALID_COMMAND", "命令必须是对象");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => !fields.includes(key))) mcpError("UNSUPPORTED_FIELD", "命令包含不支持的字段");
  return value;
}

export function text(value: unknown, label: string): string {
  if (typeof value !== "string") mcpError("INVALID_FIELD", `${label} 必须是文本`);
  return value;
}

export function integer(value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) mcpError("INVALID_FIELD", `${label} 超出允许范围`);
  return value;
}

export function batch(value: unknown, max = 100): unknown[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > max) mcpError("INVALID_BATCH", `每批需要 1–${max} 项`);
  return value;
}

export function distinct(values: string[]) {
  if (new Set(values).size !== values.length) mcpError("DUPLICATE_TARGET", "同一批不能重复指定同一条内容");
}

export function hasAction(command: unknown, actions: readonly string[]) {
  return !!command && typeof command === "object" && "action" in command && actions.includes(String(command.action));
}
