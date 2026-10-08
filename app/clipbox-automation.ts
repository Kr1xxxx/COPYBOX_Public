import {
  isTrashedItem,
  moveItemToTrash,
  normalizeFolderName,
  synchronizeVaultData,
  type SecretItem,
  type SnippetMeta,
  type VaultData,
} from "./clipbox-core.ts";
import { STANDARD_SNIPPET_FOLDERS, requireStandardSnippetFolder } from "./snippet-folders.ts";

export type AutomationCommand =
  | { action: "status" }
  | { action: "list"; folder?: string; query?: string }
  | { action: "get"; number: string }
  | { action: "secret-get"; reference: string }
  | { action: "secret-verify"; reference: string; candidate: string }
  | { action: "add"; title: string; content: string; summary?: string; folder?: string; chineseText?: string }
  | { action: "update"; number: string; title?: string; content?: string; summary?: string; folder?: string; chineseText?: string }
  | { action: "move"; number: string; folder: string }
  | { action: "delete"; number: string; confirmed: true };

export type AutomationRuntime = {
  createId: () => string;
  now: () => number;
};

export type SecretExportCommand = {
  action: "secret-export";
  password: string;
  confirmed: true;
};

export type AutomationItem = {
  number: string;
  title: string;
  content?: string;
  chineseText?: string;
  summary: string;
  folder: string;
  pinned: boolean;
  updatedAt: number;
  meta?: SnippetMeta;
};

export type AutomationResult =
  | { action: "status"; ready: true; snippetCount: number }
  | { action: "list"; items: AutomationItem[] }
  | { action: "secret-get"; secret: { reference: string; title: string; value: string; segments?: [string, string]; folder: string; updatedAt: number } }
  | { action: "secret-verify"; match: boolean; clipboard: SecretValueProfile; stored: SecretValueProfile }
  | { action: "get" | "add" | "update" | "move"; item: AutomationItem }
  | { action: "delete"; number: string };

export type AutomationOutcome = {
  data: VaultData;
  changed: boolean;
  result: AutomationResult;
};

export type SecretValueProfile = {
  chars: number;
  bytes: number;
  ascii: boolean;
  appSecretFormat: boolean;
};

export function isAutomationReadAction(action: AutomationResult["action"]) {
  return action === "status" || action === "list" || action === "get" || action === "secret-get" || action === "secret-verify";
}

export class AutomationCommandError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AutomationCommandError";
    this.code = code;
  }
}

const NUMBER_PATTERN = /^CB-\d{4,}$/;
const COMMAND_FIELDS: Record<AutomationCommand["action"], Set<string>> = {
  status: new Set(["action"]),
  list: new Set(["action", "folder", "query"]),
  get: new Set(["action", "number"]),
  "secret-get": new Set(["action", "reference"]),
  "secret-verify": new Set(["action", "reference", "candidate"]),
  add: new Set(["action", "title", "content", "summary", "folder", "chineseText"]),
  update: new Set(["action", "number", "title", "content", "summary", "folder", "chineseText"]),
  move: new Set(["action", "number", "folder"]),
  delete: new Set(["action", "number", "confirmed"]),
};

function recordValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AutomationCommandError("INVALID_COMMAND", "命令必须是 JSON 对象");
  }
  return value as Record<string, unknown>;
}

function stringValue(record: Record<string, unknown>, name: string, required = false) {
  const value = record[name];
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string") throw new AutomationCommandError("INVALID_FIELD", `${name} 必须是文本`);
  return value;
}

function normalizedNumber(value: unknown) {
  if (typeof value !== "string") throw new AutomationCommandError("INVALID_NUMBER", "编号不能为空");
  const number = value.trim().toUpperCase();
  if (!NUMBER_PATTERN.test(number)) throw new AutomationCommandError("INVALID_NUMBER", "编号格式必须是 CB-0001");
  return number;
}

