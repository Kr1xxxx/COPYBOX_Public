# Mini window folder tabs back to two characters

- Date: 2026-10-18 · Thread/agent: 【功能】mini 窗口目录标签恢复两个字
- What changed: Reverted PR #223 (merge e4b1e84): `app/folder-short-name.ts`, `clipbox-core.ts`, `image-store.ts`, `page.tsx`, their tests and `docs/features.json` are back to the two-character rule of D-049. The e2e wait fix from #224 (`tests/e2e/image-grid.e2e.mjs`) is kept. D-074 is superseded by D-075.
- User-visible change (plain Chinese, for the preview changelog): 迷你窗口的目录标签恢复显示两个字。
- Not done / risks: 无
- Next step: 无
