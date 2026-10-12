# 图片 page: 收起, 选择 and 选择 → 删除

- Date: 2026-10-12 · Thread/agent: 【圖片】宮格與動效
- What changed: the 图片 header now has 「收起」 (only while a picture is expanded) and 「选择」, in the same place and with the same look as on the 话术 page, left of the grid/list switch. 选择 shows a tick box on every picture (grid and list) and a bar at the bottom with 已选 N 张, 全选/全不选, 删除 and 完成. Files: `app/image-section.tsx` (selection state, ticks, bar, `collapse()` on the handle, `selecting` props), `app/page.tsx` (the two header buttons and the selection state, kept per folder), `app/globals.css` (the tick on a grid picture). Touches `app/page.tsx` at the 图片 header only. Tests: `tests/e2e/image-grid.e2e.mjs` (Windows and Mac, grid), `tests/e2e/images.e2e.mjs` (list view).
- User-visible change: on 图片, 「收起」 folds the open picture; 「选择」 lets you tick several pictures and 「删除」 moves them all to the 回收站 at once (restorable there, so no extra question). One picture keeps the 6-second 撤销. Not in the 回收站 or the mini window (the mini window has no header).
- Not done / risks: no 移动到 in the bar (not asked for). Changing folder ends 选择.
- Next step: none.
