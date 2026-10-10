# 排版守卫端到端测试

- Date: 2026-10-10 · Thread/agent: 【工具】技能与合并规则
- What changed: Added `tests/e2e/layout-guard.e2e.mjs` and its detector `tests/e2e/layout-detect.js`. It opens the main screens, menus and dialogs on Windows/Mac × light/dark × normal (680×620) and mini (360×440) windows and fails on clipped borders or focus rings, cut-off text or placeholders, popups outside the window, page-wide horizontal scroll, overlapping controls and text contrast below 3. Known issues sit in a reason-tagged `KNOWN` list; deliberate designs in `BY_DESIGN`. New inputs, menus or dialogs need their opening steps added to the test.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: The wide 1100×760 size is not covered. The settings tabs (#52) are opened automatically once they exist. In the mini window the inline variable popup and image adding are skipped (no such controls there). New finding: mini-window "已复制" text contrast 2.89 (listed in `KNOWN`). Remove each `KNOWN` entry when its fix lands. The Mac 验证码 "添加账号" dialog and the variable popup bar overlap did not fire in this run; their entries stay as guards.
- Next step: Other threads fix the `KNOWN` items and delete the matching entries.
