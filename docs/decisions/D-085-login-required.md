### D-085 Copyboxx opens only after signing in; 人机验证 before the code; outside emails need an activation code (2026-10-19)
- Context (owner, 2026-10-19: 「能不能改成不注册无法使用?」「公开版员工版 都要改」「邮箱注册的时候加上人机验证」「登录是单独一个登录,
  不登录不能用,非公司域名需要购买激活码,同时记录下这个邮箱在后台 因为请求过邮件」). Until now 登录同步 (D-064) was optional,
  tucked into Settings; the app worked without it.
- Decision:
  - **Login is its own page** (`app/login-gate.tsx`): while nobody is signed in on this computer, the page shows only
    the login card (brand dialog look) instead of the app, in the full and the mini window, and the command line / MCP
    tools answer `NOT_SIGNED_IN` 「请先在 Copyboxx 里登录」. Signed in = the account record of D-064 exists
    (`clipbox.cloud-account.v1`); the sign-in itself is stored only once the whole flow succeeded.
  - **Flow**: 邮箱 + 人机验证 (Cloudflare Turnstile, site key in the app, token sent as `turnstile` with
    `POST /api/auth/code`) → 6-digit 验证码 (`/api/auth/verify`, now answering `activated`) → when `activated` is false,
    激活码 (`POST /api/activate`, Bearer; a code is single-use and binds to the email for good). Company emails
    (bound domains, e.g. comelylash.com) are activated by themselves. The server records every email that asked for a
    code, activated or not, for /admin (website side, PR #242).
  - **Stays signed in**: a signed-in computer keeps working offline; the server's 401 (expired, or ended by a 4th
    computer, D-069) and 403 `not_activated` drop it back to the login page with a plain line why. 退出登录 and 注销 do
    the same. The 3-computer limit (D-069) stays.
  - **Who gets it**: both the public and the staff build (same code; the staff build arrives through the packaging
    sync). The web preview keeps its pretend server: code 123456, and for emails outside example.com the activation
    code `AAAA-BBBB-CCCC-DDDD`; it shows no Turnstile widget (nothing to verify against).
  - **CSP** (`src-tauri/tauri.conf.json`): `script-src`, `frame-src` and `connect-src` also allow
    `https://challenges.cloudflare.com`, nothing else (tests/tauri-shell.test.mjs guards the rest).
- Not a security boundary: the data on the computer is still encrypted locally (D-040); the page gate only decides
  whether the app is usable. An older app (no `cloudRequest`) and a plain browser (`npm run dev`) have no login and
  open as before.
- Open: the Mac webview's origin is `tauri://localhost`; whether Turnstile accepts it is to be tried on a real Mac
  (Windows runs at `http://tauri.localhost`, which the widget allows). Fallback agreed with the website thread: a
  `https://copyboxx.com/verify` page opened by the app.
