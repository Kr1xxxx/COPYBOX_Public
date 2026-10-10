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

## Patch 6: real site icons
- What changed: about 30 bundled brand icons plus a once-only fetch of the site's own favicon, cached encrypted (D-031); new `desktop/site-icon.cjs` and one IPC call.
- User-visible change: 保险箱 entries show the site's real icon in front; sites without one keep the coloured initial.

## Patch 7: dialog height and QR picker (from the 【驗收】 audit)
- What changed: the 保险箱 dialog height follows its content even when another rule gives settings dialogs a fixed height (it was stretched with an empty lower half once the settings tabs landed); the QR picture field is a normal button instead of the browser's file input. Test added that fails without the fix.
- User-visible change: 保险箱 no longer shows a tall empty area; 验证码 add form has a 「选一张图片…」 button.

## Patch 8: payment entries in 全部
- What changed: a bank 收款 entry no longer becomes its own "site" named after the first word of its title; all of them share one 收款信息 group (PayPal, Wise and other known names still go to their site).
- User-visible change: 全部 → 按网站 shows one 收款信息 group instead of one group per bank entry.

## Patch 9: 恢复码, old 秘密 in 全部, 改归类
- What changed: new 恢复码 type and tab; 全部 lists the old 秘密 entries sorted by content (unknown → 其他 / 其他网站); 改归类 lets the type (old 秘密) and website be chosen by hand, saved as a `mark` item (encrypted, in backups). Old 秘密 data is untouched.
- User-visible change: 保险箱 gets a 恢复码 tab; 全部 shows the old 秘密 too, each with a 改归类 button.
