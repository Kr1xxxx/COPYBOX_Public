import assert from "node:assert/strict";
import test from "node:test";
import { accountCsv, passwordHealth } from "../app/account-health.ts";

const DAY = 24 * 60 * 60 * 1000;
const now = 1_000 * DAY;
const login = (id, password, updatedAt = now, extra = {}) => ({ id, type: "login", name: id, url: "", username: "", password, note: "", createdAt: 0, updatedAt, ...extra });

test("密码体检: reused, under 10 characters and unchanged for over a year; 回收站 and empty passwords ignored", () => {
  const items = [
    login("a", "same-password-1"),
    login("b", "same-password-1", now - 400 * DAY),
    login("c", "短密码12"),
    login("d", "same-password-1", now, { trashedAt: now }),
    login("e", ""),
    login("f", "a-very-long-unique-one", now - 300 * DAY),
    { id: "n", type: "note", name: "n", body: "same-password-1", createdAt: 0, updatedAt: 0 },
  ];
  const health = passwordHealth(items, now);
  assert.deepEqual(health.reused.map((group) => group.map((item) => item.id)), [["a", "b"]]);
  assert.deepEqual(health.short.map((item) => item.id), ["c"]);
  assert.deepEqual(health.old.map((item) => item.id), ["b"]);
});

test("导出账号表格: one CSV row per entry, quoted where needed, 回收站 and marks left out", () => {
  const csv = accountCsv([
    login("Shopify", 'pa,ss"word', now, { url: "https://shopify.com", username: "me@x.com", note: "第一行\n第二行" }),
    login("old", "x", now, { trashedAt: now }),
    { id: "k", type: "apikey", name: "OpenAI", service: "OpenAI", key: "sk-1", secret: "", endpoint: "", expires: "", createdAt: 0, updatedAt: 0 },
    { id: "mark:x", type: "mark", target: "login:x" },
  ], [{ id: "t", issuer: "Google", name: "me@gmail.com", secret: "JBSWY3DPEHPK3PXP", digits: 6, period: 30, algorithm: "SHA1", createdAt: 0 }], [{ label: "旧秘密", secret: "abc" }]);
  assert.ok(csv.startsWith("﻿类型,名称,网址,用户名,密码或密钥,备注\r\n"));
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines[1], '登录,Shopify,https://shopify.com,me@x.com,"pa,ss""word","第一行\n第二行"');
  assert.equal(lines[2], "API 密钥,OpenAI,,,sk-1,OpenAI");
  assert.equal(lines[3], "验证码,Google,,me@gmail.com,JBSWY3DPEHPK3PXP,");
  assert.equal(lines[4], "其他,旧秘密,,,abc,");
  assert.equal(lines.length, 6);
});
