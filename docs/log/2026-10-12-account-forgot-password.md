# 账号页「忘记密码」and 找回邮箱

- Date: 2026-10-12 · Thread/agent: 【安全】 Mac 版 2FA
- What changed: optional 找回邮箱 when setting or changing the 账号页密码; the lock screen has 「忘记密码」 (shows the masked email and a send button). Sending needs the server (`RESET_SERVER_URL` in `app/account-lock.ts`, still empty), so it says it opens after deployment. The email is a new optional field in the existing `clipbox.account-lock.v1` record. D-038 updated.
- User-visible change (plain Chinese, for the preview changelog): 账号页密码可以填一个找回邮箱；锁屏上多了「忘记密码」，服务器部署后可用邮件重置，现在先提示「找回功能需要服务器，部署后开通」。
- Not done / risks: the mail itself and the server endpoint (`POST <server>/account-reset {email}`) do not exist yet; the new-password step after the mail is not built.
- Next step: when Lock deploys the server, fill `RESET_SERVER_URL` and build the reset page/step.
