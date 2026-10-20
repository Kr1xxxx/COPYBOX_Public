### D-086 Server side of the login gate: 人机验证 on code requests, activation codes for non-company emails (2026-10-19)
- Context (owner, 2026-10-19: 「邮箱注册的时候加上人机验证」, 「登录是单独一个登录,不登录不能用,非公司域名需要购买激活码,同时记录下这个邮箱在后台」).
  The app side (login page before the main window, Turnstile widget, 激活码 input) is D-085, thread 「功能 · 不登錄無法使用」.
- Decision (Worker `api.mjs`, `admin.mjs`, `schema.sql`):
  - **人机验证**: `POST /api/auth/code` takes `{email, turnstile}`; the token is checked with Cloudflare Turnstile
    (`siteverify`) and refused as `400 captcha` 「请先完成人机验证」. Enforced only while the Worker secret
    `TURNSTILE_SECRET` is set, so apps without the widget keep working until the new build ships. Widget "Copyboxx app
    login" (managed mode; hostnames copyboxx.com, tauri.localhost, localhost); its public site key goes in the app, its
    secret only into the Worker secret. Amended by D-087 (2026-10-20): only a frequent asker, the 4th request from one
    email or one IP within an hour, has to pass it.
  - **Activation**: an email is activated when its domain is bound to a company library (KV `domains/<domain>`) or when it
    redeemed an activation code. `POST /api/auth/verify` answers `activated`; `POST /api/activate {code}` (Bearer) binds a
    code to the signed-in email (`400 bad_activation_code` for unknown, malformed or used codes; 10 tries per IP and
    hour); `/api/vault` and `/api/library` answer `403 not_activated` 「这个邮箱还没激活」 until then. Logout, account
    deletion and activation itself never need it.
  - **Codes**: `XXXX-XXXX-XXXX-XXXX` (16 Crockford base32 letters; typed lower case or without dashes is fine). The owner
    makes 1–50 at a time on `/admin/` (`POST /admin/api/codes`), sees them once, and the table `activation_codes` keeps
    only the SHA-256, the first four letters, who redeemed it and when. One code, one email, no expiry.
  - **Recording**: every email that asked for a code already appears on `/admin/` (user row created on the first
    request, 「还没登录过」); the list now also shows 公司邮箱 / 已激活 / 未激活.
- Not covered: refunds or revoking a code (delete the row in D1 by hand), codes with an expiry, prices or a shop.
- Tests: `tests/website-api.test.mjs` (Turnstile, activation, limits), `tests/website-admin.test.mjs` (codes).
