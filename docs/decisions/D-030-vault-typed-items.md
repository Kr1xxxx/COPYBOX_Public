### D-030 保险箱: typed secret items next to 验证码, Mac only (2026-10-10)
- Context (owner, 2026-10-10: picked 账号密码, 收款信息, 验证码补强, API 密钥 for the hidden section; no Touch ID): D-027's hidden
  验证码 dialog becomes the 保险箱 with tabs. The tab in the section switch is called 保险箱.
- Decision: new typed items live in their own AES-GCM envelope in localStorage `clipbox.vault-items.v1`
  (`app/secret-items-store.ts`, same key derivation as the 验证码 store, record bound by additional data). The 验证码 accounts
  keep `clipbox.totp.v1` exactly as D-027 wrote it, so nothing is migrated and older data cannot be lost by this change.
  First type: 收款信息 (银行电汇, PayPal, Wise, 支付宝·微信, 其他): shown in plain text because it is sent to customers, IBAN and
  SWIFT checked, every field copyable, 复制整段 gives an English block, changing an entry asks twice, 上次修改 is shown.
- Consequences: not in any backup file yet (same as 验证码). Rollback = revert; the new key is then ignored.
- Status: Accepted (waits for the owner's 合并: new encrypted store).
