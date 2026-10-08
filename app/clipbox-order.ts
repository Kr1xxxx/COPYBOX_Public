import type { SecretItem } from "./clipbox-core";

const SNIPPET_NUMBER_PATTERN = /^CB-(\d+)$/;

export function canReorderCards(query: string, productFilter: string) {
  return query.trim() === "" && productFilter.trim() !== "";
}

export function formatSnippetNumber(sequence: number) {
  return `CB-${Math.max(1, Math.trunc(sequence)).toString().padStart(4, "0")}`;
}

function snippetSequence(value: unknown) {
  if (typeof value !== "string") return 0;
  const match = SNIPPET_NUMBER_PATTERN.exec(value);
  const sequence = match ? Number.parseInt(match[1], 10) : 0;
  return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : 0;
}

export function normalizeSnippetNumbers(items: SecretItem[], requestedNext = 1) {
  const highestExisting = items.reduce((highest, item) => (
    item.kind === "snippet" ? Math.max(highest, snippetSequence(item.snippetNumber)) : highest
  ), 0);
  let nextSnippetNumber = Math.max(1, Math.trunc(requestedNext) || 1, highestExisting + 1);
  const retained = new Set<string>();

  const normalized = items.map((item) => {
    if (item.kind !== "snippet") {
      if (item.snippetNumber === undefined) return item;
      const withoutSnippetNumber = { ...item };
      delete withoutSnippetNumber.snippetNumber;
      return withoutSnippetNumber;
    }

    const sequence = snippetSequence(item.snippetNumber);
    if (sequence > 0 && !retained.has(item.snippetNumber!)) {
      retained.add(item.snippetNumber!);
      return item;
    }

    while (retained.has(formatSnippetNumber(nextSnippetNumber))) nextSnippetNumber += 1;
    const snippetNumber = formatSnippetNumber(nextSnippetNumber);
    retained.add(snippetNumber);
    nextSnippetNumber += 1;
    return { ...item, snippetNumber };
  });

  return { items: normalized, nextSnippetNumber };
}

export function reorderVisibleItems(
  items: SecretItem[],
  visibleIds: string[],
  sourceId: string,
  targetId: string,
) {
  if (sourceId === targetId) return items;
  const source = items.find((item) => item.id === sourceId);
  const target = items.find((item) => item.id === targetId);
  if (!source || !target || Boolean(source.pinned) !== Boolean(target.pinned)) return items;

  const visibleSet = new Set(visibleIds);
  const visible = items.filter((item) => visibleSet.has(item.id));
  const sourceIndex = visible.findIndex((item) => item.id === sourceId);
  const targetIndex = visible.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return items;

  const reordered = visible.slice();
  const [moved] = reordered.splice(sourceIndex, 1);
  reordered.splice(targetIndex, 0, moved);
  let replacementIndex = 0;
  return items.map((item) => (visibleSet.has(item.id) ? reordered[replacementIndex++] : item));
}

export function moveVisibleItem(items: SecretItem[], visibleIds: string[], itemId: string, delta: -1 | 1) {
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item) return items;
  const sameGroupIds = visibleIds.filter((id) => {
    const candidate = items.find((entry) => entry.id === id);
    return candidate && Boolean(candidate.pinned) === Boolean(item.pinned);
  });
  const index = sameGroupIds.indexOf(itemId);
  const targetId = sameGroupIds[index + delta];
  return targetId ? reorderVisibleItems(items, sameGroupIds, itemId, targetId) : items;
}

export function reorderNames(names: string[], source: string, target: string) {
  if (source === target) return names;
  const sourceIndex = names.indexOf(source);
  const targetIndex = names.indexOf(target);
  if (sourceIndex < 0 || targetIndex < 0) return names;
  const reordered = names.slice();
  const [moved] = reordered.splice(sourceIndex, 1);
  reordered.splice(targetIndex, 0, moved);
  return reordered;
}

export function moveName(names: string[], name: string, delta: -1 | 1) {
  const index = names.indexOf(name);
  const target = names[index + delta];
  return target ? reorderNames(names, name, target) : names;
}
