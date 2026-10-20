### D-099 One sign-in lasts a year; the login page remembers the last email (2026-10-20)
- Context: Krix 2026-10-20 「现在升级版本,本机可以保留登录状态吗?」 then 「一年一登录,再加上提醒上次登录的邮箱,再登录界面」.
  Updates already kept the sign-in (token in Windows Credential Manager / the webview's storage under the fixed bundle
  identifier `com.clipbox.tauri`, same in the private build; nothing in the update path clears them). What ended it was
  the server: a session lasted 90 days from sign-in.
- Decision: server sessions last 365 days (`sessionLifetime` in `tools/website/api.mjs`, now shared with `/admin`'s
  sign-in time). Fixed from sign-in, not renewed on use: once a year the person signs in again. At deploy, existing
  sessions get the same year with one D1 update (`tools/website/README.md`).
- The app keeps the email last signed in here (`clipbox.cloud-last-email.v1`, local only, kept by a restore, removed by
  删除账号) and the login page starts with it filled in, with a short line saying it is the last one used here.
- Unchanged: the 3-device limit (D-069), sign-out on 401 / device_limit / not_activated, the login gate (D-085).
