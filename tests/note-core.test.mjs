import assert from "node:assert/strict";
import test from "node:test";
import { apiDraftProblems, apiFromNote, convertNote, guessApiFields, guessLoginFields, loginDraftProblems, loginFromNote, noteHint, noteLines, parseInline, parseMarkdown, plainText, revertToNote, safeHref } from "../app/note-core.ts";

test("Markdown blocks: headings, lists, tasks, quotes, code and rules", () => {
  const blocks = parseMarkdown("# 标题\n\n第一行\n第二行\n\n- 甲\n- [x] 乙\n\n1. 一\n2. 二\n\n> 引用\n\n```\n<b>不渲染</b>\n```\n\n---");
  assert.deepEqual(blocks.map((block) => block.t), ["heading", "paragraph", "list", "list", "quote", "code", "hr"]);
  assert.deepEqual(blocks[1].content, [{ t: "text", text: "第一行" }, { t: "br" }, { t: "text", text: "第二行" }]);
  assert.equal(blocks[2].ordered, false);
  assert.equal(blocks[2].items[1].checked, true);
  assert.equal(blocks[3].ordered, true);
  assert.equal(blocks[5].text, "<b>不渲染</b>");
});

test("inline marks: bold, italic, strike, code and links", () => {
  assert.deepEqual(parseInline("**粗** *斜* ~~删~~ `码`").filter((node) => node.t !== "text").map((node) => node.t), ["strong", "em", "del", "code"]);
  const [link] = parseInline("[官网](https://example.com/a)");
  assert.equal(link.t, "link");
  assert.equal(link.href, "https://example.com/a");
  const bare = parseInline("看 https://example.com/x。");
  assert.equal(bare[1].t, "link");
  assert.equal(bare[1].href, "https://example.com/x");
  assert.deepEqual(bare[2], { t: "text", text: "。" });
  // snake_case words are not italic.
  assert.deepEqual(parseInline("api_key_name"), [{ t: "text", text: "api_key_name" }]);
});

test("only http(s) addresses become links; raw HTML stays text", () => {
  assert.equal(safeHref("javascript:alert(1)"), "");
  assert.equal(safeHref("file:///etc/passwd"), "");
  assert.equal(safeHref("data:text/html,hi"), "");
  assert.deepEqual(parseInline("[点我](javascript:alert(1))").some((node) => node.t === "link"), false);
  const html = parseMarkdown("<img src=x onerror=alert(1)>");
  assert.deepEqual(html, [{ t: "paragraph", content: [{ t: "text", text: "<img src=x onerror=alert(1)>" }] }]);
});

test("plain text and the list hint drop the marks", () => {
  assert.equal(plainText("# 标题\n- **粗**体\n[链接](https://a.com)"), "标题 粗体 链接");
  assert.equal(noteHint("   "), "空白笔记");
  assert.equal(noteHint("字".repeat(50)), `${"字".repeat(40)}…`);
});

test("转为登录 guesses fields from labelled lines, a bare address and an e-mail", () => {
  const note = { name: "笔记一", body: "# Shopify 后台\n- 网址：admin.shopify.com\n- **账号**: boss@example.com\n- 密码 = p@ss: word \n客服用，别外传" };
  const guess = guessLoginFields(note);
  assert.equal(guess.values.name, "Shopify 后台");
  assert.equal(guess.values.url, "admin.shopify.com");
  assert.equal(guess.values.username, "boss@example.com");
  assert.equal(guess.values.password, "p@ss: word");
  assert.equal(guess.values.note, "客服用，别外传");
  assert.deepEqual(guess.from, { name: 1, url: 2, username: 3, password: 4 });

  const bare = guessLoginFields({ name: "旧号", body: "example.com\nme@example.com\n随便写的" });
  assert.equal(bare.values.name, "旧号");
  assert.equal(bare.values.url, "example.com");
  assert.equal(bare.values.username, "me@example.com");
  assert.equal(bare.values.password, "");
  assert.equal(bare.values.note, "随便写的");
  assert.equal(noteLines("a\n\n```\nb").length, 2);
});

