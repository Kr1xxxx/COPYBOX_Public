import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { fetchSiteIcon, normalizeHost, isPrivateAddress } = require("../desktop/site-icon.cjs");

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
const reply = (body, init = {}) => ({ ok: init.status === undefined || init.status < 300, status: init.status ?? 200, headers: new Headers(init.headers || {}), arrayBuffer: async () => new Uint8Array(body).buffer });

test("only real public host names are accepted", () => {
  assert.equal(normalizeHost(" Example.COM "), "example.com");
  for (const bad of ["", "localhost", "127.0.0.1", "10.0.0.5", "[::1]", "example", "a b.com", "https://example.com", "exa_mple.com", "example.com/path"]) assert.equal(normalizeHost(bad), "", bad);
  for (const address of ["127.0.0.1", "10.1.2.3", "192.168.0.1", "172.16.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1"]) assert.equal(isPrivateAddress(address), true, address);
  assert.equal(isPrivateAddress("93.184.216.34"), false);
});

test("the site's own favicon.ico is fetched with a plain GET and returned as a data URL", async () => {
  const seen = [];
  const icon = await fetchSiteIcon("example.com", { lookup: publicLookup, fetchImpl: async (url, init) => { seen.push({ url: String(url), init }); return reply(PNG); } });
  assert.match(icon, /^data:image\/png;base64,/);
  assert.equal(seen[0].url, "https://example.com/favicon.ico");
  assert.equal(seen[0].init.credentials, "omit");
  assert.equal(seen[0].init.redirect, "manual");
});

test("without favicon.ico the page's own icon link is used; SVG is never taken", async () => {
  const html = '<html><head><link rel="icon" type="image/svg+xml" href="/a.svg"><link rel="shortcut icon" href="/static/i.png"></head></html>';
  const urls = [];
  const icon = await fetchSiteIcon("example.com", { lookup: publicLookup, fetchImpl: async (url) => {
    urls.push(String(url));
    if (String(url).endsWith("/favicon.ico")) return reply(Buffer.from("nope"), { status: 404 });
    if (String(url).endsWith("/static/i.png")) return reply(PNG);
    return reply(Buffer.from(html));
  } });
  assert.match(icon, /^data:image\/png/);
  assert.ok(!urls.some((u) => u.endsWith(".svg")));
});

test("private addresses, other sites, plain http, non-images and big files give nothing", async () => {
  assert.equal(await fetchSiteIcon("example.com", { lookup: async () => [{ address: "192.168.1.1", family: 4 }], fetchImpl: async () => reply(PNG) }), "");
  const redirectTo = (location) => async () => reply(Buffer.alloc(0), { status: 302, headers: { location } });
  assert.equal(await fetchSiteIcon("example.com", { lookup: publicLookup, fetchImpl: redirectTo("https://evil.test/x.png") }), "");
  assert.equal(await fetchSiteIcon("example.com", { lookup: publicLookup, fetchImpl: redirectTo("http://example.com/x.png") }), "");
  assert.equal(await fetchSiteIcon("example.com", { lookup: publicLookup, fetchImpl: async () => reply(Buffer.from("<html>not an image</html>")) }), "");
  assert.equal(await fetchSiteIcon("example.com", { lookup: publicLookup, fetchImpl: async () => reply(Buffer.concat([PNG, Buffer.alloc(200 * 1024)])) }), "");
  assert.equal(await fetchSiteIcon("example.com", { lookup: publicLookup, fetchImpl: async () => { throw new Error("ECONNREFUSED"); } }), "");
});

test("a redirect inside the same site (www) is followed", async () => {
  let n = 0;
  const icon = await fetchSiteIcon("example.com", { lookup: publicLookup, fetchImpl: async () => (n++ === 0 ? reply(Buffer.alloc(0), { status: 301, headers: { location: "https://www.example.com/favicon.ico" } }) : reply(PNG)) });
  assert.match(icon, /^data:image\/png/);
});
