// Test 话术 (设置 → 数据 → 导入测试内容 / 清除测试内容). Pure functions, no storage: the page applies the plans.
// A test 话术 carries the id mark `sample-snippet-N`, the same "sample-" mark the 账号 examples use. Clearing finds
// them by that mark only, never by guessing from the text, and leaves any one the user edited.
import type { SecretItem } from "./clipbox-core";
import { buildSnippetImportPreview } from "./snippet-import.ts";
import { SAMPLE_SNIPPET_ROWS } from "./sample-snippet-rows.ts";

export const SAMPLE_SNIPPET_PREFIX = "sample-snippet-";
export const isSampleSnippet = (item: Pick<SecretItem, "id" | "kind">) => item.kind === "snippet" && item.id.startsWith(SAMPLE_SNIPPET_PREFIX);

const isTrashed = (item: SecretItem) => typeof item.deletedAt === "number";
// Edited = changed after it was created. Copying, pinning and trashing do not count as an edit of the text.
const untouched = (item: SecretItem) => item.updatedAt === item.createdAt;
const sameText = (a: SecretItem, b: SecretItem) => a.label === b.label && a.secret === b.secret;

// The full test set with stable ids (the same row always gets the same id), built by the normal sheet import.
export function sampleSnippetSet(now: number): { items: SecretItem[]; folders: string[] } {
  let n = 0;
  const preview = buildSnippetImportPreview(SAMPLE_SNIPPET_ROWS, [], () => `${SAMPLE_SNIPPET_PREFIX}${++n}`, now);
  return { items: preview.items, folders: preview.folders };
}

// Import: adds the ones that are missing, brings back test ones that were cleared into the trash, adds nothing twice.
// A test 话术 whose text the user already has as their own 话术 (for example from importing the sheet) is not added again.
export function planImportSampleSnippets(current: SecretItem[], now: number) {
  const set = sampleSnippetSet(now);
  const have = new Set(current.map((item) => item.id));
  const own = current.filter((item) => item.kind === "snippet" && !isSampleSnippet(item));
  const add = set.items.filter((item) => !have.has(item.id) && !own.some((mine) => sameText(mine, item)));
  const revive = current.filter((item) => isSampleSnippet(item) && isTrashed(item)).map((item) => item.id);
  const folders = Array.from(new Set(add.map((item) => item.folder || "").filter(Boolean)));
  return { add, revive, folders };
}

export function applyImportSampleSnippets(current: SecretItem[], plan: ReturnType<typeof planImportSampleSnippets>) {
  const reviveIds = new Set(plan.revive);
  const revived = current.map((item) => {
    if (!reviveIds.has(item.id)) return item;
    const back = { ...item };
    delete back.deletedAt;
    return back;
  });
  return [...plan.add, ...revived];
}

// Clear: only untouched test 话术 that are still in the list go to the trash; edited ones stay.
export function planClearSampleSnippets(current: SecretItem[]) {
  const mine = current.filter((item) => isSampleSnippet(item) && !isTrashed(item));
  const ids = mine.filter(untouched).map((item) => item.id);
  return { ids, names: mine.filter(untouched).map((item) => item.label), keptEdited: mine.length - ids.length };
}

// What a clear would remove right now. `accounts` is null where there is no 账号 part (Windows) or it is locked.
export type TestContentPreview = { snippets: number; accounts: number | null; accountNames?: string[]; keptEdited: number };

export function testPreviewText(preview: TestContentPreview) {
  const names = preview.accountNames?.length ? `（${preview.accountNames.join("、")}）` : "";
  const parts = [`话术 ${preview.snippets} 条`, ...(preview.accounts === null ? [] : [`账号 ${preview.accounts} 条${names}`])];
  if (preview.snippets + (preview.accounts ?? 0) === 0) return preview.keptEdited > 0 ? `没有可清除的测试内容（${preview.keptEdited} 条你改过的会保留）` : "现在没有可清除的测试内容";
  return `将清除：${parts.join("、")}${preview.keptEdited > 0 ? `；你改过的 ${preview.keptEdited} 条会保留` : ""}`;
}
