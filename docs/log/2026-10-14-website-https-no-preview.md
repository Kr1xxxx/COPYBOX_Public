# Website: HTTPS only, and no web preview on copyboxx.com

- Date: 2026-10-14 · Thread/agent: 網站 · Cloudflare 與 copyboxx.com
- What changed: copyboxx.com sends every http:// request to https:// (301) and adds HSTS (six months, no preload) to every answer, so the first download of the installer cannot be swapped on the way (audit S2). The site no longer hosts the web preview: website:build stops copying dist-preview, the passphrase page, the Worker's passphrase gate and the PREVIEW_SECRET in wrangler.jsonc are gone, and the 在线试用 links, the 网页测试版 requirement card and the privacy-page cookie line were removed. /preview/ is now an ordinary 404; the preview lives only as the owner's claude.ai Artifact. The deploy also turns on the zone settings Always Use HTTPS and minimum TLS 1.2.
- User-visible change (plain Chinese, for the preview changelog): 无（只改了官网）
- Not done / risks: The old passphrase stays in git history; it no longer opens anything because the gate is gone.
- Next step: 无
