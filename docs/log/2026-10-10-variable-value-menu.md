# Remembered values: right-click menu and dragging

- Date: 2026-10-10 · Thread/agent: 【話術】話術功能與測試版
- What changed: right-click on a listed value opens a menu with 固定, 解锁 and 删除; holding a listed value and moving it changes its place (pinned values stay in front). Pure rules `deleteValue` and `moveOption` in `app/variable-memory.ts`, menu `VariableMenu` in `app/fill-panel.tsx`.
- User-visible change (plain Chinese, for the preview changelog): 右键常用值弹出菜单：固定、解锁、删除；按住常用值可以拖动换位置，固定的排在前面。
- Not done / risks: not pushed (upload freeze); right-clicking the variable block itself still pins its current value.
- Next step: Lock tries it in the preview.
