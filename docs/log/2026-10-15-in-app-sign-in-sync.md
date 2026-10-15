# In-app sign-in with an email code and sync between computers (app side)

- Date: 2026-10-15 · Thread/agent: 功能 · App 內郵箱登錄與同步
- What changed: 设置 → 账号与同步 gets 「登录同步」: email code sign-in, then 话术 and 账号 sync between the person's computers through the D-063 server (three-way merge, Mac keeps passwords local, Windows syncs them). New `app/cloud-*.ts(x)`, a `cloud_request` command in the Tauri shell, the token in Credential Manager on Windows. Hidden in real installs until the server is live; the preview uses a pretend server (D-064).
- User-visible change (plain Chinese, for the preview changelog): 设置首页「账号与同步」新增「登录同步」：用邮箱验证码登录，话术和账号在几台电脑之间自动同步；Mac 上的密码只存本机（测试版验证码填 123456）
- Not done / risks: 图片、验证码（TOTP）和 Mac 旧「秘密」还不同步. Not tried against the real server (not deployed) or on a real Windows/Mac.
- Next step: after Krix's 「部署」 of D-063, set `CLOUD_SERVER_LIVE = true`, build an installer and try two real computers.
