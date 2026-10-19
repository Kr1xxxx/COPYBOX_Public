# Remembered values drag by their text too

- Date: 2026-10-19 · Thread/agent: 【顧問】UI 还能优化什么（Fable）
- What changed: Holding the text of a remembered value (常用值 chip) and moving it now reorders it, like holding the six-dot handle (`startOptionDrag` on the value button; `useValueOptionDrag` returns `dragMoved()` so the drop does not count as the fill click). A click without a move still fills the block. Krix reported long values could not be dragged by their text in the web preview. e2e `main-flows` covers the text drag. Preview VERSION 2.13 and changelog.
- User-visible change (plain Chinese, for the preview changelog): 常用值按住文字也能拖动排序了（之前只能按左边的六点把手）；点一下仍然是填入。
- Not done / risks: light testing (lint, typecheck, unit tests, the one e2e spec); not tried on a real desktop.
- Next step: Krix checks preview 2.13, then merge.
