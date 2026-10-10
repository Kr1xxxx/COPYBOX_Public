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

## Backup (Lock 2026-10-10, "放啊")
The 保险箱 (验证码 accounts and typed items) goes into the 秘密 backup as one extra block `vaultBox`, encrypted with the backup password (AES-GCM, PBKDF2 310 000, own label). Old backups have no block and restore as before; Windows ignores the block. The block is opened before anything is written. 合并 keeps what is here and adds what is missing; 覆盖 makes the 保险箱 equal to the backup. The Mac command-line secret export is unchanged. This changes the backup format, so merging waits for Lock's 合并.

## Recovery codes, old 秘密 in the overview, own sorting (Lock 2026-10-10, "继续")
- New item type `recovery` (恢复码: name, site, codes, note) in the same encrypted store; its own tab.
- 全部 also lists the old 秘密 entries (read only; they stay in the vault where they are). Their type is guessed from the content (`secret-classify.ts`); unknown ones are 其他 and sit under 其他网站. Opening one leads back to the 秘密 list.
- 改归类: Lock can change the type (old 秘密 only) and the website of any entry. Stored as a `mark` item in the same encrypted store (so it is in backups); clearing both goes back to the guess. Nothing in the old 秘密 data is changed.
