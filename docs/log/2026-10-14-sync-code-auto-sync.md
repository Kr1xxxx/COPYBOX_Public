# 企业同步码 and automatic company 话术 sync

- Date: 2026-10-14 · Thread/agent: 內容下發 · 話術/圖片/帳號同步方案
- What changed: Settings home → 账号与同步 has a 企业同步码 field that maps to https://copyboxx.com/sync/CODE/snippets.json (`sharedSourceUrl`), with 立即同步 and the last sync time; the app syncs on start and every 30 minutes, and a wrong code says so. 数据 → 共享话术 keeps sync from a file and the export. D-052 and `docs/shared-library.md` hold the publishing rules (agent publishes on the owner's word, no admin page).
- User-visible change (plain Chinese, for the preview changelog): 设置首页「账号与同步」可以填企业同步码，打开软件时和每 30 分钟自动同步公司话术
- Not done / risks: checked against the live copyboxx.com route (PR #156) with curl only; the real Windows app is not tried yet. Images and accounts come later.
- Next step: publish the owner's first 话术 file to his code; then 图片 (D-052 later step).
