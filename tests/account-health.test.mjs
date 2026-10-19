import assert from "node:assert/strict";
import test from "node:test";
import { CHECKUP_EVERY_MS, accountCsv, accountRows, accountsFromSheet, checkupDue, hasProblems, isWeakPassword, passwordHealth } from "../app/account-health.ts";

const DAY = 24 * 60 * 60 * 1000;
const now = 1_000 * DAY;
const login = (id, password, updatedAt = now, extra = {}) => ({ id, type: "login", name: id, url: "", username: "", password, note: "", createdAt: 0, updatedAt, ...extra });

test("密码体检: reused, weak, under 10 characters and unchanged for over a year; 回收站 and empty passwords ignored", () => {
  const items = [
    login("a", "same-password-1"),
    login("b", "same-password-1", now - 400 * DAY),
    login("c", "短密码12"),
    login("d", "same-password-1", now, { trashedAt: now }),
    login("e", ""),
    login("f", "A-very-long-unique-1", now - 300 * DAY),
    login("g", "password2024"),
    login("h", "Note-edited-1", now, { passwordChangedAt: now - 500 * DAY }),
    login("i", "Pass-changed-1", now - 500 * DAY, { passwordChangedAt: now }),
    { id: "n", type: "note", name: "n", body: "same-password-1", createdAt: 0, updatedAt: 0 },
  ];
  const health = passwordHealth(items, now);
  assert.deepEqual(health.reused.map((group) => group.map((item) => item.id)), [["a", "b"]]);
  assert.deepEqual(health.short.map((item) => item.id), ["c"]);
  assert.deepEqual(health.weak.map((item) => item.id), ["g"]);
  // 「一年以上没改」 follows the password's own date; without one, the entry's last change.
  assert.deepEqual(health.old.map((item) => item.id), ["b", "h"]);
});

test("密码强度低 = fewer than three kinds of characters; the check is due when never opened or two months ago", () => {
  assert.equal(isWeakPassword("1234567890"), true);
  assert.equal(isWeakPassword("password2024"), true);
  assert.equal(isWeakPassword("Password2024"), false);
  assert.equal(isWeakPassword("pass-word-2024"), false);
  assert.equal(checkupDue(null, now), true);
  assert.equal(checkupDue(now - CHECKUP_EVERY_MS + 1, now), false);
  assert.equal(checkupDue(now - CHECKUP_EVERY_MS, now), true);
  assert.equal(hasProblems(passwordHealth([login("x", "Strong-Pass-1")], now)), false);
  assert.equal(hasProblems(passwordHealth([login("x", "weakpassword")], now)), true);
});

test("导出账号表格: one CSV row per entry, quoted where needed, 回收站 and marks left out", () => {
  const csv = accountCsv([
    login("Shopify", 'pa,ss"word', now, { url: "https://shopify.com", username: "me@x.com", note: "第一行\n第二行", passwordChangedAt: new Date(2025, 0, 2).getTime() }),
    login("old", "x", now, { trashedAt: now }),
    { id: "k", type: "apikey", name: "OpenAI", service: "OpenAI", key: "sk-1", secret: "", endpoint: "", expires: "", createdAt: 0, updatedAt: 0 },
    { id: "mark:x", type: "mark", target: "login:x" },
  ], [{ id: "t", issuer: "Google", name: "me@gmail.com", secret: "JBSWY3DPEHPK3PXP", digits: 6, period: 30, algorithm: "SHA1", createdAt: 0 }], [{ label: "旧秘密", secret: "abc" }]);
  assert.ok(csv.startsWith("\uFEFF类型,名称,网址,用户名,密码或密钥,备注,密码修改日期\r\n"));
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines[1], '登录,Shopify,https://shopify.com,me@x.com,"pa,ss""word","第一行\n第二行",2025-01-02');
  assert.equal(lines[2], "API 密钥,OpenAI,,,sk-1,,");
  assert.equal(lines[3], "验证码,Google,,me@gmail.com,JBSWY3DPEHPK3PXP,,");
  assert.equal(lines[4], "其他,旧秘密,,,abc,,");
  assert.equal(lines.length, 6);
});

test("导入账号表格: an exported table comes back whole; rows already here are skipped", () => {
  const items = [
    login("Shopify", "Pass-1234-abc", now, { url: "https://shopify.com", username: "me@x.com", note: "备注", passwordChangedAt: new Date(2025, 0, 2).getTime() }),
    { id: "k", type: "apikey", name: "Pair", service: "", key: "id-1", secret: "sec-2", fields: [{ id: "a", label: "Client ID", value: "id-1" }, { id: "b", label: "Client Secret", value: "sec-2" }], note: "说明", endpoint: "https://api.x.com", expires: "2027-01-01", createdAt: 0, updatedAt: 0 },
    { id: "r", type: "recovery", name: "Google", site: "google.com", codes: ["1111", "2222"], note: "", createdAt: 0, updatedAt: 0 },
    { id: "p", type: "payment", kind: "bank", name: "美元", fields: { holder: "Example Ltd", bankAddress: "1 Main St\nLondon" }, createdAt: 0, updatedAt: 0 },
    { id: "d", type: "address", name: "广州公司", fields: { contact: "张三", phone: "138", address: "天河区\n1 号", note: "" }, createdAt: 0, updatedAt: 0 },
    { id: "n", type: "note", name: "随手记", body: "第一行\n第二行", createdAt: 0, updatedAt: 0 },
  ];
  const totps = [{ id: "t", issuer: "GitHub", name: "me", secret: "JBSWY3DPEHPK3PXP", digits: 8, period: 60, algorithm: "SHA256", createdAt: 0 }];
  const rows = [["类型", "名称", "网址", "用户名", "密码或密钥", "备注", "密码修改日期"], ...accountRows(items, totps)];
  let n = 0;
  const back = accountsFromSheet(rows, [], [], now, () => `new${n++}`);
  assert.equal(back.unreadable, 0);
  const [loginBack, apiBack, recoveryBack, paymentBack, addressBack, noteBack] = back.items;
  assert.equal(loginBack.password, "Pass-1234-abc");
  assert.equal(loginBack.passwordChangedAt, new Date(2025, 0, 2).getTime());
  assert.deepEqual(apiBack.fields.map((field) => [field.label, field.value]), [["Client ID", "id-1"], ["Client Secret", "sec-2"]]);
  assert.equal(apiBack.key, "id-1");
  assert.equal(apiBack.expires, "2027-01-01");
  assert.equal(apiBack.note, "说明");
  assert.equal(apiBack.endpoint, "https://api.x.com");
  assert.deepEqual(recoveryBack.codes, ["1111", "2222"]);
  assert.deepEqual([paymentBack.kind, paymentBack.fields], ["bank", { holder: "Example Ltd", bankAddress: "1 Main St\nLondon" }]);
  assert.deepEqual(addressBack.fields, { contact: "张三", phone: "138", address: "天河区\n1 号" });
  assert.equal(noteBack.body, "第一行\n第二行");
  assert.deepEqual({ ...back.totps[0], id: "t", createdAt: 0 }, totps[0]);
  // Importing the same table again adds nothing; a platform without API 密钥 keeps it as a 笔记.
  assert.equal(accountsFromSheet(rows, accountRows(items, totps), [], now, () => "x").skipped, 7);
  assert.equal(accountsFromSheet(rows, [], ["apikey", "recovery"], now, () => "x").items[1].type, "note");
  assert.throws(() => accountsFromSheet([["名称", "密码"]], [], [], now, () => "x"), /不是 Copyboxx 导出的账号表格/);
});
