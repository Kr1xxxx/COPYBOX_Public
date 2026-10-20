// Tips (每日小贴士): the small card above 回收站 in the sidebar shows one tip a day. The library is the company's sales tips
// (app/company-tips.ts), then the built-in usage tips below, then tips read from the company tips file (TIPS_URL, off
// for now); one entry per local calendar day, in library order.
import { COMPANY_TIPS } from "./company-tips.ts";

// An example is a line to say (good, shown as a highlight block) or one not to say; source names where the data is from.
export type TipExample = { good: boolean; text: string };
export type Tip = { id: string; title: string; text: string; examples?: TipExample[]; source?: string };

// What the person sees: plain Chinese about features that exist. No keyboard keys or shortcuts (D-005).
export const BUILT_IN_TIPS: Tip[] = [
  { id: "T-001", title: "一点就复制", text: "每条话术右边都有复制按钮，点一下整段就复制好了，直接粘贴到聊天框；双击这一条也能复制。" },
  { id: "T-002", title: "拼音也能搜", text: "搜索框可以直接打拼音或首字母，比如打「tk」就能找到带「退款」的话术。" },
  { id: "T-003", title: "按编号找话术", text: "每条话术都有编号，在搜索框输入 #14 或 #014，就能直接找到这一条。" },
  { id: "T-004", title: "几个词一起搜", text: "搜索框里用空格隔开几个词，只会显示每个词都对得上的话术，结果更准。" },
  { id: "T-005", title: "搜此目录或全部", text: "在某个目录里搜索时，搜索框旁可以选「此目录」或「全部目录」，找不到时换成全部试试。" },
  { id: "T-006", title: "先填高亮块再复制", text: "话术里用方括号括起来的会显示成高亮块，比如客户名字。复制前先填好，复制出来就是填好的整段。" },
  { id: "T-007", title: "常用值可以固定", text: "每个高亮块会记住最近用过的值。右键点一个值可以固定，固定的值不会被新值顶掉。" },
  { id: "T-008", title: "给话术写小提示", text: "编辑话术时可以写一句小提示，最多 40 个字，只给自己看，比如提醒自己什么场合用。" },
  { id: "T-009", title: "AI 润色和整理", text: "编辑话术时，内容旁边有「AI 润色」和「AI 整理」，改完不满意可以撤销。" },
  { id: "T-010", title: "接上自己的 AI", text: "在 设置 → AI 里选一个常用服务，填好密钥后测试一下，润色话术就会用你自己的 AI。" },
  { id: "T-011", title: "收藏常用话术", text: "点话术上的星标就能收藏，左边的「收藏」会把收藏过的话术集中在一起。" },
  { id: "T-012", title: "看看最近用过的", text: "左边的「最近」列出你最近复制过的话术，刚用过的不用再搜一次。" },
  { id: "T-013", title: "删错了能撤销", text: "把内容移到回收站后，提示条上会出现「撤销」，6 秒内点一下就放回原处。" },
  { id: "T-014", title: "回收站保留 7 天", text: "删掉的内容先进回收站，默认 7 天后自动清掉。在 设置 → 数据 里可以改成 30 天、90 天或不清理。" },
  { id: "T-015", title: "一次整理多条", text: "点列表上方的「选择」，勾上几条以后，可以一起移动到别的目录，或一起移到回收站。" },
  { id: "T-016", title: "目录换颜色", text: "目录旁边的管理按钮可以重命名、换颜色或删除；按住目录拖动还能调整顺序。" },
  { id: "T-017", title: "收起展开的话术", text: "选中的话术会展开显示全文，点上面的「收起」就折回标题，列表更清爽。" },
  { id: "T-018", title: "迷你窗口", text: "点工具栏上的「迷你模式」，换成一个小窗口并一直显示在最前面，适合边聊边复制。" },
  { id: "T-019", title: "小窗贴边收起", text: "把迷你窗口拖到屏幕左右边缘会吸住，鼠标离开只留一个小标签，不挡聊天窗口；设置 → 窗口 里可以关掉。" },
  { id: "T-020", title: "从托盘快速搜索", text: "Copyboxx 会一直待在托盘里，点托盘图标或「快速搜索」就能呼出迷你窗口。" },
  { id: "T-021", title: "关闭按钮怎么做", text: "在 设置 → 窗口 里可以选点关闭按钮时做什么：收到托盘、缩到任务栏，或直接退出。" },
  { id: "T-022", title: "开机自动启动", text: "打开「开机自动启动」后，登录电脑时 Copyboxx 会自己启动，并安静地收在托盘里。" },
  { id: "T-023", title: "看看哪条最常用", text: "设置 → 使用排行 会列出复制次数最多的话术，看看哪些最常用，把它们收藏起来更顺手。" },
  { id: "T-024", title: "换成深色主题", text: "在 设置 → 外观 里可以选浅色、深色，或者跟随系统自动切换。" },
  { id: "T-025", title: "每天自动备份", text: "打开「每天自动备份」，每天会自动存一份完整备份，保留最近 7 份，需要时可以选一天恢复。" },
  { id: "T-026", title: "换电脑用完整备份", text: "设置 → 数据 里的「完整备份」会把话术、账号、图片和设置打包成一个带密码的文件，换电脑时用它搬过去。" },
  { id: "T-027", title: "给账号页加密码", text: "账号页可以设密码，账号数据会用它加密。设好后会给你一个恢复码，请抄下来放在安全的地方。" },
  { id: "T-028", title: "恢复码要保管好", text: "忘记账号页密码时，可以用恢复码找回。密码和恢复码都丢了，账号数据就再也打不开了。" },
  { id: "T-029", title: "常发图片一键复制", text: "在「图片」里存好常发的图片，点一下就能复制，直接粘贴给客户。图片也能分目录、加收藏。" },
  { id: "T-030", title: "图片先压缩再存", text: "新添加的图片会先用 TinyPNG 压缩再保存，更省空间；设置 → 数据 → 图片压缩 里能看到本月用量。" },
];

