import assert from "node:assert/strict";
import test from "node:test";
import { detectSite, hostnameOf, isPlausibleUrl, normalizeUrl, registrableDomain, siteFromApiKey } from "../app/site-core.ts";
import { generatePassword, hasEdgeSpace } from "../app/password-core.ts";

test("web addresses: https is added, www is dropped, junk is rejected", () => {
  assert.equal(normalizeUrl("shopify.com/admin"), "https://shopify.com/admin");
  assert.equal(hostnameOf("https://www.Amazon.com/ap/signin"), "amazon.com");
  assert.equal(hostnameOf("javascript:alert(1)"), "");
  assert.equal(isPlausibleUrl("shopify.com"), true);
  assert.equal(isPlausibleUrl("not a url"), false);
  assert.equal(isPlausibleUrl("localhost"), false);
});

test("registrable domain handles two-part suffixes", () => {
  assert.equal(registrableDomain("seller.amazon.co.uk"), "amazon.co.uk");
  assert.equal(registrableDomain("a.b.example.com"), "example.com");
  assert.equal(registrableDomain("example.com"), "example.com");
});

test("sites are found by address, by API key prefix, by name or issuer; unknown ones get an initial", () => {
  assert.equal(detectSite({ url: "https://admin.shopify.com/store" }).key, "shopify");
  assert.equal(detectSite({ url: "mail.google.com" }).name, "Google");
  assert.equal(detectSite({ url: "https://supplier.example.cn" }).key, "example.cn");
  assert.equal(detectSite({ apiKey: "AIzaSyABC123" }).key, "google");
  assert.equal(detectSite({ apiKey: "sk-ant-api03-xyz" }).key, "anthropic");
  assert.equal(detectSite({ apiKey: "sk-abc123" }).key, "openai");
  assert.equal(siteFromApiKey("nothing-known"), undefined);
  assert.equal(detectSite({ name: "Google 后台" }).key, "google");
  assert.equal(detectSite({ issuer: "GitHub" }).key, "github");
  assert.equal(detectSite({ name: "骨骼密码" }).key, "google");
  assert.equal(detectSite({ name: "PayPal 主号" }).key, "paypal");
  assert.equal(detectSite({ name: "Paypalish" }).key, "name:paypalish");
  const unknown = detectSite({ name: "神秘供应商 后台" });
  assert.deepEqual([unknown.name, unknown.letter], ["神秘供应商", "神"]);
  assert.equal(detectSite({}).key, "other");
  // the same address always gets the same colour
  assert.equal(detectSite({ url: "x-supplier.com" }).color, detectSite({ url: "https://www.x-supplier.com/login" }).color);
});

test("generated passwords have all four kinds of characters, the right length, and differ", () => {
  const first = generatePassword(16);
  assert.equal(first.length, 16);
  assert.match(first, /[a-z]/); assert.match(first, /[A-Z]/); assert.match(first, /[0-9]/); assert.match(first, /[^A-Za-z0-9]/);
  assert.notEqual(first, generatePassword(16));
  assert.equal(generatePassword(3).length, 8);
  assert.equal(generatePassword(500).length, 64);
});

test("edge spaces are noticed", () => {
  assert.equal(hasEdgeSpace(" abc"), true);
  assert.equal(hasEdgeSpace("abc"), false);
});

test("API key helpers: cleaning, inner spaces, last four, expiry states", async () => {
  const { cleanApiKey, hasInnerSpace, lastFour, expiryState, daysUntil, isValidDay } = await import("../app/apikey-core.ts");
  assert.equal(cleanApiKey("  sk-abc\n"), "sk-abc");
  assert.equal(hasInnerSpace("sk-abc def"), true);
  assert.equal(hasInnerSpace(" sk-abcdef "), false);
  assert.equal(lastFour("sk-abcdef1234"), "1234");
  assert.equal(isValidDay("2026-02-30"), false);
  assert.equal(isValidDay("2026-10-10"), true);
  const now = new Date(2026, 9, 10, 15, 0).getTime();
  assert.equal(daysUntil("2026-10-17", now), 7);
  assert.equal(daysUntil("nope", now), null);
  assert.deepEqual(expiryState("", now), { kind: "none", text: "" });
  assert.deepEqual(expiryState("2026-10-10", now), { kind: "soon", text: "今天到期" });
  assert.deepEqual(expiryState("2026-10-13", now), { kind: "soon", text: "3 天后到期" });
  assert.deepEqual(expiryState("2026-10-18", now), { kind: "ok", text: "2026-10-18 到期" });
  assert.deepEqual(expiryState("2026-10-08", now), { kind: "expired", text: "已过期 2 天" });
});

test("new sites are recognised and every bundled glyph belongs to a known site", async () => {
  const { SITE_ICONS } = await import("../app/site-icons.ts");
  assert.equal(detectSite({ url: "https://www.tiktok.com/login" }).key, "tiktok");
  assert.equal(detectSite({ name: "淘宝" }).key, "taobao");
  assert.equal(detectSite({ url: "https://dash.cloudflare.com" }).key, "cloudflare");
  for (const key of Object.keys(SITE_ICONS)) {
    assert.ok(/^#[0-9a-f]{6}$/i.test(SITE_ICONS[key].hex), key);
    assert.notEqual(detectSite({ name: key }).key.startsWith("name:"), true, `${key} is not a known site`);
  }
});

test("a payment entry named after a bank joins the shared 收款 group, not a group made from its title", async () => {
  const { paymentSite } = await import("../app/site-core.ts");
  assert.equal(paymentSite("bank", "美元电汇 - 汇丰").key, "payment");
  assert.equal(paymentSite("bank", "美元电汇 - 招行").key, "payment");
  assert.equal(paymentSite("paypal", "x").key, "paypal");
  assert.equal(paymentSite("wise", "x").key, "wise");
  assert.equal(paymentSite("other", "Stripe 提现").key, "stripe");
});
