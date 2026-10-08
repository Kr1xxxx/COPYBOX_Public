import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_AI_PROMPTS, chatCompletionsUrl, chatRequestBody, parseAiEndpoint, parseChatResponse, readAiSettings, validateAiSettings } from "../app/ai-config.ts";

const good = { baseUrl: "https://api.example.com/v1", model: "m1", polishPrompt: "润色", organizePrompt: "整理" };

test("settings cannot be saved with an empty prompt, model, address or key", () => {
  assert.equal(validateAiSettings(good, true), "");
  assert.match(validateAiSettings({ ...good, polishPrompt: "  \n" }, true), /润色提示词不能为空/);
  assert.match(validateAiSettings({ ...good, organizePrompt: "" }, true), /整理提示词不能为空/);
  assert.match(validateAiSettings({ ...good, model: " " }, true), /模型/);
  assert.match(validateAiSettings({ ...good, baseUrl: "" }, true), /接口地址/);
  assert.match(validateAiSettings({ ...good, baseUrl: "ftp://x" }, true), /https/);
  assert.match(validateAiSettings(good, false), /API Key/);
});

test("only https (or http on this computer) addresses are accepted", () => {
  assert.ok(parseAiEndpoint("https://api.openai.com/v1"));
  assert.ok(parseAiEndpoint("http://localhost:11434/v1"));
  assert.ok(parseAiEndpoint("http://127.0.0.1:8000"));
  assert.equal(parseAiEndpoint("http://api.example.com/v1"), null);
  assert.equal(parseAiEndpoint("not a url"), null);
});

test("the chat address is built from a base address or a full address", () => {
  assert.equal(chatCompletionsUrl("https://api.example.com/v1"), "https://api.example.com/v1/chat/completions");
  assert.equal(chatCompletionsUrl("https://api.example.com/v1/"), "https://api.example.com/v1/chat/completions");
  assert.equal(chatCompletionsUrl("https://api.example.com/v1/chat/completions"), "https://api.example.com/v1/chat/completions");
  assert.equal(chatCompletionsUrl("https://api.example.com"), "https://api.example.com/chat/completions");
  assert.equal(chatCompletionsUrl("nope"), "");
});

test("the request puts the prompt in the system message and the text in the user message", () => {
  const body = chatRequestBody(" m1 ", "SYS", "TEXT");
  assert.equal(body.model, "m1");
  assert.deepEqual(body.messages, [{ role: "system", content: "SYS" }, { role: "user", content: "TEXT" }]);
});

test("responses are parsed and failures explained", () => {
  assert.deepEqual(parseChatResponse(200, JSON.stringify({ choices: [{ message: { content: "好的" } }] })), { text: "好的", error: "" });
  assert.match(parseChatResponse(401, JSON.stringify({ error: { message: "bad key" } })).error, /API Key.*bad key/);
  assert.match(parseChatResponse(404, "oops").error, /接口地址或模型/);
  assert.match(parseChatResponse(429, "{}").error, /额度/);
  assert.match(parseChatResponse(200, "{}").error, /没有返回内容/);
  assert.match(parseChatResponse(200, "<html>").error, /没有返回内容/);
});

test("stored settings are only used while they are complete", () => {
  const storage = (value) => ({ getItem: () => value });
  assert.deepEqual(readAiSettings(storage(JSON.stringify(good))), good);
  assert.equal(readAiSettings(storage(JSON.stringify({ ...good, polishPrompt: "" }))), null);
  assert.equal(readAiSettings(storage("garbage")), null);
  assert.equal(readAiSettings(storage(null)), null);
  assert.ok(DEFAULT_AI_PROMPTS.polish.trim() && DEFAULT_AI_PROMPTS.organize.trim());
});
