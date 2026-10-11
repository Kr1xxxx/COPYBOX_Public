# Remembered values always shown, ? at their right end, manual 中文翻译, three audit fixes

- Date: 2026-10-10 · Thread/agent: 【話術】話術功能與測試版
- What changed: (1) the remembered-values strip of an open 话术 card is always visible, one group per variable (with the variable's name when there are several), no longer only while a block is focused; the `?` hint moved from inside each block to the right end of that strip. (2) The editor has a visible, manually written 中文翻译 field for every 话术 (stored in `snippetMeta.chineseText`; a minimal `snippetMeta` is created on save when it is filled); a card with a 中文翻译 gets the 英文/中文 switch even without variables. Nothing writes to the field automatically. (3) Audit fixes: the row ⋯ menu flips above its button (and scrolls) when it would pass the window bottom; the variable choices open below the block when the card has the 英文/中文 switch; the backup dialog title is Chinese (话术备份 / 备注备份 / 安全导入), its gray text is darker, and Esc closes it (it had no key handling; Settings' Esc handler now steps aside while it is open). E2E tests that predate the settings tabs now click the right tab first.
- User-visible change (plain Chinese, for the preview changelog): 常用值一直显示，不用先点高亮块；问号移到常用值右边；新增话术时可以自己写中文翻译，复制时点「中文」就用它；更多操作菜单靠近窗口底部时向上展开；选项不再挡住英文/中文开关；导出备份窗口标题改成中文、说明文字更清楚、按 Esc 可以关闭。
- Not done / risks: only English text has 设为高亮 buttons (a block in the 中文翻译 can be typed as [词]); no automatic translation exists; not pushed (upload freeze).
- Next step: Lock tries it in the preview.

## Follow-up (v1.25)
- What changed: dragging a remembered value now animates (the held value follows the pointer and lifts, the others slide to their new places with a short FLIP, it settles on release; reduced motion skips the slide); the first Name option is `Beautiful`; Beautiful/Friend/Lovely never enter the recent list (`isDefaultOption`, pinned ones still show); imported the 【設置】 patch showing version and update time in 设置 → 关于 and the page header.
- User-visible change: 常用值拖动有动效；首选项 Beautiful 首字母大写；固定的三个选项不进常用；关于页和页面顶部显示更新时间。

## Follow-up (v1.27)
- What changed: fixed options are now a general rule in `app/variable-memory.ts` (`FIXED_OPTIONS` map, `fixedOptions`, `isFixedOption`); the popup above a block and the recent-list filter both read it, so any block listed there keeps its fixed options out of 常用. Only Name has them today.
- User-visible change: 固定选项（Beautiful / Friend / Lovely）不进「常用」，以后新增的固定选项也一样。
