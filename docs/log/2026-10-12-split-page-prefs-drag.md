# page.tsx split: stored choices and the remembered-value drag

- Date: 2026-10-12 · Thread/agent: 【工程】代碼整理
- What changed: Moved two blocks out of `app/page.tsx` without changing them: `readStoredChoice`, `writeStoredChoice` and `readRefreshedImageView` to `app/stored-choice.ts`, and the drag-to-reorder handlers of a block's remembered values to the hook `useValueOptionDrag` in `app/value-option-drag.ts`. `page.tsx` goes from 2210 to about 2130 lines. No behaviour or layout change; nothing in 图片, 账号, 设置 or 备份 was touched.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: The drag handlers still close over the render they were made in, exactly as before (kept on purpose so behaviour does not move). Next blocks to split are listed in the thread.
- Next step: 无
