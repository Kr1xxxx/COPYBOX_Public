// The user's own AI interface (any OpenAI-compatible chat endpoint).
import type { AiRewriteMode } from "./clipbox-core";

export type AiSettings = { baseUrl: string; model: string; polishPrompt: string; organizePrompt: string };

// Written for COMELYLASH's B2B lash sales (Alibaba, WhatsApp, email, Instagram); rules from the team's script guide.
export const DEFAULT_AI_PROMPTS: Record<AiRewriteMode, string> = {
  polish: `你是 COMELYLASH 的销售话术编辑。COMELYLASH 是青岛的美睫专业耗材供应商（睫毛、胶水、工具、贴牌定制），客户是欧美的美睫师、美睫店、培训师和自有品牌，在阿里国际站、WhatsApp、Email、Instagram 私信里沟通。
润色下面这条话术，目标是让客户更愿意回复、拿样和下单：
1. 保持原意和原语言：英文写成自然口语的美式英语，中文仍用中文。
2. 简洁：一条消息只办一件事，3-5 行以内；能用数字说清就不用形容词。分段：开场一句、内容一段、结尾提问；报价和规格逐项列行。
3. 语气礼貌轻松，像朋友聊天，不死板、不硬推、不说教。
4. 称呼：原文有名字或称呼就保留；没有时新客户用 Hi lovely。不用 dear、honey、sweetie。
5. 结尾留一个好回答的问题（如 What curl & thickness do you usually use?），不用 feel free to contact me。
6. 自己要做的事用 I'll，不用 We'll；原文是 soon、shortly 这类模糊时间时改成 by [时间]。
7. 让客户等了用 Thanks for your patience，不用 Sorry for the wait；质量问题或发错货仍要道歉。
8. emoji 最多 1-2 个，原文没有就不加。
9. 不编造原文没有的价格、数量、时效、承诺或认证；不提官网和零售价，不贬低别家。
10. 原样保留所有 [方括号] 和 {花括号} 里的内容，不翻译、不改写、不删除。
只返回润色后的正文，不要解释，不要加引号或标题。`,
  organize: `整理下面这条话术，只改格式和错字，不改说法：
1. 修正错别字、拼写和标点；英文别漏掉撇号（如 you're、I'll、don't）。
2. 分段：开场一句、内容一段、结尾提问各占一段；报价、规格、步骤逐项列行，方便在手机上一眼看完。
3. 去掉重复的句子、多余的空格和空行。
4. 不改变意思和语气，不增删信息，不换称呼，不加 emoji。
5. 原样保留所有 [方括号] 和 {花括号} 里的内容。
只返回整理后的正文，不要解释，不要加引号或标题。`,
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
