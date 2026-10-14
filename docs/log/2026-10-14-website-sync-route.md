# copyboxx.com serves company 话术 per 同步码

- Date: 2026-10-14 · Thread/agent: 網站 · Cloudflare 與 copyboxx.com
- What changed: the Worker answers GET/HEAD `/sync/<code>/snippets.json` from KV `sync/<CODE>/snippets.json` (JSON, no-cache, ETag/304, CORS `*`; every miss is the same plain 404). `website:deploy` never deletes `sync/` keys. New `npm run sync:publish` (`tools/website/sync.mjs`): `--new-code XX`, `--code … --snippets file.json [--dry-run]` (app's parseSharedLibrary rules, prints added/changed/removed ids, keeps the previous version under `sync/<CODE>/history/`), `--rollback`, `--list-codes`.
- User-visible change (plain Chinese, for the preview changelog): 无（官网后台：为话术同步码准备了下载地址，App 端另做）
- Not done / risks: no code has been created or uploaded yet; that waits for the owner's 部署.
- Next step: the app reads `https://copyboxx.com/sync/<code>/snippets.json` (content-sync thread).
