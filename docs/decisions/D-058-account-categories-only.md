### D-058 账号 is sorted by 分类 only; no 目录 (2026-10-15)
- Context (owner, 2026-10-15): 「账号的目录可以完全改成分类,去掉目录」. Windows already showed only 分类 in 账号; the Mac
  still had a 目录 list (with 未分类) under 分类 for the old 秘密 entries, a 目录 field in their editor, 「移动到」 menus and an
  账号目录 group in 设置 → 目录.
- Decision: 账号 has the fixed 分类 (登录, 收款信息, API 密钥, 验证码, 恢复码, and on the Mac 其他) and no 目录 on any
  platform. Old 秘密 entries show under the 分类 they already had (a guess from their content, or the type picked for
  them); the rest stay in 其他.
- Data: nothing is migrated or deleted. An old entry keeps the folder name it was saved with (editing it keeps it too),
  so backups, exports and imports are unchanged and an older build still shows its folders. 话术 and 图片 keep 目录.
- Status: accepted (owner, 2026-10-15).
