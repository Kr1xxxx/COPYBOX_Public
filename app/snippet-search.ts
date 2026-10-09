import { pinyin } from "pinyin-pro";
import type { SecretItem } from "./clipbox-core";

// Search for 话术: every typed term must match somewhere. A term matches text directly,
// by full pinyin ("tuikuan") or by pinyin initials ("tk"). Results are ranked by where
// the terms hit (标题 > 小提示 > 正文), then by how often the snippet was copied.

const TITLE_WEIGHT = 3;
const HINT_WEIGHT = 2;
const BODY_WEIGHT = 1;

type PinyinForms = { syllables: string[]; initials: string };

const pinyinCache = new Map<string, PinyinForms>();
const PINYIN_CACHE_LIMIT = 4000;
const EMPTY_FORMS: PinyinForms = { syllables: [], initials: "" };

function hasChinese(text: string) {
  return /[\u3400-\u9fff]/.test(text);
}

function pinyinForms(text: string): PinyinForms {
  const cached = pinyinCache.get(text);
  if (cached) return cached;
  let forms = EMPTY_FORMS;
  if (hasChinese(text)) {
    try {
      const syllables = (pinyin(text, { toneType: "none", type: "array", nonZh: "removed" }) as string[])
        .map((syllable) => syllable.toLowerCase())
        .filter(Boolean);
      forms = { syllables, initials: syllables.map((syllable) => syllable[0]).join("") };
    } catch {
      forms = EMPTY_FORMS;
    }
  }
  if (pinyinCache.size >= PINYIN_CACHE_LIMIT) pinyinCache.clear();
  pinyinCache.set(text, forms);
  return forms;
}

// Pinyin matches only start at a syllable: initials ("tk" in tkxm) or whole syllables
// ("tuik" in tui-kuan), never from the middle of one ("an" must not hit "xian").
function pinyinMatches(text: string, term: string) {
  const forms = pinyinForms(text);
  if (forms.initials.includes(term)) return true;
  for (let start = 0; start < forms.syllables.length; start += 1) {
    let joined = "";
    for (let end = start; end < forms.syllables.length && joined.length < term.length; end += 1) {
      joined += forms.syllables[end];
      if (joined.startsWith(term)) return true;
      if (!term.startsWith(joined)) break;
    }
  }
  return false;
}

const LITERAL_BONUS = 10;

/** Literal hits always outrank pinyin hits: 10 x weight vs weight. */
function termScore(entry: { text: string; lowered: string; weight: number; pinyin: boolean }, term: string) {
  if (entry.lowered.includes(term)) return entry.weight * LITERAL_BONUS;
  if (entry.pinyin && /^[a-z]+$/.test(term) && pinyinMatches(entry.text, term)) return entry.weight;
  return 0;
}

type Field = { text: string; lowered: string; weight: number; pinyin: boolean };

function field(text: string | undefined, weight: number, pinyinToo: boolean): Field {
  const value = text || "";
  return { text: value, lowered: value.toLowerCase(), weight, pinyin: pinyinToo };
}

function snippetFields(item: SecretItem): Field[] {
  const meta = item.snippetMeta;
  return [
    field(item.label, TITLE_WEIGHT, true),
    field([item.summary, item.note, meta?.usageNote].filter(Boolean).join(" "), HINT_WEIGHT, true),
    field([item.secret, meta?.chineseText].filter(Boolean).join(" "), BODY_WEIGHT, false),
    field([item.snippetNumber, item.folder, meta?.stage, meta?.scene, meta?.action, meta?.rawProduct, meta?.productGroups?.join(" ")].filter(Boolean).join(" "), BODY_WEIGHT, true),
  ];
}

/** Score of a snippet for the query terms, or 0 when any term is missing. */
export function snippetSearchScore(item: SecretItem, terms: string[]) {
  const fields = snippetFields(item);
  let score = 0;
  for (const term of terms) {
    let best = 0;
    for (const entry of fields) best = Math.max(best, termScore(entry, term));
    if (best === 0) return 0;
    score += best;
  }
  return score;
}

/** Filter and rank snippets: pinned first, then hit place, then copy count. */
export function searchSnippets(items: SecretItem[], query: string): SecretItem[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return items;
  const scored: { item: SecretItem; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    const score = snippetSearchScore(item, terms);
    if (score > 0) scored.push({ item, score, index });
  });
  scored.sort((a, b) =>
    Number(Boolean(b.item.pinned)) - Number(Boolean(a.item.pinned))
    || b.score - a.score
    || (b.item.useCount || 0) - (a.item.useCount || 0)
    || a.index - b.index);
  return scored.map((entry) => entry.item);
}

// English search: a separate mode that looks only at the English message, by word
// (whole word beats word start); no pinyin involved.
function englishWordScore(english: string, term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(english)) return 2;
  if (new RegExp(`(^|[^a-z0-9])${escaped}`).test(english)) return 1;
  return 0;
}

export function searchSnippetsEnglish(items: SecretItem[], query: string): SecretItem[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return items;
  const scored: { item: SecretItem; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    const english = (item.secret || "").toLowerCase();
    let score = 0;
    for (const term of terms) {
      const hit = englishWordScore(english, term);
      if (!hit) { score = 0; break; }
      score += hit;
    }
    if (score > 0) scored.push({ item, score, index });
  });
  scored.sort((a, b) =>
    Number(Boolean(b.item.pinned)) - Number(Boolean(a.item.pinned))
    || b.score - a.score
    || (b.item.useCount || 0) - (a.item.useCount || 0)
    || a.index - b.index);
  return scored.map((entry) => entry.item);
}
