### D-027 Hidden 验证码 (two-factor code generator), Mac only (2026-10-10)
- Context (owner, 2026-10-10: "mac 版本秘密加一个2FA 功能"): the request was ambiguous. Read as: a hidden authenticator
  (TOTP, RFC 6238) inside the Mac app. If the owner meant protecting the app's own login with 2FA, this decision is replaced.
- Decision: on macOS only, tapping the version line in Settings → 关于 five times within three seconds opens 验证码 and adds a
  fourth tab of that name next to 话术 | 秘密 | 图片 (the tab opens a dialog). The dialog adds accounts from a secret or an
  `otpauth://totp/…` link, shows the 6-digit code with a countdown ring, copies on click and deletes with a confirmation.
  「隐藏入口」 removes the tab again; the accounts stay. Windows never shows any of it.
- Storage: one AES-GCM envelope in its own localStorage key `clipbox.totp.v1`, key derived from the device key with PBKDF2
  (310 000 rounds), record bound by additional data. Not in the vault, not in any backup file. Max 30 accounts.
- Consequences: clearing app data loses the accounts (same as images, D-017). No QR-image import. Rollback = revert the PR;
  the stored key is then simply ignored.
- Status: Accepted (waits for the owner's 合并 because it adds a new encrypted store).