export const TIPS_FORMAT = "clipbox-tips";
export const TIPS_VERSION = 1;

// Address of the company tips file (like DEFAULT_UPDATE_URL in src-tauri/src/update.rs). Empty = online updates are
// off and only the built-in tips are used. Later: https://copyboxx.com/tips.json
export const TIPS_URL = "";

// Plain JSON in localStorage (not encrypted: tips are not personal data). The `clipbox.` prefix puts it in 完整备份.
export const TIPS_KEY = "clipbox.tips.v1";

// companyFirst: the company tips were reached once, so a person who was in the middle of the usage tips when they
// arrived jumps to the first company tip once and then moves on normally.
// imported: tips the person imported from a Tips document or table (D-068), with their examples and source; an imported
// tip with the id of a built-in one replaces it.
export type TipsState = { version: 1; extra: Tip[]; shownId: string; shownDate: string; fetchedDate?: string; companyFirst?: true; imported?: Tip[] };

const ID_MAX = 40;
const TITLE_MAX = 12;
// Built-in texts stay within 120 characters; a server text may be up to 200 so a slightly long entry is not lost.
const TEXT_MAX = 200;

export function freshTipsState(): TipsState {
  return { version: 1, extra: [], shownId: "", shownDate: "" };
}

// One entry from a file or from storage, cleaned up; null when it is not usable.
function cleanTip(value: unknown): Tip | null {
  if (!value || typeof value !== "object") return null;
  const { id, title, text } = value as Record<string, unknown>;
  if (typeof id !== "string" || typeof title !== "string" || typeof text !== "string") return null;
  const tip = { id: id.trim(), title: title.trim(), text: text.trim() };
  if (!tip.id || tip.id.length > ID_MAX) return null;
  if (!tip.title || [...tip.title].length > TITLE_MAX) return null;
  if (!tip.text || [...tip.text].length > TEXT_MAX) return null;
  return tip;
}

// Imported tips (D-068) are written by the company like the built-in company tips, so they may be longer and keep their
// ✅ / ❌ examples and source.
const IMPORTED_TITLE_MAX = 40;
const IMPORTED_TEXT_MAX = 1000;
const IMPORTED_EXAMPLES_MAX = 12;
const IMPORTED_EXAMPLE_MAX = 300;
const IMPORTED_SOURCE_MAX = 200;
export const IMPORTED_TIPS_MAX = 500;

