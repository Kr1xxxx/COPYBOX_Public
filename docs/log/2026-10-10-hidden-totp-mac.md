# Hidden 验证码 (Mac)

- Date: 2026-10-10 · Thread/agent: 【安全】Mac 版 2FA
- What changed: new hidden authenticator on the Mac app only (`app/totp-core.ts`, `app/totp-store.ts`, `app/totp-dialog.tsx`); unlocked by tapping the version line in Settings → 关于 five times. Secrets are stored in their own encrypted localStorage key. See D-027.
- User-visible change (plain Chinese, for the preview changelog): Mac 版新增隐藏的验证码功能：在设置里连点版本号 5 次开启，可添加密钥、看 6 位验证码和倒计时、点一下复制。
- Not done / risks: no QR-image import; accounts are not in backups (clearing app data loses them); never tried on a real Mac (D-014).
- Next step: Lock confirms this reading of "2FA"; 合并 (new encrypted store is high-risk).
