# 话术列表：收藏不再跳动，滚动时有阴影和进度条，展开卡片可收起

- Date: 2026-10-13 · Thread/agent: 【話術】列表滚动与收藏（worker）
- What changed: List rows now play their `row-in` entrance only once per DOM node (`app/row-entrance.ts` marks the row with `data-entered` on `animationend`; CSS turns the animation off for marked rows), so rows React re-inserts after a star or a drag no longer fade in again; `togglePinned` now uses the existing FLIP hook so the starred card slides to the top. New `ListScrollFrame` (`app/list-scroll-rail.tsx`, math in `app/scroll-rail-core.ts`) wraps the 话术 list and the 账号 `.vault-inline` list: a soft shadow under the header while scrolled, and an overlaid, aria-hidden thin scroll bar on the right (drag the thumb, click the track to page); the list keeps its size and its hidden native scrollbar. An open snippet card has its own 「收起」 button (`.row-collapse`, calls `collapseCards`) just left of the 英文|中文 toggle (or of the star when there is no toggle).
- User-visible change (plain Chinese, for the preview changelog): 收藏话术时列表不再跳动，收藏的话术会平滑移到最前面；话术和账号列表往下滚时，标题下面会出现一道浅阴影，右边有一条细进度条，能看出上面还有多少，也能拖动；展开的话术卡片右上角、英文/中文左边多了一个「收起」按钮，点一下就收起这条
- Not done / risks: 阴影和进度条放在标题菜单下面（z-index 2），所以展开的话术卡片（z-index 5）滚到最上面时会盖住那道阴影；迷你窗口和图片页没有加。卡片上的「收起」占了标题行一点宽度，复制按钮和标题区会往左让出约 40px（英文/中文和星标位置不变）。
- Next step: 无
