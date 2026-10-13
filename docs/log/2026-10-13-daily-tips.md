# 每日 Tips card in the sidebar

- Date: 2026-10-13 · Thread/agent: coordinator worker (每日 Tips)
- What changed: New sidebar card 「每日 Tips」 pinned above 回收站 in 话术, 账号 and 图片 (not in the mini window); it shows one tip per local calendar day, moving one entry per new day through a library of 30 built-in tips (`app/daily-tips.ts`, `app/daily-tips-card.tsx`), and opens a dialog with the full text (知道了 or Esc closes it). The library can later take tips from a company file (`{ format: "clipbox-tips", version: 1, items }`), merged by id, never removing any.
- User-visible change (plain Chinese, for the preview changelog): 侧栏回收站上方新增「每日 Tips」小卡片，每天一条软件使用小技巧，点开看全文
- Not done / risks: Online updates are prepared but off (`TIPS_URL` is empty in `app/daily-tips.ts`). Adds the storage key `clipbox.tips.v1` (plain JSON: today's tip, server tips, last read day; owner approved; it goes into 完整备份 through the `clipbox.` prefix). Tip texts were checked against the current UI wording; when a feature or label changes, the matching tip must change too.
- Next step: Fill `TIPS_URL` with `https://copyboxx.com/tips.json` once the website serves that file.
