# Account and sync server API (not deployed)

- Date: 2026-10-15 · Thread/agent: coordinator worker (website)
- What changed: Added the server side of email-code login and one-blob sync to the copyboxx.com Worker:
  `tools/website/api.mjs` (routed from `worker.mjs` for `/api/*`), `tools/website/schema.sql` for D1, tests in
  `tests/website-api.test.mjs`, decision D-063 (proposed) and the README section 「账号与同步接口」.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: Not deployed; D1/R2 bindings are not in `wrangler.jsonc` yet, so every `/api/*` answers 503
  until the owner says 部署 and the resources and secrets (`RESEND_API_KEY`, `VAULT_KEY`, verified sending domain at
  Resend) exist. `/api/auth/verify` has no per-IP limit (each code allows 5 tries, 5 codes per email per hour). A web
  page can still make a browser send a plain POST to `/api/auth/code` (no CORS, but the request itself goes out);
  the rate limits cap that.
- Next step: owner answers D-063; app screens and sync in a separate high-risk PR.
