import { applySnippetAutomationCommand, type AutomationItem, type AutomationRuntime } from "./clipbox-automation.ts";
import { isTrashedItem, type VaultData } from "./clipbox-core.ts";
import { STANDARD_SNIPPET_FOLDERS } from "./snippet-folders.ts";
import { batch, distinct, hasAction, integer, mcpError, record, text } from "./mcp-input.ts";

const ACTIONS = ["snippet-folders", "get-many", "update-many"];
const EDIT_FIELDS = ["number", "expectedUpdatedAt", "title", "content", "summary", "folder", "chineseText"];
export const isMcpSnippetCommand = (value: unknown) => hasAction(value, ACTIONS);

function number(value: unknown) {
  const result = text(value, "编号").trim().toUpperCase();
  if (!/^CB-\d{4,}$/.test(result)) mcpError("INVALID_NUMBER", "编号格式必须是 CB-0001");
  return result;
}

function get(data: VaultData, id: string, runtime: AutomationRuntime): AutomationItem {
  const outcome = applySnippetAutomationCommand(data, { action: "get", number: id }, runtime);
  if (!("item" in outcome.result)) mcpError("NOT_FOUND", "找不到这条话术");
  return outcome.result.item;
}

// The caller holds the existing vault queue for the whole operation. Validation happens before a single persist.
export async function runMcpSnippetCommand(data: VaultData, input: unknown, runtime: AutomationRuntime, persist: (next: VaultData) => Promise<void>) {
  const action = (input as { action?: unknown })?.action;
  if (action === "snippet-folders") {
    record(input, ["action"]);
    const active = data.items.filter((item) => item.kind === "snippet" && !isTrashedItem(item));
    const names = [...new Set([...STANDARD_SNIPPET_FOLDERS, ...data.folders.snippet, ...active.flatMap((item) => item.folder ? [item.folder] : [])])];
    return { action, folders: names.map((name) => ({ name, count: active.filter((item) => item.folder === name).length })), uncategorizedCount: active.filter((item) => !item.folder).length };
  }
  if (action === "get-many") {
    const command = record(input, ["action", "numbers"]);
    const numbers = batch(command.numbers).map(number);
    distinct(numbers);
    return { action, items: numbers.map((id) => get(data, id, runtime)) };
  }
  if (action !== "update-many") mcpError("INVALID_ACTION", "不支持的命令");
  const command = record(input, ["action", "updates"]);
  const updates = batch(command.updates).map((entry) => {
    const fields = record(entry, EDIT_FIELDS);
    const id = number(fields.number);
    const expected = integer(fields.expectedUpdatedAt, "内容版本");
    if (get(data, id, runtime).updatedAt !== expected) mcpError("CONFLICT", `话术 ${id} 已改变，请重新读取后修改`);
    const changes = { ...fields };
    delete changes.expectedUpdatedAt;
    return { ...changes, action: "update", number: id, expected };
  });
  distinct(updates.map((update) => update.number));
  let next = data;
  const items: AutomationItem[] = [];
  for (const { expected, ...update } of updates) {
    const outcome = applySnippetAutomationCommand(next, update, { ...runtime, now: () => Math.max(runtime.now(), expected + 1) });
    next = outcome.data;
    if ("item" in outcome.result) items.push(outcome.result.item);
  }
  await persist(next);
  return { action, items };
}
