# 一年一登录 + 记住上次登录的邮箱

- Date: 2026-10-20 · Thread/agent: 登录 · 升级保留登录状态
- What changed: server sessions 90 → 365 days (`tools/website/api.mjs`, `/admin` uses the same constant). The login page
  (`app/login-gate.tsx`) fills in the email last signed in on this computer (`clipbox.cloud-last-email.v1`, written in
  `cloud-sync-ui.tsx` finish(), cleared by 删除账号, local-only in backups) and says so under the field. D-099.
- User-visible change (plain Chinese, for the preview changelog): 登录一次，这台电脑一年内不用再登录（网站部署后生效）；退出后再登录时自动填上上次的邮箱
- Not done / risks: the server part needs 部署 plus the one-time D1 update in `tools/website/README.md`; until then
  sessions still end after 90 days. The preview skips the login page (D-098), so it is shown by screenshots.
- Next step: deploy the Worker, run the D1 update, internal build.
