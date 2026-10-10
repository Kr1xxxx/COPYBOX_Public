import assert from "node:assert/strict";
import test from "node:test";
import { classifySecret } from "../app/secret-classify.ts";
import { parseRecoveryCodes, recoveryProblem } from "../app/recovery-core.ts";

test("old 秘密 entries are guessed by content, and unknown ones land in 其他", () => {
  assert.equal(classifySecret("客服 AI", "sk-ant-api03-ABCDEFGH1234"), "apikey");
  assert.equal(classifySecret("谷歌", "AIzaSyA1234567890abcdefghijklmnopqrstuv"), "apikey");
  assert.equal(classifySecret("美元账户", "GB82 WEST 1234 5698 7654 32"), "payment");
  assert.equal(classifySecret("汇丰收款", "户名 Comely\n账号 12345"), "payment");
  assert.equal(classifySecret("Shopify 登录", "boss@example.com\n密码: abc"), "login");
  assert.equal(classifySecret("邮箱", "密码: hunter2"), "login");
  assert.equal(classifySecret("公司邮箱", "JBSWY3DPEHPK3PXP"), "totp");
  assert.equal(classifySecret("x", "otpauth://totp/Example:a?secret=JBSWY3DPEHPK3PXP"), "totp");
  assert.equal(classifySecret("亚马逊恢复码", "abc"), "recovery");
  assert.equal(classifySecret("codes", "a1b2c3d4\ne5f6g7h8\ni9j0k1l2\nm3n4o5p6"), "recovery");
  assert.equal(classifySecret("仓库地址", "台北市信义区 123 号"), "other");
  assert.equal(classifySecret("", ""), "other");
});

test("recovery codes: one per line, duplicates dropped, bad input explained", () => {
  assert.deepEqual(parseRecoveryCodes(" a1b2-c3d4 \n\nE5F6-G7H8, a1b2-c3d4\r\nz9"), ["a1b2-c3d4", "E5F6-G7H8", "z9"]);
  assert.match(recoveryProblem([]), /粘贴/);
  assert.match(recoveryProblem(Array.from({ length: 51 }, (_, i) => `c${i}`)), /最多/);
  assert.match(recoveryProblem(["x".repeat(200)]), /太长/);
  assert.equal(recoveryProblem(["ok1", "ok2"]), "");
});