test("the preview refuses a login without name, user or password", () => {
  const problems = loginDraftProblems({ name: "", url: "not a url", username: "", password: "", note: "" });
  assert.deepEqual(Object.keys(problems).sort(), ["name", "password", "url", "username"]);
});

test("convert swaps note for login in one list; 还原 brings the note back exactly", () => {
  const note = { id: "n1", type: "note", name: "笔记", body: "密码: x", pinned: true, createdAt: 1, updatedAt: 2 };
  const other = { id: "a", type: "apikey" };
  const login = loginFromNote(note, { name: " 后台 ", url: "example.com", username: "u", password: "x", note: "" }, "l1", 9);
  assert.equal(login.url, "https://example.com");
  assert.equal(login.name, "后台");
  assert.deepEqual(login.fromNote, note);
  const after = convertNote([other, note], "n1", login);
  assert.deepEqual(after.map((item) => item.id), ["a", "l1"]);
  assert.throws(() => convertNote(after, "n1", login), /不在了/);
  const back = revertToNote(after, "l1");
  assert.deepEqual(back, [other, note]);
  assert.throws(() => revertToNote([{ id: "l2", type: "login" }], "l2"), /不是从笔记转来的/);
});

test("转为 API guesses named hidden fields, service, address and note; a bare long token becomes 密钥", () => {
  const body = "# OpenAI 接口\n服务: OpenAI\nBase URL: https://api.openai.com/v1\n- Client ID: abc-123\n- **Client Secret**: s3cr3t-value\nsk-proj-0123456789abcdefABCDEF\n只给客服机器人用";
  const draft = guessApiFields({ name: "笔记", body });
  assert.equal(draft.name, "OpenAI 接口");
  assert.equal(draft.service, "OpenAI");
  assert.equal(draft.endpoint, "https://api.openai.com/v1");
  assert.deepEqual(draft.fields.map((field) => [field.label, field.value, field.from]), [["Client ID", "abc-123", 4], ["Client Secret", "s3cr3t-value", 5], ["Secret", "sk-proj-0123456789abcdefABCDEF", 6]]);
  assert.equal(draft.note, "只给客服机器人用");

  const empty = guessApiFields({ name: "空", body: "随便写写" });
  assert.deepEqual(empty.fields.map((field) => [field.label, field.value]), [["密钥", ""]]);
  const problems = apiDraftProblems(empty);
  assert.deepEqual(Object.keys(problems.fieldErrors).length, 1);
});

test("转为 API stores fields with key/secret mirrors and the note; 还原 brings the note back", () => {
  const note = { id: "n1", type: "note", name: "笔记", body: "Key: k1\nSecret: s1", createdAt: 1, updatedAt: 1 };
  const draft = guessApiFields(note);
  const checked = apiDraftProblems(draft);
  assert.deepEqual(checked.found, {});
  const entry = apiFromNote(note, draft, checked.fields, "a1", 5);
  assert.equal(entry.type, "apikey");
  assert.equal(entry.key, "k1");
  assert.equal(entry.secret, "s1");
  assert.deepEqual(entry.fields.map((field) => field.label), ["Key", "Secret"]);
  assert.deepEqual(entry.fromNote, note);
  const after = convertNote([note], "n1", entry);
  assert.deepEqual(after.map((item) => item.id), ["a1"]);
  assert.deepEqual(revertToNote(after, "a1"), [note]);
});

test("转为 API keeps at most 10 hidden fields; the rest stays in 备注", () => {
  const body = Array.from({ length: 12 }, (_, index) => `Token ${index + 1}: value-${index + 1}`).join("\n");
  const draft = guessApiFields({ name: "多", body });
  assert.equal(draft.fields.length, 10);
  assert.match(draft.note, /Token 11: value-11/);
  const entry = apiFromNote({ id: "n", type: "note", name: "多", body, createdAt: 1, updatedAt: 1 }, draft, apiDraftProblems(draft).fields, "a", 1);
  assert.equal(entry.fields.length, 10);
  assert.equal(entry.key, "value-1");
});
