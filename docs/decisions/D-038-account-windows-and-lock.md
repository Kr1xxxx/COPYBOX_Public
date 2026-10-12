### D-038 Windows gets the 账号 page, and 账号 can have an opening password (2026-10-12)
- Context (owner, 2026-10-12: "windows 也加上账号页面,设置一个账号页面打开密码"). D-027 era Windows had no second text section.
- Decision (owner): Windows shows 话术 | 账号 | 图片 like the Mac. The page has the same categories except 其他 and the old
  「目录」 list, because Windows never had old 秘密 entries. 设置 → 数据 → 安全 has a 「账号页密码」 row (set, change, turn off).
  - While a password is set, opening 账号 shows a lock screen first; leaving the section locks it again. Search, 新增, the mini
    window and 导出账号备份 stay closed until it is entered.
  - The password only decides who can open the page. The data is still encrypted with the device key as before (no change to
    `clipbox.vault-items.v1`, `clipbox.totp.v1`). The password is kept as a salted PBKDF2-SHA256 (210k) hash in
    `clipbox.account-lock.v1` (one new storage key; nothing existing changes). It is not part of backups.
  - There is no reset: a forgotten password cannot be recovered in the app. Clearing site data removes it (and all data).
- Consequences: a password stops someone using the open app, not someone reading the browser/app storage files directly.
