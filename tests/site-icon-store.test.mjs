import assert from "node:assert/strict";
import test from "node:test";
import { isIconData, needsFetch, readSiteIcons, writeSiteIcons } from "../app/site-icon-store.ts";

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }; };

test("icons round-trip encrypted; a wrong key or broken data just means an empty cache", async () => {
  const storage = memory();
  const map = { "foo.com": { data: "data:image/png;base64,AAAA", at: 5 } };
  await writeSiteIcons("device-key", map, storage);
  assert.ok(!storage.getItem("clipbox.site-icons.v1").includes("AAAA"));
  assert.deepEqual(await readSiteIcons("device-key", storage), map);
  assert.deepEqual(await readSiteIcons("other-key", storage), {});
  storage.setItem("clipbox.site-icons.v1", "{broken");
  assert.deepEqual(await readSiteIcons("device-key", storage), {});
});

test("a site is asked once; one without an icon is asked again only after a month", () => {
  const day = 86_400_000;
  assert.equal(needsFetch({}, "a.com", 0), true);
  assert.equal(needsFetch({ "a.com": { data: "data:image/png;base64,AA", at: 0 } }, "a.com", 400 * day), false);
  assert.equal(needsFetch({ "a.com": { data: "", at: 0 } }, "a.com", 10 * day), false);
  assert.equal(needsFetch({ "a.com": { data: "", at: 0 } }, "a.com", 31 * day), true);
});

test("only small image data URLs are accepted from the bridge", () => {
  assert.equal(isIconData("data:image/png;base64,iVBOR"), true);
  for (const bad of ["", "data:image/svg+xml;base64,AAAA", "javascript:alert(1)", "https://x.com/a.png", "data:text/html;base64,AAAA"]) assert.equal(isIconData(bad), false, bad);
});
