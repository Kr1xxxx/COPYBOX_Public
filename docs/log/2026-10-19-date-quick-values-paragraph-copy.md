# Quick dates for 日期 blocks; copy a long 话术 one paragraph at a time

- Date: 2026-10-19 · Thread/agent: 功能 · 日期快速值與分段複製 (items C and D of advice/2026-10-19-desktop-review.md)
- What changed: Blocks named with 日期/date offer 今天 / 明天 / 3 天后 / 下周一 (Taipei calendar; "Oct 20" in English, "10月20日" in Chinese) in the popup above the block, through `quickOptions` in `app/variable-memory.ts`; those dates never enter the recent-values list. A 话术 split by blank lines shows a small copy button per paragraph (`ParagraphCopy` in `app/ui-atoms.tsx`, `splitParagraphs` in `app/clipbox-core.ts`) in the open card and the mini window; `copyPrepared` / `copyMini` take an optional paragraph, and `finishCopy(…, part)` leaves the card's big 复制 button alone. The variable popup now stays inside the window when it is wide. Preview 2.22.
- User-visible change (plain Chinese, for the preview changelog): 「日期」高亮块点开有 今天 / 明天 / 3 天后 / 下周一 四个快速日期；分段的长话术每段右边有小复制按钮（迷你窗口也有）
- Not done / risks: The mini window still fills an empty 日期 block with the word 日期 (the owner's 2026-10-14 rule), not today's date. A value typed in English stays when switching to 中文 (shared block names), so a picked "Oct 20" shows in the Chinese text until a Chinese date is picked. No e2e test (light-testing rule); unit tests cover the date maths and the paragraph split.
- Next step: Owner looks at preview 2.22, then merge.
