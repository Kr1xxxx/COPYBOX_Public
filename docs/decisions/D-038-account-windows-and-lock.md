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
- Update (owner, 2026-10-12: "加一个「忘记密码」按钮，需要邮箱重置密码,后期我们用服务器"): the lock screen has 「忘记密码」, and setting or
  changing the password can include an optional 找回邮箱 (stored inside the same `clipbox.account-lock.v1` record, as plain text).
  The reset mail needs the owner's server, which is not deployed: `RESET_SERVER_URL` in `app/account-lock.ts` is empty, so the
  button says "找回功能需要服务器，部署后开通". When the address is set, the app POSTs `{email}` to `<server>/account-reset`.
  A reset never clears the account data. This replaces "There is no reset" above.
- Update (owner, 2026-10-12: "windows 账号,去掉 API +恢复码这个类别"): on Windows the sidebar 分类 and the 新增 menu offer only 登录, 收款信息 and
  验证码. Existing API 密钥 / 恢复码 entries are not deleted and still show under 全部. macOS is unchanged.
- Update (owner, 2026-10-12: "账号也加上这个功能, 账号单独的也加上删除功能"): the 账号 page header has 收起 (folds every website card to its title; 展开 undoes it)
  left of 选择 (tick entries, 全选, 删除, 完成), and every entry has 删除 in its 「…」 menu. 删除 moves to the 回收站 without asking
  (the 回收站 can 恢复; 永久删除 there still asks). Both platforms; hidden while the page is locked.