export function cleanImportedTip(value: unknown): Tip | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  if (!id || id.length > ID_MAX || !title || [...title].length > IMPORTED_TITLE_MAX || [...text].length > IMPORTED_TEXT_MAX) return null;
  const examples = (Array.isArray(raw.examples) ? raw.examples : [])
    .filter((example): example is { good: unknown; text: string } => Boolean(example) && typeof (example as { text?: unknown }).text === "string")
    .map((example) => ({ good: example.good !== false, text: example.text.trim() }))
    .filter((example) => example.text && [...example.text].length <= IMPORTED_EXAMPLE_MAX)
    .slice(0, IMPORTED_EXAMPLES_MAX);
  if (!text && !examples.length) return null;
  const source = typeof raw.source === "string" ? raw.source.trim() : "";
  return { id, title, text, ...(examples.length ? { examples } : {}), ...(source && [...source].length <= IMPORTED_SOURCE_MAX ? { source } : {}) };
}

function cleanImportedList(values: unknown[]): Tip[] {
  const seen = new Set<string>();
  const tips: Tip[] = [];
  for (const value of values) {
    const tip = cleanImportedTip(value);
    if (!tip || seen.has(tip.id) || tips.length >= IMPORTED_TIPS_MAX) continue;
    seen.add(tip.id);
    tips.push(tip);
  }
  return tips;
}

function cleanList(values: unknown[]): Tip[] {
  const seen = new Set<string>();
  const tips: Tip[] = [];
  for (const value of values) {
    const tip = cleanTip(value);
    if (!tip || seen.has(tip.id)) continue;
    seen.add(tip.id);
    tips.push(tip);
  }
  return tips;
}

// Reads the company tips file: { format: "clipbox-tips", version: 1, items: [{ id, title, text }] }. Bad entries and
// repeated ids are skipped; anything that is not such a file throws.
export function parseTipsFile(text: string): Tip[] {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error("这不是有效的 tips 文件"); }
  if (!data || typeof data !== "object") throw new Error("这不是有效的 tips 文件");
  const file = data as Record<string, unknown>;
  if (file.format !== TIPS_FORMAT || !Array.isArray(file.items)) throw new Error("这不是有效的 tips 文件");
  if (file.version !== TIPS_VERSION) throw new Error("这个 tips 文件的版本太新，请先更新 Copyboxx");
  return cleanList(file.items);
}

// Known ids get the new title and text in place; new ids go at the end. Nothing is ever removed.
export function mergeTips(current: Tip[], incoming: Tip[]): Tip[] {
  const merged = current.map((tip) => ({ ...tip }));
  const index = new Map(merged.map((tip, position) => [tip.id, position]));
  for (const tip of incoming) {
    const at = index.get(tip.id);
    if (at === undefined) {
      index.set(tip.id, merged.length);
      merged.push({ ...tip });
    } else {
      merged[at] = { ...merged[at], title: tip.title, text: tip.text };
    }
  }
  return merged;
}

export function tipsLibrary(state: TipsState): Tip[] {
  const library = mergeTips([...COMPANY_TIPS, ...BUILT_IN_TIPS], state.extra);
  if (!state.imported?.length) return library;
  // An imported tip replaces the tip with its id whole (examples and source included); new ones go at the end.
  const byId = new Map(state.imported.map((tip) => [tip.id, tip]));
  const replaced = library.map((tip) => byId.get(tip.id) ?? tip);
  const have = new Set(library.map((tip) => tip.id));
  return [...replaced, ...state.imported.filter((tip) => !have.has(tip.id))];
}

const isCompanyTip = (id: string) => COMPANY_TIPS.some((tip) => tip.id === id);

