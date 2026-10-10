# 保险箱: 账号密码, 全部 view, site badges

- Date: 2026-10-10 · Thread/agent: 【安全】Mac 版 2FA
- What changed: new 账号密码 tab (`app/login-panel.tsx`; password hidden until the eye button is held, password generator, same-password warning, optional linked 验证码 shown beside the login) and a 全部 tab (`app/vault-overview.tsx`) that groups everything by website (default) or by type, with a round site badge (`app/site-core.ts`, `app/site-badge.tsx`; known shops and services get their colour, other sites a coloured initial; no network). Login items are stored with the payment items in `clipbox.vault-items.v1` (D-030); `clipbox.totp.v1` is still untouched.
- User-visible change (plain Chinese, for the preview changelog): 保险箱新增"账号密码"和"全部"：密码默认遮住、按住眼睛才显示，可生成密码、可关联验证码；"全部"里可按网站或按类型分组，每个网站带圆形标识，同一个网站的密码、收款、验证码放在一起。
- Not done / risks: real site icons fetched from the site itself are a separate step; API 密钥 and 验证码补强 come next; never run on a real Mac (D-014).
- Next step: API 密钥, 验证码补强, site icons.

## Patches 3–4 (same branch)
- What changed: API 密钥 tab (prefix → service, expiry reminder); 验证码 gets QR picture add (chosen or pasted screenshot, via the system's QR reader, otherwise a message to paste the link), a warning when copying a code with 5 s or less left, and secrets must be at least 16 characters.
- User-visible change: 保险箱 → 验证码 can add an account from a QR picture; copying a nearly expired code says so.

## Patch 5: 保险箱 in the 秘密 backup
- What changed: the 秘密 backup file now also holds the 验证码 accounts and the typed items, as an extra encrypted block (`app/vault-backup.ts`); restoring brings them back (合并 or 覆盖). Old backups without the block import as before.
- User-visible change: 导出秘密备份 on Mac now also saves 保险箱 content; 导入备份 restores it.
