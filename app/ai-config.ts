// The user's own AI interface (any OpenAI-compatible chat endpoint).
import type { AiRewriteMode } from "./clipbox-core";

export type AiSettings = { baseUrl: string; model: string; polishPrompt: string; organizePrompt: string };

// Written for COMELYLASH's B2B lash sales (Alibaba, WhatsApp, email, Instagram); rules from the team's script guide.
export const DEFAULT_AI_PROMPTS: Record<AiRewriteMode, string> = {
  polish: `You edit sales messages for COMELYLASH, a professional lash supply company in Qingdao, China (lashes, glue and liquids, tools, private label). Customers are lash artists, salons, trainers and private-label brands, mostly in the US and Europe and mostly new customers. Chats happen on Alibaba, WhatsApp, email and Instagram DMs.
Polish the message below so it moves the customer to the next step: samples, quote, order, payment, reorder.
1. Keep the meaning. Write natural, casual US English.
2. Keep it short: one message does one thing, 3-5 lines at most. Use numbers instead of adjectives. Layout: one opening line, one content block, a question at the end. Put prices and specs on separate lines.
3. Polite, light and friendly, like a chat with a friend. Not stiff, not pushy, no lecturing (never remind the customer what they should do, such as paying their own taxes).
4. Greetings: keep any name or greeting already there. Otherwise use Hi lovely for new customers, Hey friend for returning customers, Hey gorgeous for new arrivals and promotions. Use love, babe or girl only if the customer used it first. No greeting in short replies mid-chat. Never use dear, honey or sweetie.
5. End with one easy question (for example: What curl & thickness do you usually use?). Never end with feel free to contact me.
6. Use I'll for what you will do, not We'll. Use we for company facts, products and credentials. Replace soon, shortly or get back to you with by [时间]. Never mention reply times.
7. When asking for an address, logo or payment, add a reason (so / then I can...). Name the exact product and spec instead of it or that.
8. When the customer waited, say Thanks for your patience, not Sorry for the wait. For quality problems or wrong items, apologize, ask for photos or a video, then offer a concrete fix (remake, resend, credit on the next order). Never argue or blame the factory.
9. A follow-up brings one new reason (extra samples, a deadline, a new quote for a different quantity). It may open with Hope you're doing well. Never say I never heard back or Thoughts?, and never just check in.
10. Group messages: one specific hook and one easy question, 3 lines at most, with clear numbers and a deadline.
11. Emoji: at most 1-2 in a full message, none in short replies, none if the original has none.
12. Never invent prices, quantities, lead times, promises or credentials that are not in the original. Never mention the website or retail prices, never send customers to the website to order, never put down other suppliers.
13. Keep every [ ] fill-in block (such as [名字], $[金额], [日期]) exactly as it is: do not translate, rewrite or remove it.
Return only the polished message: no explanation, no quotes, no title.`,
  organize: `Tidy the sales message below. Change only layout and mistakes, not the wording:
1. Fix typos, spelling and punctuation. Do not drop apostrophes (you're, I'll, don't).
2. Layout: the opening line, the content and the closing question each get their own paragraph. Put prices, specs and steps on separate lines so it reads at a glance on a phone.
3. Remove repeated sentences, extra spaces, blank lines and internal reference numbers.
4. Keep the meaning, tone and greeting. Do not add or remove information. Do not add emoji.
5. Keep every [ ] fill-in block (such as [名字], $[金额], [日期]) exactly as it is.
Return only the tidied message: no explanation, no quotes, no title.`,
};

// Earlier built-in prompts: settings saved with one of these follow the current default.
const OLD_DEFAULT_PROMPTS = [
  "润色下面这段客服话术：保持原意和原语言，让语气更自然、礼貌、简洁。必须原样保留所有 [方括号] 和 {花括号} 里的变量，不要增加原文没有的信息。只返回润色后的正文，不要解释，不要加引号。",
  "整理下面这段话术：修正错别字和标点，分段清晰，去掉重复和多余空格。不改变意思，不增删信息，原样保留所有 [方括号] 和 {花括号} 里的变量。只返回整理后的正文，不要解释，不要加引号。",
];
const currentPrompt = (value: string, mode: AiRewriteMode) => (OLD_DEFAULT_PROMPTS.includes(value) ? DEFAULT_AI_PROMPTS[mode] : value);

export type AiPreset = { id: string; name: string; baseUrl: string; model: string };

