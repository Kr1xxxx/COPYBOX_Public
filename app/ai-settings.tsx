"use client";

import { useEffect, useState } from "react";
import { AI_PRESETS, AI_SETTINGS_KEY, DEFAULT_AI_PROMPTS, parseAiEndpoint, readAiSettings, validateAiSettings, type AiSettings } from "./ai-config";
import { aiChat, aiErrorText, aiKeyClear, aiKeySave, aiKeyStatus, aiListModels, type AiKeyStatus } from "./ai-client";

export function AiSettingsSection({ localAiAvailable }: { localAiAvailable: boolean }) {
  const [form, setForm] = useState<AiSettings>(() => readAiSettings(localStorage) || { baseUrl: "", model: "", polishPrompt: DEFAULT_AI_PROMPTS.polish, organizePrompt: DEFAULT_AI_PROMPTS.organize });
  const [keyInput, setKeyInput] = useState("");
  const [status, setStatus] = useState<AiKeyStatus>({ hasKey: false, origin: "" });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "test" | "models">("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [savedSettings, setSavedSettings] = useState<AiSettings | null>(() => readAiSettings(localStorage));
  const [modelChoices, setModelChoices] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    aiKeyStatus().then((value) => { if (!cancelled) setStatus(value); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const origin = parseAiEndpoint(form.baseUrl)?.origin || "";
  const keyReady = keyInput.trim().length > 0 || (status.hasKey && status.origin === origin);
  const problem = validateAiSettings(form, keyReady);
  const active = Boolean(savedSettings) && status.hasKey;
  const edit = (patch: Partial<AiSettings>) => { setForm((value) => ({ ...value, ...patch })); setTouched(true); setMessage(null); };

  async function save() {
    if (problem || busy) return false;
    setBusy("save");
    try {
      const next = await aiKeySave(form.baseUrl.trim(), keyInput);
      const clean: AiSettings = { baseUrl: form.baseUrl.trim(), model: form.model.trim(), polishPrompt: form.polishPrompt.trim(), organizePrompt: form.organizePrompt.trim() };
      localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(clean));
      setForm(clean);
      setSavedSettings(clean);
      setStatus(next);
      setKeyInput("");
      setTouched(false);
      setMessage({ tone: "ok", text: "已保存，AI 润色和 AI 整理会使用这个接口" });
      return true;
    } catch (error) {
      setMessage({ tone: "error", text: aiErrorText(error) });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function testConnection() {
    if (problem || busy) return;
    if (!(await save())) return;
    setBusy("test");
    setMessage({ tone: "ok", text: "正在测试…" });
    const reply = await aiChat({ ...form, baseUrl: form.baseUrl.trim(), model: form.model.trim() }, "你是连接测试。只回复 OK。", "ping");
    setBusy("");
    setMessage(reply.error ? { tone: "error", text: `连接失败：${reply.error}` } : { tone: "ok", text: "连接成功，接口可以使用" });
  }

  function applyPreset(id: string) {
    const preset = AI_PRESETS.find((value) => value.id === id);
    if (!preset) return;
    setForm((value) => ({ ...value, baseUrl: preset.baseUrl, model: preset.model }));
    setModelChoices([]);
    setTouched(true);
    setMessage({ tone: "ok", text: `已填入 ${preset.name} 的地址${preset.model ? "和常用模型" : ""}，再填 API Key 即可；模型名以官方为准，可点“获取模型”查看你的账号能用哪些` });
  }

  async function fetchModels() {
    if (busy) return;
    if (!parseAiEndpoint(form.baseUrl)) { setMessage({ tone: "error", text: "请先填写正确的接口地址" }); return; }
    if (!keyReady) { setMessage({ tone: "error", text: "请先填写 API Key" }); return; }
    setBusy("models");
    setMessage({ tone: "ok", text: "正在获取模型…" });
    try {
      const next = keyInput.trim() ? await aiKeySave(form.baseUrl.trim(), keyInput) : status;
      setStatus(next);
      const result = await aiListModels(form.baseUrl.trim());
      setModelChoices(result.models);
      setMessage(result.error ? { tone: "error", text: result.error } : { tone: "ok", text: `取到 ${result.models.length} 个模型，点模型框选择` });
    } catch (error) {
      setMessage({ tone: "error", text: aiErrorText(error) });
    } finally {
      setBusy("");
    }
  }

  async function clearInterface() {
    setBusy("save");
    try { await aiKeyClear(); } catch { /* the settings below are cleared either way */ }
    localStorage.removeItem(AI_SETTINGS_KEY);
    setSavedSettings(null);
    setStatus({ hasKey: false, origin: "" });
    setForm({ baseUrl: "", model: "", polishPrompt: DEFAULT_AI_PROMPTS.polish, organizePrompt: DEFAULT_AI_PROMPTS.organize });
    setKeyInput("");
    setTouched(false);
    setBusy("");
    setMessage({ tone: "ok", text: "已停用并清除接口和密钥" });
  }

  const summary = active && savedSettings
    ? `已启用自己的 AI 接口：${parseAiEndpoint(savedSettings.baseUrl)?.host || savedSettings.baseUrl} · ${savedSettings.model}`
    : localAiAvailable ? "已检测到系统自带的本机 AI，文字不会离开这台电脑" : "还没有设置接口：AI 整理会用规则整理，AI 润色需要填写下面的接口";
  return (
    <>
      <div className="settings-row static"><div><strong>AI 润色 / AI 整理</strong><small>{summary}</small></div></div>
      <form className="settings-ai-form" onSubmit={(event) => { event.preventDefault(); void save(); }} autoComplete="off">
        <label className="settings-ai-field"><span>常用服务</span>
          <select aria-label="常用服务" value="" onChange={(event) => applyPreset(event.target.value)}>
            <option value="">选择后自动填写地址和模型…</option>
            {AI_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
          </select>
        </label>
        <label className="settings-ai-field"><span>接口地址</span><input value={form.baseUrl} onChange={(event) => edit({ baseUrl: event.target.value })} placeholder="https://api.openai.com/v1" spellCheck={false} /></label>
        <div className="settings-ai-pair">
          <div className="settings-ai-field"><span><label htmlFor="ai-model">模型</label><button type="button" className="settings-link-button" disabled={Boolean(busy)} onClick={() => void fetchModels()}>{busy === "models" ? "获取中…" : "获取模型"}</button></span><input id="ai-model" value={form.model} list="ai-model-choices" onChange={(event) => edit({ model: event.target.value })} placeholder="例如 gpt-4o-mini" spellCheck={false} /><datalist id="ai-model-choices">{modelChoices.map((name) => <option key={name} value={name} />)}</datalist></div>
          <label className="settings-ai-field"><span>API Key</span><input type="password" value={keyInput} onChange={(event) => { setKeyInput(event.target.value); setTouched(true); setMessage(null); }} placeholder={status.hasKey ? "已保存，留空则保持不变" : "sk-…"} spellCheck={false} autoComplete="new-password" /></label>
        </div>
        <label className="settings-ai-field"><span>润色提示词</span><textarea rows={4} value={form.polishPrompt} onChange={(event) => edit({ polishPrompt: event.target.value })} aria-invalid={!form.polishPrompt.trim()} /></label>
        <label className="settings-ai-field"><span>整理提示词</span><textarea rows={4} value={form.organizePrompt} onChange={(event) => edit({ organizePrompt: event.target.value })} aria-invalid={!form.organizePrompt.trim()} /></label>
        {(touched && problem && !message) && <p className="settings-error" role="alert">{problem}</p>}
        {message && <p className={message.tone === "error" ? "settings-error" : "settings-ok"} role="status">{message.text}</p>}
        <div className="settings-ai-actions">
          <button type="submit" className="primary-button" disabled={Boolean(problem) || Boolean(busy)}>{busy === "save" ? "保存中…" : "保存"}</button>
          <button type="button" className="secondary-button" disabled={Boolean(problem) || Boolean(busy)} onClick={() => void testConnection()}>{busy === "test" ? "测试中…" : "保存并测试"}</button>
          <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => { setForm((value) => ({ ...value, polishPrompt: DEFAULT_AI_PROMPTS.polish, organizePrompt: DEFAULT_AI_PROMPTS.organize })); setTouched(true); setMessage(null); }}>恢复默认提示词</button>
          <span className="spacer" />
          {(savedSettings || status.hasKey) && <button type="button" className="secondary-button danger-text" disabled={Boolean(busy)} onClick={() => void clearInterface()}>停用并清除</button>}
        </div>
      </form>
      <p className="settings-note">接口需兼容 OpenAI 的 chat/completions 格式（也可填写本机地址，如 http://localhost:11434/v1）。API Key 由系统加密后只保存在这台电脑，不会进入备份；点“润色/整理”时，话术内容会发送到你填写的接口。提示词不能为空。</p>
    </>
  );
}
