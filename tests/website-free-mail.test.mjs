import assert from "node:assert/strict";
import test from "node:test";
import * as freeMail from "../tools/website/free-mail.mjs";
import { isFreeMailDomain, normalizeDomain } from "../tools/website/free-mail.mjs";

test("free mail: domains are trimmed and lower-cased; implausible ones are null", () => {
  assert.equal(normalizeDomain("  Company.COM "), "company.com");
  assert.equal(normalizeDomain("sales.company.co.uk"), "sales.company.co.uk");
  assert.equal(normalizeDomain("xn--fiqs8s.com"), "xn--fiqs8s.com");
  assert.equal(normalizeDomain("my-company.com"), "my-company.com");
  for (const bad of ["", "   ", "localhost", "company.", ".company.com", "company..com", "-company.com", "company-.com", "company.c", "company.c0m", "company.123", "com pany.com", "a@company.com", "company.com/x", "公司.com", `${"a".repeat(64)}.com`, `${"a.".repeat(126)}com`, null, undefined, 42]) {
    assert.equal(normalizeDomain(bad), null, String(bad));
  }
  assert.equal(normalizeDomain(`${"a".repeat(63)}.com`), `${"a".repeat(63)}.com`);
});

test("free mail: the blocklist, country versions of hotmail/outlook/yahoo/live, and anything not a domain", () => {
  for (const domain of ["gmail.com", "QQ.com", " 163.com ", "vip.qq.com", "foxmail.com", "outlook.com", "icloud.com", "proton.me", "yahoo.co.jp", "hotmail.co.uk", "naver.com", "copyboxx.com"]) {
    assert.equal(isFreeMailDomain(domain), true, domain);
  }
  for (const domain of ["hotmail.fr", "outlook.de", "yahoo.co.uk", "live.jp", "outlook.com.br", "yahoo.com.tw"]) {
    assert.equal(isFreeMailDomain(domain), true, domain);
  }
  for (const domain of ["company.com", "sales.company.com", "gmail.company.com", "mail.company.com", "hotmail.shop.co.uk", "live-chat.com", "outlooks.com", "qq.com.cn"]) {
    assert.equal(isFreeMailDomain(domain), false, domain);
  }
  for (const bad of ["", "localhost", null]) assert.equal(isFreeMailDomain(bad), true, String(bad));
});

test("free mail: only functions are exported (a Worker module may export nothing else)", () => {
  for (const [name, value] of Object.entries(freeMail)) assert.equal(typeof value, "function", name);
});
