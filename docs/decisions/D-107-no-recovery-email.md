### D-107 The 账号页密码 has no 找回邮箱; the recovery code is the only way back (2026-10-20)
- Context: setting the 账号页密码 asked for an optional 找回邮箱, and 「忘记密码」 offered 「发送重置邮件」. The reset
  server was never built (`RESET_SERVER_URL` was empty), so the mail never went out: a fake exit for someone locked
  out, while the address sat in plain text in `clipbox.account-lock.v1` (ponytail audit 2026-10-20 #20). Krix
  2026-10-20: 「2 做一下」.
- Decision: no 找回邮箱 field and no reset mail. 「忘记密码」 shows only the recovery code form (password that encrypts
  the data, D-040). The old door-only password (no recovery code) now says plainly that it cannot be reset; it never
  could. Replaces the 找回邮箱 part of D-038.
- Existing data: records that still hold an `email` keep working unchanged (password and recovery code open them as
  before); the field is dropped from the record at its next write (password change, new recovery code, reset).
  Storage key and format otherwise unchanged.