function validateFields(action: AutomationCommand["action"], record: Record<string, unknown>) {
  for (const field of Object.keys(record)) {
    if (!COMMAND_FIELDS[action].has(field)) throw new AutomationCommandError("UNSUPPORTED_FIELD", `不支持的字段 ${field}`);
  }
}

export function parseSecretExportCommand(value: unknown): SecretExportCommand | null {
  const record = recordValue(value);
  if (record.action !== "secret-export") return null;
  const allowed = new Set(["action", "password", "confirmed"]);
  for (const field of Object.keys(record)) {
    if (!allowed.has(field)) throw new AutomationCommandError("UNSUPPORTED_FIELD", `不支持的字段 ${field}`);
  }
  const password = stringValue(record, "password", true)!;
  if (password.length < 8) throw new AutomationCommandError("INVALID_PASSWORD", "备份密码至少需要 8 个字符");
  if (record.confirmed !== true) throw new AutomationCommandError("CONFIRM_REQUIRED", "导出秘密前必须明确确认");
  return { action: "secret-export", password, confirmed: true };
}

export function parseAutomationCommand(value: unknown): AutomationCommand {
  const record = recordValue(value);
  const action = record.action;
  if (typeof action !== "string" || !(action in COMMAND_FIELDS)) {
    throw new AutomationCommandError("INVALID_ACTION", "不支持的命令");
  }
  const typedAction = action as AutomationCommand["action"];
  validateFields(typedAction, record);

  if (typedAction === "status") return { action: "status" };
  if (typedAction === "list") {
    const folder = stringValue(record, "folder");
    const query = stringValue(record, "query");
    return {
      action: "list",
      ...(folder === undefined ? {} : { folder: normalizeFolderName(folder) }),
      ...(query === undefined ? {} : { query: query.trim() }),
    };
  }
  if (typedAction === "secret-get") {
    return { action: "secret-get", reference: stringValue(record, "reference", true)! };
  }
  if (typedAction === "secret-verify") {
    return {
      action: "secret-verify",
      reference: stringValue(record, "reference", true)!,
      candidate: stringValue(record, "candidate", true)!,
    };
  }

  const number = typedAction === "add" ? undefined : normalizedNumber(record.number);
  if (typedAction === "get") return { action: "get", number: number! };
  if (typedAction === "delete") {
    if (record.confirmed !== true) throw new AutomationCommandError("CONFIRM_REQUIRED", "请确认删除后再执行");
    return { action: "delete", number: number!, confirmed: true };
  }

  const title = stringValue(record, "title", typedAction === "add");
  const content = stringValue(record, "content", typedAction === "add");
  const summary = stringValue(record, "summary");
  const folderValue = stringValue(record, "folder", typedAction === "move");
  let folder = folderValue === undefined ? undefined : normalizeFolderName(folderValue);
  if (folder !== undefined) {
    try {
      folder = requireStandardSnippetFolder(folder);
    } catch (error) {
      throw new AutomationCommandError("INVALID_FOLDER", error instanceof Error ? error.message : "话术目录无效");
    }
  }
  const chineseText = stringValue(record, "chineseText");

  if (typedAction === "add") {
    return {
      action: "add",
      title: title!,
      content: content!,
      ...(summary === undefined ? {} : { summary }),
      ...(folder === undefined ? {} : { folder }),
      ...(chineseText === undefined ? {} : { chineseText }),
    };
  }
  if (typedAction === "move") {
    if (!folder) throw new AutomationCommandError("INVALID_FOLDER", "目录不能为空");
    return { action: "move", number: number!, folder };
  }
  if ([title, content, summary, folder, chineseText].every((entry) => entry === undefined)) {
    throw new AutomationCommandError("NO_CHANGES", "请至少提供一个要修改的字段");
  }
  return {
    action: "update",
    number: number!,
    ...(title === undefined ? {} : { title }),
    ...(content === undefined ? {} : { content }),
    ...(summary === undefined ? {} : { summary }),
    ...(folder === undefined ? {} : { folder }),
    ...(chineseText === undefined ? {} : { chineseText }),
  };
}

