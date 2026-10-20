# 内部版下载页：居中一张卡

- Date: 2026-10-20 · Thread/agent: 【官網】官網 · 網站與 Cloudflare 操作（常駐）
- What changed: `/staff/` is now one centred card (the 404 page's `.solo` / `.solo-card` layout, owner: 「居中展示,这个 UI
  不大符合主题」): title, password field and a full-width 「验证」 button; after verification the same spot shows the
  check mark, version, the two download buttons and the short install notes. Worker and routes unchanged.
- User-visible change (plain Chinese, for the preview changelog): 无（网站）
- Not done / risks: none known; same Worker code and tests as PR #251.
- Next step: deploy from main on the owner's 部署.
