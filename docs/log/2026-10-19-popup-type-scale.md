# Popups use the settings type scale

- Date: 2026-10-19 · Thread/agent: UI 統一 · 彈窗與設定頁風格
- What changed: One override block at the end of `app/globals.css` gives every popup (backup / restore / data move / recovery code, delete and confirm cards, 话术 import, Tips, 更新通知, first-run guide) the sizes of the 设置 window: title 18px (was 20–25px), body text 12.5–13.5px (was 9–13px), buttons 36px and fields 34px with 8px corners (were 40–48px with 10–13px corners), popup corners 16px (were 19–22px), buttons and fields in the heading font like the settings buttons. Sizes and spacing only; colours, fonts and layout stay (brand block, D-071). Preview 2.14 (stacked on #234's 2.13).
- User-visible change (plain Chinese, for the preview changelog): 所有弹窗改成和设置页一样的字号、按钮和圆角，不再一个弹窗一个样
- Not done / risks: The old per-popup rules stay in the file under the new block (deleting them would touch the minified dialog CSS); the unused `.editor-dialog`, `.folder-create-dialog` and `.snippet-copy-dialog` rules were left as they were. Not checked on real Windows / Mac, only in the browser preview.
- Next step: 无
