# 人机验证 only when code requests are frequent (D-087)

- Date: 2026-10-20 · Thread/agent: 【功能】頻繁才人機驗證
- What changed: `app/login-gate.tsx` no longer loads the Turnstile widget up front; the first code request goes without
  a token, and only a server answer `captcha` (400) shows the widget, which then stays for that login (a refused resend
  from the code step returns to the email step). e2e `cloud-sync.e2e.mjs` updated. Server side (counts per email / IP,
  captcha demanded from the 4th request within an hour) is a patch for the website thread's PR #242, see
  `docs/decisions/D-087-captcha-only-when-frequent.md`. Preview VERSION 2.34.
- User-visible change (plain Chinese, for the preview changelog): 登录不再每次都要过人机验证：正常发验证码直接发；一小时内同一邮箱或同一网络发第 4 次起才要先过人机验证
- Not done / risks: the server change lives in the website thread's PR #242 (not deployed yet); until #242 deploys with
  `TURNSTILE_SECRET`, nothing is checked at all. The preview cannot show the widget (no server behind it). Full e2e suite
  not run (light-testing rule); the `cloud-sync` spec runs green.
- Next step: website thread applies the patch to #242 and deploys; packaging thread rebuilds the staff version.
