# Login required: the app opens only after signing in (D-085)

- Date: 2026-10-20 · Thread/agent: 【登录】不登录不能用（D-085）
- What changed: new login page `app/login-gate.tsx` shown by `app/page.tsx` while no account is signed in (full and mini
  window; command line / MCP commands answer `NOT_SIGNED_IN`). Email → Cloudflare Turnstile → code → activation code
  for emails outside a company domain (`cloud-client.ts`: `sendCode(email, turnstile)`, `verify().activated`,
  `activate()`, new error codes `captcha` / `bad_activation` / `not_activated`; `cloud-sync-ui.ts`: `signIn` returns
  false when a code is needed, `activate(code)` finishes). The sign-in form left Settings (only 已登录 / 退出登录 / 注销
  remain). Pretend server (`cloud-demo.ts`) knows the activation code `AAAA-BBBB-CCCC-DDDD` and binds example.com.
  Tauri CSP allows `https://challenges.cloudflare.com` for script, frame and connect. Preview VERSION 2.33. Windows smoke
  test: with the `test-hooks` feature and `CLIPBOX_TEST_CLOUD_DEMO=1` the bridge sets `cloudDemo` so the real app signs
  in against the page's pretend server; `smoke.mjs` signs in at the login page on the first start.
- User-visible change (plain Chinese, for the preview changelog): 打开软件先登录：填邮箱、过人机验证、收验证码；不是公司邮箱的还要填激活码。登录过的电脑没网也能用；退出登录或被别的电脑顶掉后要重新登录
- Not done / risks: not tried in the real Windows / Mac app (Turnstile on `tauri://localhost` is the open question,
  D-085). The server side (Turnstile check, activation codes, /admin list) is the website thread's PR #242 and must be
  deployed before this build ships, or 人机验证 is simply not checked (the server ignores the token until
  `TURNSTILE_SECRET` is set). Full e2e suite not run (light-testing rule); `cloud-sync` and `domain-library` specs run green.
- Next step: website thread deploys #242; packaging thread builds the staff version; try the login on a real Windows
  PC and a Mac.
