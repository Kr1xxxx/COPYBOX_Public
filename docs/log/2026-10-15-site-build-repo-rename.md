# Site build reads releases from the renamed repo

- Date: 2026-10-15 · Thread/agent: 官網 · 網站與 Cloudflare 操作（常駐）
- What changed: `tools/website/build.mjs` lists releases from `Kr1xxxx/COPYBOX_Public` instead of the old name, whose
  redirect the cloud session's proxy refused (403), so `website:build` can pick the newest installer again.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: 无
- Next step: 无
- Also: `website:deploy` no longer deletes KV keys under `download/private-` (the private builds' update files), like
  `sync/`.
