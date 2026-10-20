// 笔记 in 账号: free text in Markdown, and 「转为登录」 (a note becomes a login, the note kept inside it so 还原 can bring it
// back). Pure functions, no storage, no React: the Markdown is parsed into plain data that the page draws itself, so
// nothing written in a note can ever become HTML or a script.
import { API_FIELD_LABEL_MAX, API_FIELD_MAX, API_NOTE_MAX, type ApiField, checkApiFields, storedApiFields } from "./apikey-core.ts";
import type { ApiKeyItem, LoginItem, NoteItem } from "./payment-core.ts";
import { isPlausibleUrl, normalizeUrl } from "./site-core.ts";

export const NOTE_NAME_MAX = 40;
export const NOTE_BODY_MAX = 20_000;

// ---- Markdown -------------------------------------------------------------------------------------------------------

export type Inline =
  | { t: "text"; text: string }
  | { t: "code"; text: string }
  | { t: "strong" | "em" | "del"; children: Inline[] }
  | { t: "link"; href: string; children: Inline[] }
  | { t: "br" };

export type ListItem = { checked?: boolean; content: Inline[] };

export type Block =
  | { t: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; content: Inline[] }
  | { t: "paragraph"; content: Inline[] }
  | { t: "code"; text: string }
  | { t: "quote"; content: Inline[] }
  | { t: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { t: "hr" };

// Only web addresses become links; anything else (javascript:, file:, data:…) stays plain text.
export function safeHref(raw: string): string {
  const text = raw.trim();
  if (!/^https?:\/\//i.test(text)) return "";
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

const INLINE_RULES: { re: RegExp; make: (match: RegExpExecArray) => Inline | null }[] = [
  { re: /`([^`\n]+)`/y, make: (m) => ({ t: "code", text: m[1] }) },
  { re: /\[([^\]\n]+)\]\(([^)\s]+)\)/y, make: (m) => { const href = safeHref(m[2]); return href ? { t: "link", href, children: parseInline(m[1]) } : null; } },
  { re: /https?:\/\/[^\s<>()]+[^\s<>().,;:!?，。；：！？）]/y, make: (m) => { const href = safeHref(m[0]); return href ? { t: "link", href, children: [{ t: "text", text: m[0] }] } : null; } },
  { re: /\*\*(?=\S)([^\n]*?\S)\*\*/y, make: (m) => ({ t: "strong", children: parseInline(m[1]) }) },
  { re: /__(?=\S)([^\n]*?\S)__/y, make: (m) => ({ t: "strong", children: parseInline(m[1]) }) },
  { re: /~~(?=\S)([^\n]*?\S)~~/y, make: (m) => ({ t: "del", children: parseInline(m[1]) }) },
  { re: /\*(?=[^\s*])([^*\n]*?[^\s*])\*/y, make: (m) => ({ t: "em", children: parseInline(m[1]) }) },
  { re: /(?<![A-Za-z0-9])_(?=[^\s_])([^_\n]*?[^\s_])_(?![A-Za-z0-9])/y, make: (m) => ({ t: "em", children: parseInline(m[1]) }) },
];

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let plain = "";
  const flush = () => { if (plain) { out.push({ t: "text", text: plain }); plain = ""; } };
  let index = 0;
  outer: while (index < text.length) {
    const char = text[index];
    if (char === "\n") { flush(); out.push({ t: "br" }); index += 1; continue; }
    if (char === "\\" && index + 1 < text.length && /[\\`*_~[\]()#>+\-.!|]/.test(text[index + 1])) { plain += text[index + 1]; index += 2; continue; }
    if ("`[*_~h".includes(char)) {
      for (const rule of INLINE_RULES) {
        rule.re.lastIndex = index;
        const match = rule.re.exec(text);
        if (!match) continue;
        const node = rule.make(match);
        if (!node) continue;
        flush();
        out.push(node);
        index += match[0].length;
        continue outer;
      }
    }
    plain += char;
    index += 1;
  }
  flush();
  return out;
}

const FENCE = /^\s{0,3}(```|~~~)/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const TASK = /^\[( |x|X)\]\s+(.*)$/;

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trimStart().startsWith(fence[1])) { body.push(lines[index]); index += 1; }
      index += 1;
      blocks.push({ t: "code", text: body.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ t: "heading", level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6, content: parseInline(heading[2]) });
      index += 1;
      continue;
    }
    if (HR.test(line)) { blocks.push({ t: "hr" }); index += 1; continue; }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (index < lines.length && QUOTE.test(lines[index])) { body.push(QUOTE.exec(lines[index])![1]); index += 1; }
      blocks.push({ t: "quote", content: parseInline(body.join("\n")) });
      continue;
    }
    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    if (bullet || ordered) {
      const isOrdered = Boolean(ordered);
      const pattern = isOrdered ? ORDERED : BULLET;
      const items: ListItem[] = [];
      while (index < lines.length) {
        const match = pattern.exec(lines[index]);
        if (!match || (!isOrdered && HR.test(lines[index]))) break;
        const text = isOrdered ? match[2] : match[1];
        const task = TASK.exec(text);
        items.push(task ? { checked: task[1] !== " ", content: parseInline(task[2]) } : { content: parseInline(text) });
        index += 1;
      }
      blocks.push({ t: "list", ordered: isOrdered, start: ordered ? Number(ordered[1]) : 1, items });
      continue;
    }
    const body: string[] = [];
    while (index < lines.length && lines[index].trim() && !FENCE.test(lines[index]) && !HEADING.test(lines[index]) && !HR.test(lines[index]) && !QUOTE.test(lines[index]) && !BULLET.test(lines[index]) && !ORDERED.test(lines[index])) {
      body.push(lines[index].trimEnd());
      index += 1;
    }
    blocks.push({ t: "paragraph", content: parseInline(body.join("\n")) });
  }
  return blocks;
}

// The note without Markdown marks, for the list's one-line hint and for search.
export function plainText(source: string): string {
  const flat = (nodes: Inline[]): string => nodes.map((node) => (node.t === "text" || node.t === "code" ? node.text : node.t === "br" ? " " : "children" in node ? flat(node.children) : "")).join("");
  return parseMarkdown(source).map((block) => {
    if (block.t === "code") return block.text;
    if (block.t === "hr") return "";
    if (block.t === "list") return block.items.map((item) => flat(item.content)).join(" ");
    return flat(block.content);
  }).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function noteHint(body: string): string {
  const text = plainText(body);
  if (!text) return "空白笔记";
  const chars = Array.from(text);
  return chars.length > 40 ? `${chars.slice(0, 40).join("")}…` : text;
}

// ---- 转为登录 ----------------------------------------------------------------------------------------------------------

export type LoginField = "name" | "url" | "username" | "password" | "note";
export const LOGIN_FIELDS: { key: LoginField; label: string }[] = [
  { key: "name", label: "名称" },
  { key: "url", label: "网址" },
  { key: "username", label: "用户名 / 邮箱" },
  { key: "password", label: "密码" },
  { key: "note", label: "备注" },
];

// One line of the note, as the mapping preview offers it: the line number (from 1), the label written before a colon
// (if any) and the value after it.
export type NoteLine = { line: number; text: string; label: string; value: string };
export type LoginGuess = { values: Record<LoginField, string>; from: Partial<Record<LoginField, number>> };

const LABELS: { field: Exclude<LoginField, "note">; re: RegExp }[] = [
  { field: "password", re: /^(密码|口令|登录密码|pass(word)?|pwd)$/i },
  { field: "username", re: /^(用户名|用户|账号|帐号|账户|帐户|登录名|登录账号|邮箱|电子邮箱|手机号|手机|user(name)?|login|account|e-?mail|id)$/i },
  { field: "url", re: /^(网址|网站|链接|地址|登录地址|登录页|后台地址|url|site|website|link|网页)$/i },
  { field: "name", re: /^(名称|标题|名字|name|title)$/i },
];

function cleanLine(raw: string) {
  return raw.replace(/^\s*(?:[-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?/, "").replace(/^\s*>\s?/, "").replace(/\*\*|__|`/g, "").trim();
}

