# 账号页: 收起, 选择, 删除

- Date: 2026-10-12 · Thread/agent: 【安全】 Mac 版 2FA
- What changed: the 账号 header gets 收起/展开 and 选择 (checkboxes, 已选 N 条, 全选, 删除, 完成) like 话术, and every entry gets 删除 in its 「…」 menu. Delete = move to the existing 回收站 (new types by `trashedAt`, old 秘密 through the page's trash), no confirm, toast says it can be restored. `app/account-list.tsx`, `app/account-page.tsx`, header in `app/page.tsx` (账号 section-head only). No storage change. D-038 updated.
- User-visible change (plain Chinese, for the preview changelog): 账号页标题栏加了「收起」和「选择」：收起会把各网站卡片折成标题，选择后可勾选多条一起删除；每条账号的「…」菜单里也有「删除」。删除的内容进回收站，可以恢复。
- Not done / risks: 回收站里没有「选择」多选；永久删除仍是逐条确认。收起是全部折叠，不是逐个网站折叠。
- Next step: 无
