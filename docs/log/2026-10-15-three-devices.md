# One account on at most 3 computers

- Date: 2026-10-15 · Thread/agent: 功能 · 同账号最多 3 台设备
- What changed: The sync server keeps at most 3 sign-ins per account; a 4th sign-in signs out the oldest computer and
  tells both sides (D-069, `ended_sessions` table, `401 device_limit`). App and pretend server show the messages.
- User-visible change (plain Chinese, for the preview changelog): 登录同步：一个账号最多同时登录 3 台电脑，第 4 台登录时最早登录的那台会自动退出并提示原因
- Not done / risks: Live only after the Worker is redeployed and schema.sql is applied again (needs the owner's 「部署」); the app messages reach staff with the next private build.
- Next step: 部署 the Worker; package the app change with the next private build.
