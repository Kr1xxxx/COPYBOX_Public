# 话术列表：收藏不再跳动

- Date: 2026-10-13 · Thread/agent: 【話術】列表滚动与收藏（worker）
- What changed: List rows now play their `row-in` entrance only once per DOM node (`app/row-entrance.ts` marks the row with `data-entered` on `animationend`; CSS turns the animation off for marked rows), so rows React re-inserts after a star or a drag no longer fade in again; `togglePinned` now uses the existing FLIP hook so the starred card slides to the top.
- User-visible change (plain Chinese, for the preview changelog): 收藏话术时列表不再跳动，收藏的话术会平滑移到最前面
- Not done / risks: 无
- Next step: 无
