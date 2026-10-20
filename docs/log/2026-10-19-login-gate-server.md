# Login gate, server side: 人机验证 and activation codes

- Date: 2026-10-19 · Thread/agent: 【官網】官網 · 網站與 Cloudflare 操作（常駐）
- What changed: `POST /api/auth/code` checks a Turnstile token while `TURNSTILE_SECRET` is set; new table
  `activation_codes`, `POST /api/activate`, `activated` in the verify answer, `403 not_activated` on vault and library for
  emails that are neither in a bound company domain nor activated by a code; `/admin/` makes and lists codes and shows
  each user's activation. D-086 (app side D-085). Amended 2026-10-20 (D-087, owner: 「频繁才验证」): the token is
  demanded only from the 4th code request per email or per IP within an hour; the first 3 go through without it.
- User-visible change (plain Chinese, for the preview changelog): 无（服务器和后台；软件里的登录页在 D-085 的 PR）
- Not done / risks: Deploy applies `schema.sql` again (new table only). Until the new app ships, a non-company email
  that signs in with the current app cannot sync (403); today that is at most the one registered test account.
  `TURNSTILE_SECRET` must be set only together with the app build that carries the widget. Turnstile on macOS
  (`tauri://localhost`) is unverified; fallback is a hosted /verify page.
- Next step: After the owner's 部署: apply the schema, deploy, then set `TURNSTILE_SECRET` from the widget via the API
  when the login build is live.
