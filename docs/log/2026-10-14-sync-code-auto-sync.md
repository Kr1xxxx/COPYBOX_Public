# 同步码 and automatic company 话术 sync

- Date: 2026-10-14 · Thread/agent: 內容下發 · 話術/圖片/帳號同步方案
- What changed: Settings → 共享话术 takes a 同步码 that maps to https://copyboxx.com/sync/CODE/snippets.json (`sharedSourceUrl`), the app syncs on start and every 30 minutes, and a wrong code says so. D-052 and `docs/shared-library.md` hold the publishing rules (agent publishes on the owner's word, no admin page).
- User-visible change (plain Chinese, for the preview changelog): 共享话术改成填「同步码」，打开软件时和每 30 分钟自动同步公司话术
- Not done / risks: the website route `/sync/CODE/snippets.json` is built by the website thread and needs the owner's 部署; until then a code finds nothing (silent on auto-sync). Images and accounts come later.
- Next step (preview: next free version, v1.76 expected): website route + first code; then 图片 (D-052 later step).
