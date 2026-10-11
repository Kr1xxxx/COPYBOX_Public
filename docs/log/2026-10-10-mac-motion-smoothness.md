# Mac motion smoothness: two cheaper animations

- Date: 2026-10-10 · Thread/agent: 【圖片】宮格與動效
- What changed: (1) dialog backdrops (5 kinds) no longer fade their opacity; only the dark tint fades in (`backdrop-in` animates `background-color`). Fading the opacity of an element that carries `backdrop-filter: blur` makes the browser re-blur the whole page behind it on every frame, which is a known slow path on a Mac. (2) the 目录 groups in Settings (`ArcCollapsible`) no longer animate a `filter: blur` on their content; height and a small rise remain. An e2e test guards (1).
- User-visible change (plain Chinese, for the preview changelog): 弹窗打开时背景虚化更流畅,设置里目录分组展开更顺。
- Not done / risks: no WebKit in this environment (only Chromium; not downloaded), and headless Chromium has no GPU, so the gain is by construction and could not be measured as a frame-rate difference. Still unfixed suspects: the 图片 grid has 16 `backdrop-filter` tiles (frosted glass, the owner asked for it); the snippet row detail and the settings groups animate height (real layout, cheap here: 21 and 31 layouts, 8 and 10 ms). Which action is slow, and whether it is the web preview in Safari or the Mac app, is still unknown. Local commit only (freeze).
- Next step: ask the owner which action is slowest.