// Addresses are stable; model names change often, so they are only a starting point and "获取模型" lists what the account really offers.
export const AI_PRESETS: AiPreset[] = [
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-flash" },
  { id: "gemini", name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.6-flash" },
  { id: "kimi", name: "Kimi（月之暗面，国内）", baseUrl: "https://api.moonshot.cn/v1", model: "kimi-k3" },
  { id: "zhipu", name: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  { id: "siliconflow", name: "硅基流动", baseUrl: "https://api.siliconflow.cn/v1", model: "Qwen/Qwen2.5-7B-Instruct" },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  { id: "ollama", name: "Ollama（本机）", baseUrl: "http://localhost:11434/v1", model: "" },
];

export const AI_SETTINGS_KEY = "clipbox.ai-settings.v1";

export function parseAiEndpoint(value: string) {
  let url: URL;
  try { url = new URL(value.trim()); } catch { return null; }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
  return url;
}

// Accepts the base address (".../v1") or the full ".../chat/completions" address.
export function chatCompletionsUrl(baseUrl: string) {
  const url = parseAiEndpoint(baseUrl);
  if (!url) return "";
  url.hash = "";
  url.search = "";
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = /\/chat\/completions$/.test(path) ? path : `${path}/chat/completions`;
  return url.toString();
}

// Returns a message for the first problem, or "" when the form can be saved.
export function validateAiSettings(settings: AiSettings, keyReady: boolean) {
  if (!settings.baseUrl.trim()) return "请填写接口地址";
  if (!parseAiEndpoint(settings.baseUrl)) return "接口地址需要以 https:// 开头（本机地址可用 http://）";
  if (!settings.model.trim()) return "请填写模型名称";
  if (!settings.polishPrompt.trim()) return "润色提示词不能为空";
  if (!settings.organizePrompt.trim()) return "整理提示词不能为空";
  if (!keyReady) return "请填写 API Key";
  return "";
}

export function modelsUrl(baseUrl: string) {
  const chat = chatCompletionsUrl(baseUrl);
  return chat ? chat.replace(/\/chat\/completions$/, "/models") : "";
}

export function parseModelsResponse(status: number, text: string): { models: string[]; error: string } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = null; }
  const record = data as { data?: { id?: unknown }[]; models?: { name?: unknown; id?: unknown }[] } | null;
  if (status < 200 || status >= 300) return { models: [], error: status === 401 || status === 403 ? "API Key 不正确或没有权限" : status === 404 ? "这个服务不提供模型列表，请手动填写模型名" : `接口返回 ${status}` };
  const list = Array.isArray(record?.data) ? record.data : Array.isArray(record?.models) ? record.models : [];
  const models = Array.from(new Set(list.map((entry) => String((entry as { id?: unknown; name?: unknown }).id ?? (entry as { name?: unknown }).name ?? "").replace(/^models\//, "")).filter(Boolean))).sort();
  return models.length ? { models, error: "" } : { models: [], error: "没有取到模型列表，请手动填写模型名" };
}

export function chatRequestBody(model: string, system: string, user: string) {
  return { model: model.trim(), stream: false, temperature: 0.3, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
}

export function parseChatResponse(status: number, text: string): { text: string; error: string } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = null; }
  const record = data as { error?: { message?: unknown } | string; choices?: { message?: { content?: unknown } }[] } | null;
  if (status < 200 || status >= 300) {
    const detail = typeof record?.error === "string" ? record.error : typeof record?.error?.message === "string" ? record.error.message : "";
    const hint = status === 401 || status === 403 ? "API Key 不正确或没有权限" : status === 404 ? "接口地址或模型名称不对" : status === 429 ? "请求太频繁或额度不足" : `接口返回 ${status}`;
    return { text: "", error: detail ? `${hint}：${detail.slice(0, 120)}` : hint };
  }
  const content = record?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) return { text: "", error: "接口没有返回内容" };
  return { text: content, error: "" };
}

export function readAiSettings(storage: Pick<Storage, "getItem">): AiSettings | null {
  try {
    const raw = JSON.parse(storage.getItem(AI_SETTINGS_KEY) || "null");
    if (!raw || typeof raw !== "object") return null;
    const { baseUrl, model, polishPrompt, organizePrompt } = raw as Record<string, unknown>;
    if (typeof baseUrl !== "string" || typeof model !== "string" || typeof polishPrompt !== "string" || typeof organizePrompt !== "string") return null;
    const settings = { baseUrl, model, polishPrompt: currentPrompt(polishPrompt, "polish"), organizePrompt: currentPrompt(organizePrompt, "organize") };
    return validateAiSettings(settings, true) ? null : settings;
  } catch {
    return null;
  }
}
