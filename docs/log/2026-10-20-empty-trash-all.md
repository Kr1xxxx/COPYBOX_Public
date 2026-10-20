# 回收站「全部删除」

- Date: 2026-10-20 · Thread/agent: 功能 · 回收站全部删除
- What changed: The 回收站 header in 话术, 账号 and 图片 has a 「全部删除」 button. It opens `EmptyTrashDialog` (same card as 删除确认, states the count; 取消 has focus) and then permanently removes that section's trash: 话术 / old 秘密 through `persist` (only items still marked trashed), new 账号 types through `purgeEntry`, pictures through `library.remove` one by one. e2e: `tests/e2e/empty-trash.e2e.mjs`.
- User-visible change (plain Chinese, for the preview changelog): 回收站右上角新增「全部删除」，先问一次并写明要删几条，确认后全部永久删除（话术、账号、图片都有）
- Not done / risks: Deletes the whole section's 回收站 even while a search narrows the list (the dialog says how many). Settings → 数据 → 清空回收站 still empties 话术 and old 秘密 together, as before.
- Next step: 无
