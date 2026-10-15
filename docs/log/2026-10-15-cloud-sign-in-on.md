# 登录同步: on in real installs

- Date: 2026-10-15 · Thread/agent: 【功能】App 內郵箱登錄與同步
- What changed: Removed the `CLOUD_SERVER_LIVE` switch, so the desktop app now offers 登录同步 whenever its shell has `cloudRequest` (every build from this one on). This follows a confirmed live server and a delivered test code email. A plain browser without the bridge still shows no sign-in. The e2e test for that switch was replaced with two tests: a real-install path (the request goes through the app and a 503 shows a plain message), and an app without `cloudRequest`, which shows no sign-in.
- User-visible change (plain Chinese, for the preview changelog): 正式安装包里也能在「设置 → 概览 → 账号与同步」用邮箱验证码登录同步了（下一个安装包起）
- Not done / risks: Not yet tried on a real Windows or Mac against the live server. Images and TOTP do not sync. The server keeps at most 1.9 MB per person.
- Next step: After Krix asks for the next installer, sign in on two computers and check that 话术 and 账号 move across.