// The same tip all day; on a new day exactly one step further (after the last comes the first again). The first time
// company tips exist and have not been reached, the first of them shows at once, even on the same day.
export function pickTipForDay(state: TipsState, today: string): { tip: Tip; state: TipsState } {
  const library = tipsLibrary(state);
  if (COMPANY_TIPS.length && !state.companyFirst && !isCompanyTip(state.shownId)) {
    const first = library[0];
    return { tip: first, state: { ...state, shownId: first.id, shownDate: today, companyFirst: true } };
  }
  const at = library.findIndex((tip) => tip.id === state.shownId);
  if (state.shownDate === today && at >= 0) return { tip: library[at], state };
  const next = library[at < 0 ? 0 : (at + 1) % library.length];
  return { tip: next, state: { ...state, shownId: next.id, shownDate: today } };
}

// 上一条 / 下一条 on the card: the tip `step` places away from `fromId` in the library, wrapping at both ends. Browsing
// is not saved, so the daily rotation stays the same.
export function stepTip(library: Tip[], fromId: string, step: number): Tip {
  const at = Math.max(0, library.findIndex((tip) => tip.id === fromId));
  const n = library.length;
  return library[(((at + step) % n) + n) % n];
}

// What the card shows under the title: the start of the text (or of the first example) and always a trailing "…",
// so it reads as "there is more, click to open".
export function tipPreview(tip: Tip, max = 40): string {
  const source = (tip.text || tip.examples?.[0]?.text || "").replace(/\s+/g, " ").trim();
  return `${[...source].slice(0, max).join("")}…`;
}

const two = (value: number) => String(value).padStart(2, "0");

// Local calendar day, YYYY-MM-DD (the same way autoBackupName in auto-backup.ts names a day).
export function todayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// `storage` defaults to localStorage inside the try, so a page without storage (blocked, or not in a browser) still works.
export function readTipsState(storage?: Pick<Storage, "getItem">): TipsState {
  try {
    const data = JSON.parse((storage ?? localStorage).getItem(TIPS_KEY) || "null") as Record<string, unknown> | null;
    if (!data || typeof data !== "object" || data.version !== 1) return freshTipsState();
    const state: TipsState = {
      version: 1,
      extra: Array.isArray(data.extra) ? cleanList(data.extra) : [],
      shownId: typeof data.shownId === "string" ? data.shownId : "",
      shownDate: typeof data.shownDate === "string" && DAY.test(data.shownDate) ? data.shownDate : "",
    };
    if (typeof data.fetchedDate === "string" && DAY.test(data.fetchedDate)) state.fetchedDate = data.fetchedDate;
    if (data.companyFirst === true) state.companyFirst = true;
    const imported = Array.isArray(data.imported) ? cleanImportedList(data.imported) : [];
    if (imported.length) state.imported = imported;
    return state;
  } catch {
    return freshTipsState();
  }
}

export function writeTipsState(state: TipsState, storage?: Pick<Storage, "setItem">) {
  try { (storage ?? localStorage).setItem(TIPS_KEY, JSON.stringify(state)); } catch { /* keep the in-memory tip for this session */ }
}

// Adds what the company file holds to the stored tips (an id that matches a built-in tip overrides its text).
export function mergeServerTips(state: TipsState, text: string, today: string): TipsState {
  const incoming = parseTipsFile(text);
  return { ...state, extra: mergeTips(state.extra, incoming), fetchedDate: today };
}

// Adds imported tips (D-068): a tip with a known id is replaced, a new one goes at the end. Nothing is removed.
export function importTips(state: TipsState, incoming: Tip[]): { state: TipsState; added: number; updated: number; unchanged: number } {
  const current = state.imported ?? [];
  const known = new Set([...COMPANY_TIPS, ...BUILT_IN_TIPS, ...state.extra, ...current].map((tip) => tip.id));
  const before = new Map(tipsLibrary(state).map((tip) => [tip.id, JSON.stringify(tip)]));
  const next = [...current];
  const at = new Map(next.map((tip, index) => [tip.id, index]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const raw of incoming) {
    const tip = cleanImportedTip(raw);
    if (!tip) continue;
    if (!known.has(tip.id)) added += 1;
    else if (before.get(tip.id) === JSON.stringify(tip)) unchanged += 1;
    else updated += 1;
    known.add(tip.id);
    const index = at.get(tip.id);
    if (index === undefined) { at.set(tip.id, next.length); next.push(tip); } else next[index] = tip;
  }
  return { state: { ...state, imported: cleanImportedList(next) }, added, updated, unchanged };
}
