# 账号页密码真正加密账号数据

- Date: 2026-10-12 · Thread/agent: 【安全】 Mac 版 2FA
- What changed: setting the 账号页密码 now re-encrypts the three 账号 stores with a random key K that only the password (or a one-time recovery code) can unwrap (`app/account-lock.ts` v2 record, `app/account-encryption.ts`, `app/account-lock-ui.tsx`, wiring in `app/page.tsx`/`settings.tsx`). Pre-migration raw backup, read-back verification and exact rollback; interrupted changes finish at the next unlock; 关闭密码 moves the data back. Store formats unchanged; `clipbox.account-lock.v1` gets a version 2 shape and a new key `clipbox.account-premigration.v1` holds the backup. Tests: `tests/account-encryption.test.mjs`, `tests/e2e/account-lock.e2e.mjs`. D-039.
- User-visible change (plain Chinese, for the preview changelog): 账号页密码现在会真正加密账号里的内容（至少 8 位）。设置时会给一个只显示一次的恢复码；忘记密码可在锁屏用恢复码重设，内容不会丢。设置前会先留一份备份，设置里可以删除。旧密码可点「加密…」升级。
- Not done / risks: storage change, needs the owner's 合并. Password and recovery code both lost = data cannot be opened. 找回邮箱 is plain text. Mac 旧的「其他」列表仍用设备密钥。The email reset still waits for the server.
- Next step: owner tries it in the web trial and says 合并.
