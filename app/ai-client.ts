import { tidyText, type AiRewriteMode } from "./clipbox-core";
import { DEFAULT_AI_PROMPTS, chatCompletionsUrl, chatRequestBody, modelsUrl, parseAiEndpoint, parseChatResponse, parseModelsResponse, readAiSettings, type AiSettings } from "./ai-config";

const AI_WEB_KEY = "clipbox.ai-key.web.v1";
export type AiKeyStatus = { hasKey: boolean; origin: string };

// A message from the desktop bridge arrives wrapped as "Error invoking remote method …: Error: <text>".
export function aiErrorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("Error: ").pop()?.trim() || "AI 接口出错";
}

// The desktop app keeps the key encrypted with the system; a plain browser (preview) falls back to local storage.
export async function aiKeyStatus(): Promise<AiKeyStatus> {
  if (window.clipboxDesktop?.aiStatus) return window.clipboxDesktop.aiStatus();
  try {
    const stored = JSON.parse(localStorage.getItem(AI_WEB_KEY) || "null");
    return stored?.key ? { hasKey: true, origin: String(stored.origin || "") } : { hasKey: false, origin: "" };
  } catch { return { hasKey: false, origin: "" }; }
}

export async function aiKeySave(baseUrl: string, key: string): Promise<AiKeyStatus> {
  if (window.clipboxDesktop?.aiSave) return window.clipboxDesktop.aiSave({ baseUrl, key });
  const origin = parseAiEndpoint(baseUrl)?.origin || "";
  let existing: { origin?: string; key?: string } = {};
  try { existing = JSON.parse(localStorage.getItem(AI_WEB_KEY) || "{}"); } catch { /* start fresh */ }
  const finalKey = key.trim() || (existing.origin === origin ? existing.key || "" : "");
  if (!finalKey) throw new Error("请填写 API Key");
  localStorage.setItem(AI_WEB_KEY, JSON.stringify({ origin, key: finalKey }));
  return { hasKey: true, origin };
}

export async function aiKeyClear(): Promise<AiKeyStatus> {
  if (window.clipboxDesktop?.aiClear) return window.clipboxDesktop.aiClear();
  localStorage.removeItem(AI_WEB_KEY);
  return { hasKey: false, origin: "" };
}

export async function aiChat(settings: AiSettings, system: string, user: string): Promise<{ text: string; error: string }> {
  const url = chatCompletionsUrl(settings.baseUrl);
  const body = chatRequestBody(settings.model, system, user);
  try {
    if (window.clipboxDesktop?.aiRequest) {
      const response = await window.clipboxDesktop.aiRequest({ url, body });
      return parseChatResponse(response.status, response.text);
    }
    const stored = JSON.parse(localStorage.getItem(AI_WEB_KEY) || "null");
    if (!stored?.key) return { text: "", error: "还没有保存 API Key" };
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${stored.key}` }, body: JSON.stringify(body) });
    return parseChatResponse(response.status, await response.text());
  } catch (error) {
    return { text: "", error: window.clipboxDesktop ? aiErrorText(error) : "无法连接到接口（浏览器预览可能被跨域限制，桌面版不受影响）" };
  }
}

export async function aiListModels(baseUrl: string): Promise<{ models: string[]; error: string }> {
  const url = modelsUrl(baseUrl);
  try {
    if (window.clipboxDesktop?.aiRequest) {
      const response = await window.clipboxDesktop.aiRequest({ url, method: "GET" });
      return parseModelsResponse(response.status, response.text);
    }
    const stored = JSON.parse(localStorage.getItem(AI_WEB_KEY) || "null");
    if (!stored?.key) return { models: [], error: "请先填写 API Key" };
    const response = await fetch(url, { headers: { authorization: `Bearer ${stored.key}` } });
    return parseModelsResponse(response.status, await response.text());
  } catch (error) {
    return { models: [], error: window.clipboxDesktop ? aiErrorText(error) : "无法连接到接口（浏览器预览可能被跨域限制，桌面版不受影响）" };
  }
}

function cleanAiText(result: string) {
  return result.replace(/^```[a-z]*\n?|```$/gi, "").trim().replace(/^["“](.*)["”]$/s, "$1").trim();
}

// Order: the user's own interface (settings) → the device's own language model → a rule-based tidy
// for 整理. 润色 genuinely needs a model.
export async function aiRewrite(mode: AiRewriteMode, value: string): Promise<{ text: string; unavailable: boolean; error?: string }> {
  const custom = readAiSettings(localStorage);
  const prompt = custom ? (mode === "polish" ? custom.polishPrompt : custom.organizePrompt) : DEFAULT_AI_PROMPTS[mode];
  if (custom) {
    const status = await aiKeyStatus().catch(() => ({ hasKey: false, origin: "" }));
    if (status.hasKey) {
      const reply = await aiChat(custom, prompt, value);
      if (reply.error) return { text: "", unavailable: false, error: `AI 接口：${reply.error}` };
      const cleaned = cleanAiText(reply.text);
      return { text: mode === "organize" ? tidyText(cleaned) : cleaned, unavailable: false };
    }
  }
  type LanguageSession = { prompt: (prompt: string) => Promise<string>; destroy?: () => void };
  type LanguageModelAPI = { create: () => Promise<LanguageSession> };
  const model = (window as unknown as { LanguageModel?: LanguageModelAPI }).LanguageModel;
  if (model?.create) {
    let session: LanguageSession | undefined;
    try {
      session = await model.create();
      const cleaned = cleanAiText(await session.prompt(`${prompt}\n\n${value}`));
      if (cleaned) return { text: mode === "organize" ? tidyText(cleaned) : cleaned, unavailable: false };
    } catch {
      // Fall through below.
    } finally {
      session?.destroy?.();
    }
  }
  return mode === "organize" ? { text: tidyText(value), unavailable: false } : { text: "", unavailable: true };
}
