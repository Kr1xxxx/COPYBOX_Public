// Turning words of a 话术 into highlighted variable blocks by hand: a variable is the selected text wrapped in [ ].
export const VARIABLE_NAME_MAX = 40;

export type VariableEdit = { ok: true; text: string; start: number; end: number } | { ok: false; error: string };

// The [ ] block that holds the caret or the selection, if any.
export function variableAround(text: string, start: number, end: number): { open: number; close: number } | null {
  for (const match of text.matchAll(/\[[^[\]\n]+\]/g)) {
    const open = match.index ?? 0;
    const close = open + match[0].length;
    if (start >= open && end <= close) return { open, close };
  }
  return null;
}

// Wrap the selected words. Spaces at the edges of the selection stay outside the block.
export function markVariable(text: string, start: number, end: number): VariableEdit {
  const raw = text.slice(start, end);
  const lead = raw.length - raw.trimStart().length;
  const name = raw.trim();
  if (!name) return { ok: false, error: "先选中一段文字，再设为高亮" };
  if (/[[\]\n]/.test(name)) return { ok: false, error: "选中的文字里不能有方括号或换行" };
  if ([...name].length > VARIABLE_NAME_MAX) return { ok: false, error: `高亮的文字最多 ${VARIABLE_NAME_MAX} 个字` };
  const from = start + lead;
  const to = from + name.length;
  if (variableAround(text, from, to)) return { ok: false, error: "这里已经是高亮块了" };
  // a selection that cuts through another block would leave a broken bracket
  if (/\[[^\]]*$/.test(text.slice(0, from)) && /^[^[]*\]/.test(text.slice(to))) return { ok: false, error: "这里已经是高亮块了" };
  return { ok: true, text: `${text.slice(0, from)}[${name}]${text.slice(to)}`, start: from, end: to + 2 };
}

// Take the brackets off the block that holds the caret or the selection.
export function unmarkVariable(text: string, start: number, end: number): VariableEdit {
  const block = variableAround(text, start, end);
  if (!block) return { ok: false, error: "光标放在高亮块里，再取消高亮" };
  const name = text.slice(block.open + 1, block.close - 1);
  return { ok: true, text: `${text.slice(0, block.open)}${name}${text.slice(block.close)}`, start: block.open, end: block.open + name.length };
}
