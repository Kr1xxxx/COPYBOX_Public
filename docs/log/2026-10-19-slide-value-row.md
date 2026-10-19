# The 常用值 row slides when held and moved sideways

- Date: 2026-10-19 · Thread/agent: 【顧問】UI 还能优化什么（Fable）
- What changed: Holding the 常用值 row (`.var-memory`) and moving sideways scrolls it (`usePanScroll`, `app/pan-scroll.ts`): its scrollbar is hidden, so with a mouse there was no way to reach the values cut off at the right. A release after a slide fills nothing; a plain click still fills; the six-dot handle still reorders and is excluded from sliding. Replaces this PR's first attempt (preview 2.13, reorder by holding the value text), which Krix did not want: reordering stays on the handle only. e2e `main-flows` covers the slide. Preview VERSION 2.15 and changelog (2.14 is PR #235, stacked on this one).
- User-visible change (plain Chinese, for the preview changelog): 常用值一行太长时，按住往左右拖可以滑动，看到被挡住的；排序仍然按左边的六点把手。
- Not done / risks: light testing (lint, typecheck, unit tests, the one e2e spec); not tried on a real desktop; a trackpad or touch slide is unchanged.
- Next step: Krix checks preview 2.15, then merge.
