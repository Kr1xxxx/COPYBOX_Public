import { pinyin } from "pinyin-pro";
import type { SecretItem } from "./clipbox-core";

// Search for 话术: every typed term must match somewhere. A term matches text directly,
// by full pinyin ("tuikuan") or by pinyin initials ("tk"). Results are ranked by where
// the terms hit (标题 > 小提示 > 正文), then by how often the snippet was copied.

const TITLE_WEIGHT = 3;
const HINT_WEIGHT = 2;
const BODY_WEIGHT = 1;

type PinyinForms = { full: string; initials: string };

const pinyinCache = new Map<string, PinyinForms>();
const PINYIN_CACHE_LIMIT = 4000;

function hasChinese(text: string) {
  return /[㐀-鿿]/.test(text);
}

function pinyinForms(text: string): PinyinForms {
  const cached = pinyinCache.get(text);
  if (cached) return cached;
  let forms: PinyinForms = { full: "", initials: "" };
  if (hasChinese(text)) {
    try {
      const full = pinyin(text, { toneType: "none", type: "array", nonZh: "removed" }) as string[];
      forms = { full: full.join("").toLowerCase(), initials: full.map((syllable) => syllable[0] || "").join("").toLowerCase() };
    } catch {
      forms = { full: "", initials: "" };
    }
  }
  if (pinyinCache.size >= PINYIN_CACHE_LIMIT) pinyinCache.clear();
  pinyinCache.set(text, forms);
  return forms;
}

function termMatches(text: string, lowered: string, term: string, allowPinyin: boolean) {
  if (lowered.includes(term)) return true;
  if (!allowPinyin || !/^[a-z]+$/.test(term)) return false;
  const forms = pinyinForms(text);
  return forms.initials.includes(term) || forms.full.includes(term);
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
    for (const entry of fields) {
      if (entry.weight > best && termMatches(entry.text, entry.lowered, term, entry.pinyin)) best = entry.weight;
    }
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
