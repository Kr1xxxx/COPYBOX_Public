# Remembered-values strip back beside 编辑

- Date: 2026-10-10 · Thread/agent: 【話術】話術功能與測試版
- What changed: reverted the v1.25 layout change that put the remembered-values strip on its own line. It sits to the right of 编辑 again; when the window is too narrow it scrolls sideways inside its own box (no visible scrollbar) with the ? kept at the right end, so the card never grows wider than the list. The e2e test now checks the strip is right of 编辑 on the same line and that the list has no sideways scroll.
- User-visible change (plain Chinese, for the preview changelog): 常用高亮块放回「编辑」右边；太窄时这一排可以左右滑动。
- Not done / risks: with many variables the later groups are reached by sliding; unpushed (upload freeze). Rule from Lock: layout and position changes are asked first.
- Next step: Lock tries it in the preview.
