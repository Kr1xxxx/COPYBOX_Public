# Web preview skips the login page

- Date: 2026-10-20 · Thread/agent: 預覽 · 網頁測試版跳過登入
- What changed: the preview shim sets `skipLogin`; `app/page.tsx` (the `LoginGate` line near the end of `Home`) skips the login page when it is set (D-098). Desktop bridge and server untouched.
- User-visible change (plain Chinese, for the preview changelog): 网页测试版打开后直接进入软件，不用再输邮箱和验证码（安装版仍需登录）
- Not done / risks: 无
- Next step: 无