export function noteLines(body: string): NoteLine[] {
  const out: NoteLine[] = [];
  body.replace(/\r\n?/g, "\n").split("\n").forEach((raw, index) => {
    if (/^\s*(```|~~~)/.test(raw) || /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(raw)) return;
    const text = cleanLine(raw.replace(/^\s{0,3}#{1,6}\s+/, ""));
    if (!text) return;
    const labelled = /^([^:：=]{1,16}?)\s*[:：=]\s*(.+)$/.exec(text);
    out.push(labelled ? { line: index + 1, text, label: labelled[1].trim(), value: labelled[2].trim() } : { line: index + 1, text, label: "", value: text });
  });
  return out;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A first guess of which line fills which field. The person checks and changes it in the preview before anything is saved.
export function guessLoginFields(note: Pick<NoteItem, "name" | "body">): LoginGuess {
  const lines = noteLines(note.body);
  const values: Record<LoginField, string> = { name: "", url: "", username: "", password: "", note: "" };
  const from: Partial<Record<LoginField, number>> = {};
  const used = new Set<number>();
  const take = (field: LoginField, line: NoteLine) => { values[field] = line.value; from[field] = line.line; used.add(line.line); };
  for (const line of lines) {
    if (!line.label) continue;
    const match = LABELS.find((rule) => rule.re.test(line.label.replace(/\s+/g, "")));
    if (match && !values[match.field]) take(match.field, line);
  }
  for (const line of lines) {
    if (used.has(line.line) || line.label) continue;
    if (!values.url && !/\s/.test(line.value) && line.value.includes(".") && !EMAIL.test(line.value) && isPlausibleUrl(line.value)) take("url", line);
    else if (!values.username && EMAIL.test(line.value)) take("username", line);
  }
  if (!values.name) {
    const heading = /^\s{0,3}#{1,6}\s+(.+)$/m.exec(note.body);
    const headingLine = heading ? lines.find((line) => line.text === cleanLine(heading[1])) : undefined;
    if (headingLine && !used.has(headingLine.line)) take("name", headingLine);
    else values.name = note.name;
  }
  values.name = Array.from(values.name).slice(0, NOTE_NAME_MAX).join("");
  values.note = lines.filter((line) => !used.has(line.line)).map((line) => line.text).join("\n");
  return { values, from };
}

export function loginDraftProblems(values: Record<LoginField, string>): Partial<Record<LoginField, string>> {
  const found: Partial<Record<LoginField, string>> = {};
  if (!values.name.trim()) found.name = "请填写名称";
  if (values.url.trim() && !isPlausibleUrl(values.url)) found.url = "网址格式不对";
  if (!values.password) found.password = "请填写密码";
  return found;
}

// The new login, carrying the note exactly as it was. The caller swaps the two in one write (see `convertNote`).
export function loginFromNote(note: NoteItem, values: Record<LoginField, string>, id: string, now: number): LoginItem {
  return {
    id, type: "login", name: Array.from(values.name.trim().replace(/\s+/g, " ")).slice(0, NOTE_NAME_MAX).join(""),
    url: values.url.trim() ? normalizeUrl(values.url) : "", username: values.username.trim(), password: values.password,
    note: values.note.trim(), fromNote: note, createdAt: now, updatedAt: now,
  };
}

type Item = { id: string; type: string };

// The note leaves the list and the login takes its place, in one write: nothing is lost if one half fails.
export function convertNote<T extends Item>(items: T[], noteId: string, login: T): T[] {
  if (!items.some((item) => item.id === noteId && item.type === "note")) throw new Error("这条笔记已经不在了");
  return [...items.filter((item) => item.id !== noteId), login];
}

// 还原: the login or API entry goes away and the note comes back exactly as it was before 「转为登录 / API」.
export function revertToNote<T extends Item & { fromNote?: unknown }>(items: T[], entryId: string): T[] {
  const entry = items.find((item) => item.id === entryId && (item.type === "login" || item.type === "apikey"));
  if (!entry?.fromNote) throw new Error("这一条不是从笔记转来的");
  const note = entry.fromNote as T;
  return [...items.filter((item) => item.id !== entryId && item.id !== note.id), note];
}

// ---- 转为 API (Mac only: Windows has no API 密钥 category) ---------------------------------------------------------

export type ApiDraft = {
  name: string; service: string; endpoint: string; note: string;
  // Each hidden value with its name and the note line it came from.
  fields: (ApiField & { from?: number })[];
  from: Partial<Record<"name" | "service" | "endpoint", number>>;
};

const API_LABELS: { field: "name" | "service" | "endpoint"; re: RegExp }[] = [
  { field: "endpoint", re: /^(接口地址|接口|地址|网址|链接|endpoint|url|base ?url|api ?url|host)$/i },
  { field: "service", re: /^(服务|平台|服务商|service|provider|platform)$/i },
  { field: "name", re: /^(名称|标题|名字|name|title)$/i },
];
// Labels that name a hidden value: kept as the field's own name.
const SECRET_LABEL = /(key|secret|token|密钥|秘钥|令牌|client ?id|app ?id|access|password|密码|pwd|凭证|证书|signature|签名)/i;
const TOKEN_LIKE = /^[A-Za-z0-9_\-.:+/=]{16,}$/;

export function guessApiFields(note: Pick<NoteItem, "name" | "body">): ApiDraft {
  const lines = noteLines(note.body);
  const draft: ApiDraft = { name: "", service: "", endpoint: "", note: "", fields: [], from: {} };
  const used = new Set<number>();
  const labels = new Set<string>();
  const addField = (label: string, line: NoteLine) => {
    let name = Array.from(label.trim()).slice(0, API_FIELD_LABEL_MAX).join("") || (draft.fields.length === 0 ? "密钥" : "Secret");
    if (labels.has(name.toLowerCase()) || /^\d+$/.test(name)) name = `${name} ${draft.fields.length + 1}`;
    labels.add(name.toLowerCase());
    draft.fields.push({ id: `f${line.line}`, label: name, value: line.value, from: line.line });
    used.add(line.line);
  };
  for (const line of lines) {
    if (!line.label) continue;
    const label = line.label.replace(/\s+/g, " ");
    const rule = API_LABELS.find((entry) => entry.re.test(label));
    if (rule && !draft[rule.field]) { draft[rule.field] = line.value; draft.from[rule.field] = line.line; used.add(line.line); }
    else if (!rule && SECRET_LABEL.test(label) && draft.fields.length < API_FIELD_MAX) addField(label, line);
  }
  for (const line of lines) {
    if (used.has(line.line) || line.label) continue;
    if (!draft.endpoint && /^https?:\/\//i.test(line.value) && !/\s/.test(line.value)) { draft.endpoint = line.value; draft.from.endpoint = line.line; used.add(line.line); }
    else if (TOKEN_LIKE.test(line.value) && draft.fields.length < API_FIELD_MAX) addField("", line);
  }
  if (!draft.name) {
    const heading = /^\s{0,3}#{1,6}\s+(.+)$/m.exec(note.body);
    const headingLine = heading ? lines.find((line) => line.text === cleanLine(heading[1])) : undefined;
    if (headingLine && !used.has(headingLine.line)) { draft.name = headingLine.value; draft.from.name = headingLine.line; used.add(headingLine.line); }
    else draft.name = note.name;
  }
  draft.name = Array.from(draft.name).slice(0, NOTE_NAME_MAX).join("");
  if (draft.fields.length === 0) draft.fields.push({ id: "f0", label: "密钥", value: "" });
  draft.note = lines.filter((line) => !used.has(line.line)).map((line) => line.text).join("\n");
  return draft;
}

export function apiDraftProblems(draft: ApiDraft) {
  const checked = checkApiFields(draft.fields);
  const found: Partial<Record<"name" | "endpoint", string>> = {};
  if (!draft.name.trim()) found.name = "请填写名称";
  if (draft.endpoint.trim() && !isPlausibleUrl(draft.endpoint)) found.endpoint = "接口地址格式不对";
  return { found, fieldErrors: checked.errors, fields: checked.fields };
}

// The new API entry, carrying the note exactly as it was (same swap as 转为登录).
export function apiFromNote(note: NoteItem, draft: ApiDraft, fields: ApiField[], id: string, now: number): ApiKeyItem {
  const clean = fields.map(({ id: fieldId, label, value }) => ({ id: fieldId, label, value }));
  return {
    id, type: "apikey", name: Array.from(draft.name.trim().replace(/\s+/g, " ")).slice(0, NOTE_NAME_MAX).join(""),
    service: draft.service.trim(), ...storedApiFields(clean), note: draft.note.trim().slice(0, API_NOTE_MAX),
    endpoint: draft.endpoint.trim() ? normalizeUrl(draft.endpoint) : "", expires: "", fromNote: note, createdAt: now, updatedAt: now,
  };
}
