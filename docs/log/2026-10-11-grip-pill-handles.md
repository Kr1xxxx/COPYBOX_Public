# One drag-handle look: a pill with six dots

- Date: 2026-10-11 · Thread/agent: 【圖片】宮格與動效
- What changed: Lock asked for the six-dot pill handle (rounded capsule, 2×3 dots) on every draggable place. The `grip` icon is now six dots and `.grip-pill` / the handle CSS gives the pill. It replaces the three bars on 话术 and 图片 folders in the sidebar, the `⠿` glyph in Settings > 目录, and the coloured round dot that was the card drag handle (the dots keep the folder colour). Position, size of the hit area and drag behaviour are unchanged. Other draggable places searched: none (all drag uses `usePointerReorder` and these four handles). Tests: card handle test and colour test now read the pill; one e2e checks sidebar and Settings handles share the look.
- User-visible change (plain Chinese, for the preview changelog): 所有能拖动的地方(话术卡片、话术目录、图片目录、设置里的目录)统一用圆角胶囊的六点把手。
- Not done / risks: 常用值 (variable values) dragging is in the 【話術】 branch, not in this base; if it has its own handle it should use `.grip-pill` + `<Icon name="grip" />`. Not looked at on a real desktop, only in the browser: Windows and Mac style, light and dark. Local commit only (freeze).
- Next step: 【話術】 applies the patch and checks 常用值.
