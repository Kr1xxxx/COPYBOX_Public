# Owner admin page at copyboxx.com/admin

- Date: 2026-10-15 · Thread/agent: 官網 · 網站與 Cloudflare 操作（常駐）
- What changed: New read-only page `/admin/` on the website Worker (`tools/website/admin.mjs`, D-065): email-code sign-in
  for `ADMIN_EMAILS` only, then a list of users with registration, last sign-in, last sync, signed-in computers and
  cloud size. New D1 table `admin_sessions`; tests in `tests/website-admin.test.mjs`.
- User-visible change (plain Chinese, for the preview changelog): 无（官网后台，App 不变）
- Not done / risks: Live only after the owner's 「部署」: create `admin_sessions`, set `ADMIN_EMAILS`, deploy.
  Users who only asked for a code also appear (shown as 还没登录过).
- Next step: Deploy on 「部署」.