export function formatSecretReference(id: string) {
  if (!id) throw new AutomationCommandError("INVALID_SECRET_REFERENCE", "秘密引用不能为空");
  return `clipbox://secret/${encodeURIComponent(id)}`;
}

function secretIdFromReference(reference: string) {
  const matched = /^clipbox:\/\/secret\/([^/?#]+)$/.exec(reference);
  if (!matched) throw new AutomationCommandError("INVALID_SECRET_REFERENCE", "秘密引用格式无效");
  try {
    const id = decodeURIComponent(matched[1]);
    if (!id || formatSecretReference(id) !== reference) throw new Error("non-canonical");
    return id;
  } catch {
    throw new AutomationCommandError("INVALID_SECRET_REFERENCE", "秘密引用格式无效");
  }
}

function defaultSnippetMeta(chineseText = ""): SnippetMeta {
  return {
    stage: "",
    scene: "",
    action: "",
    productGroups: [],
    rawProduct: "",
    chineseText,
    placeholders: [],
    requiredInputs: [],
    usageNote: "",
    requiresVerification: false,
  };
}

function snippetItems(data: VaultData) {
  return data.items.filter((item) => item.kind === "snippet" && !isTrashedItem(item));
}

function targetSnippet(data: VaultData, number: string) {
  const item = snippetItems(data).find((candidate) => candidate.snippetNumber?.toUpperCase() === number);
  if (!item) throw new AutomationCommandError("NOT_FOUND", `未找到话术 ${number}`);
  return item;
}

function targetSecret(data: VaultData, reference: string) {
  const id = secretIdFromReference(reference);
  const item = data.items.find((candidate) => (candidate.kind || "secret") === "secret" && candidate.id === id && !isTrashedItem(candidate));
  if (!item) throw new AutomationCommandError("NOT_FOUND", "未找到对应的秘密");
  return item;
}

function secretValueProfile(value: string): SecretValueProfile {
  return {
    chars: Array.from(value).length,
    bytes: new TextEncoder().encode(value).byteLength,
    ascii: /^[\x20-\x7e]+$/.test(value),
    appSecretFormat: /^[A-Za-z0-9_-]{32}$/.test(value),
  };
}

function publicItem(item: SecretItem, includeContent = false): AutomationItem {
  return {
    number: item.snippetNumber || "",
    title: item.label,
    ...(includeContent ? { content: item.secret, chineseText: item.snippetMeta?.chineseText || "" } : {}),
    summary: item.summary || item.note || "",
    folder: item.folder || "",
    pinned: Boolean(item.pinned),
    updatedAt: item.updatedAt,
    ...(includeContent && item.snippetMeta ? { meta: { ...item.snippetMeta } } : {}),
  };
}

function validateTitle(value: string) {
  const title = value.trim();
  if (!title) throw new AutomationCommandError("EMPTY_TITLE", "标题不能为空");
  return title;
}

function validateContent(value: string) {
  if (!value.trim()) throw new AutomationCommandError("EMPTY_CONTENT", "英文内容不能为空");
  return value;
}

export function applySnippetAutomationCommand(
  vault: VaultData,
  commandValue: AutomationCommand | unknown,
  runtime: AutomationRuntime,
): AutomationOutcome {
  const command = parseAutomationCommand(commandValue);
  if (command.action === "status") {
    return { data: vault, changed: false, result: { action: "status", ready: true, snippetCount: snippetItems(vault).length } };
  }
  if (command.action === "list") {
    const query = command.query?.toLowerCase() || "";
    const items = snippetItems(vault)
      .filter((item) => command.folder === undefined || (item.folder || "") === command.folder)
      .filter((item) => !query || `${item.snippetNumber} ${item.label} ${item.summary || ""} ${item.secret} ${item.snippetMeta?.chineseText || ""}`.toLowerCase().includes(query))
      .map((item) => publicItem(item));
    return { data: vault, changed: false, result: { action: "list", items } };
  }
  if (command.action === "secret-get") {
    const item = targetSecret(vault, command.reference);
    return {
      data: vault,
      changed: false,
      result: {
        action: "secret-get",
        secret: {
          reference: command.reference,
          title: item.label,
          value: item.secret,
          ...(item.secretSegments ? { segments: item.secretSegments } : {}),
          folder: item.folder || "",
          updatedAt: item.updatedAt,
        },
      },
    };
  }
  if (command.action === "secret-verify") {
    const item = targetSecret(vault, command.reference);
    return {
      data: vault,
      changed: false,
      result: {
        action: "secret-verify",
        match: item.secret === command.candidate,
        clipboard: secretValueProfile(command.candidate),
        stored: secretValueProfile(item.secret),
      },
    };
  }
  if (command.action === "get") {
    return { data: vault, changed: false, result: { action: "get", item: publicItem(targetSnippet(vault, command.number), true) } };
  }

  const now = runtime.now();
  if (command.action === "add") {
    const id = runtime.createId();
    const folder = command.folder || STANDARD_SNIPPET_FOLDERS[0];
    const item: SecretItem = {
      id,
      label: validateTitle(command.title),
      secret: validateContent(command.content),
      note: command.summary?.trim() || "",
      color: "#ffcfa8",
      kind: "snippet",
      summary: command.summary?.trim() || "",
      folder,
      ...(command.chineseText === undefined ? {} : { snippetMeta: { ...defaultSnippetMeta(command.chineseText), stage: folder } }),
      createdAt: now,
      updatedAt: now,
    };
    const data = synchronizeVaultData([item, ...vault.items], vault.folders, vault.nextSnippetNumber, vault.folderColors);
    const added = data.items.find((candidate) => candidate.id === id)!;
    return { data, changed: true, result: { action: "add", item: publicItem(added, true) } };
  }

  const target = targetSnippet(vault, command.number);
  if (command.action === "delete") {
    const data = synchronizeVaultData(moveItemToTrash(vault.items, target.id, now), vault.folders, vault.nextSnippetNumber, vault.folderColors);
    return { data, changed: true, result: { action: "delete", number: command.number } };
  }

  const folder = command.action === "move" ? command.folder : command.folder;
  const updatedMeta = command.action === "update" && (command.folder !== undefined || command.chineseText !== undefined)
    ? {
      ...(target.snippetMeta || defaultSnippetMeta()),
      ...(command.folder === undefined ? {} : { stage: command.folder }),
      ...(command.chineseText === undefined ? {} : { chineseText: command.chineseText }),
    }
    : target.snippetMeta;
  const updated: SecretItem = command.action === "move"
    ? { ...target, folder, ...(target.snippetMeta ? { snippetMeta: { ...target.snippetMeta, stage: folder } } : {}), updatedAt: now }
    : {
      ...target,
      ...(command.title === undefined ? {} : { label: validateTitle(command.title) }),
      ...(command.content === undefined ? {} : { secret: validateContent(command.content) }),
      ...(command.summary === undefined ? {} : { summary: command.summary.trim() }),
      ...(command.folder === undefined ? {} : { folder: command.folder }),
      ...(updatedMeta ? { snippetMeta: updatedMeta } : {}),
      updatedAt: now,
    };
  const data = synchronizeVaultData(
    vault.items.map((item) => item.id === target.id ? updated : item),
    vault.folders,
    vault.nextSnippetNumber,
    vault.folderColors,
  );
  const saved = data.items.find((item) => item.id === target.id)!;
  return { data, changed: true, result: { action: command.action, item: publicItem(saved, true) } };
}

export async function commitSnippetAutomationCommand(
  vault: VaultData,
  command: AutomationCommand | unknown,
  runtime: AutomationRuntime,
  persist: (data: VaultData) => Promise<void>,
) {
  const outcome = applySnippetAutomationCommand(vault, command, runtime);
  if (outcome.changed) await persist(outcome.data);
  return {
    data: outcome.data,
    response: { ok: true as const, ...outcome.result },
  };
}
