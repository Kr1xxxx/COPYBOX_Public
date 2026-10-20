# Website (copyboxx.com)

The public site. `build.mjs` writes the files to `dist-website/`; a Cloudflare Worker (`worker.mjs`, config
`wrangler.jsonc`) serves them from the KV namespace `copyboxx-site-files` (binding `FILES`). Not to be confused with
`app/site-core.ts` (favicons of saved accounts).

The design (tokens, layouts, page contents) is `docs/specs/website-design.md`.

| Path | What it is |
| --- | --- |
| `/` | Home: hero, 三个部分, 三步装好 beside the app screenshot, 系统要求, 用起来顺手, 常见问题 |
| `/contact/` | The inquiry form (D-092; the public installer is no longer on the site, owner 2026-10-20): name, email, company, message, a Cloudflare Turnstile widget (the login widget's site key) and 「发送」, which stays disabled until the widget passes. `POST /contact/send` (form fields plus `cf-turnstile-response`) checks the token with Cloudflare (`TURNSTILE_SECRET`), then mails the inquiry through Resend to every address in `ADMIN_EMAILS` with the visitor's address as reply-to, and goes back to `/contact/#sent`; problems go to `#bad` (missing field or bad email), `#captcha` (no or refused token), `#limit` (the 6th inquiry from one IP in an hour, via `rate_limits`) or `#failed` (Resend refused). Without `TURNSTILE_SECRET`, `RESEND_API_KEY` or `ADMIN_EMAILS` it answers 503. `/download/` and `/download` answer 308 to `/contact/`; `/download/Copyboxx-Setup.exe` and `/download/latest.json` are gone (404), so public 1.83 installs no longer find an update |
| `/help/` | 使用说明: a short overview, one section (two or three sentences) per part of the app, with an in-page list at the top and the FAQ at `#faq` |
| `/privacy/` | 隐私说明 |
| `/staff/` | 内部版下载 (D-080): a password field and a 「验证」 button; `noindex`, not in the nav or sitemap. `POST /staff/verify` (`password`) checks the password against the Worker secret `STAFF_PASSWORD` (set it in the dashboard; never in the repo): right → 303 `/staff/#ok` with the cookie `staff` (a hash of the password and the 12-hour slot, so a copied cookie stops working after 12–24 h; HttpOnly), wrong → 303 `/staff/#wrong`, the 21st try from one IP in an hour → `/staff/#limit`, no secret 503, `GET` 405. With the cookie, `GET /staff/` is served marked verified (download buttons, version from the staff build's `latest.json`) and `GET /staff/file/win` \| `mac` streams the newest staff build from `download/private-<token>/` (uploaded by the packaging thread); without it they go back to `/staff/` |
| `/assets/site.<hash>.css` | The stylesheet; its name carries the first 8 hex of its sha256, so a changed file gets a new name |
| `/favicon.ico`, `/favicon.svg`, `/apple-touch-icon.png`, `/icon-192.png`, `/icon-512.png`, `/og-image.png` | Icons and the share card, copied from `icons/` |
| `/images/*.png` | App screenshots (`app-win-light.png`, `app-win-dark.png`), copied from `images/` |
| `/site.webmanifest`, `/robots.txt`, `/sitemap.xml` | Written by the build; the sitemap lists the four pages |
| anything else | `404.html` with status 404 (also `/preview/`: the web preview is no longer hosted here, only as the claude.ai Artifact; owner, 2026-10-14) |

Source files in this folder:

| File | What it is |
| --- | --- |
| `pages/{index,contact,help,privacy,staff}.html` | Page bodies (what goes inside `<main>`) with `__PLACEHOLDER__` slots |
| `partials/head.html` | Everything up to `<body>`: title, description, canonical, share-card tags, icons, manifest, the stylesheet link and the theme script (跟随系统 → 浅色 → 深色, `localStorage` key `clipboxx-site-theme`, set as `data-theme` before the page paints) |
| `partials/header.html`, `partials/footer.html` | Header (brand, nav with `__NAV_HOME__` … slots, theme toggle, 下载) and footer |
| `site.css` | All styles, light and dark; no fonts or frameworks from the network |
| `404.html` | Body of the 404 page; built with the same head, header and footer |
| `icons/`, `images/` | Committed icons and screenshots, made by hand when the icon or the UI changes |
| `build.mjs`, `deploy.mjs`, `worker.mjs`, `wrangler.jsonc` | Build, upload, the Worker and its config |
| `api.mjs`, `schema.sql` | The account and sync API under `/api/` and its D1 tables (see 账号与同步接口 below; wrangler bundles `api.mjs` into the Worker) |
| `free-mail.mjs` | Free-mail domains that are never bound to a company library (used by `api.mjs` and `sync.mjs`, see 话术同步) |
| `admin.mjs` | The owner's read-only user list at `/admin/` (see 后台 below, D-065) |

The site hosts no public installer (D-092); the 内部版 behind `/staff/` is the only download.

Why KV and not Workers static assets: wrangler uploads static assets with a short-lived upload token in the
`Authorization` header, and the agent proxy of the Claude cloud session replaces that header with the account token,
so the upload fails with 401. KV writes and the script upload use the normal token.

The Worker answers GET and HEAD, sends an `ETag` (the file's sha256, 304 on a match), `no-cache` for `.html` and
`.json`, a one-year immutable cache for `assets/` (hashed names), one hour for other files, and `.exe` / `.zip` keys
(the 内部版 files) as downloads. A plain `http://` request gets a 301 to the same `https://` address, and every
https answer carries `Strict-Transport-Security: max-age=15552000` (six months, no preload), so the first download of
the installer cannot be swapped on the way (audit S2, 2026-10-14). The zone settings Always Use HTTPS and minimum
TLS 1.2 are on as well.

## 话术同步 (company 话术 by 同步码)

`GET`/`HEAD /sync/<code>/snippets.json` serves the KV key `sync/<CODE>/snippets.json`: a company 话术 library
(`docs/shared-library.md`) that the app downloads for employees who entered that 同步码. `<code>` must match
`[A-Za-z0-9-]{6,40}` and is upper-cased before the lookup. The answer is JSON with `Cache-Control: no-cache`, an
`ETag` (sha256 of the file, 304 on a match) and `Access-Control-Allow-Origin: *`. A malformed code, a
code that does not exist and every other path under `/sync/` (history copies included) get the same plain-text 404,
so nothing tells which codes exist. `website:deploy` never deletes keys under `sync/`.

Codes look like `XS-7KQ2M9AB`: two letters as a group hint, a dash, eight Crockford base32 characters from the crypto
RNG. They are not secret but must not be guessable, so **never commit a real code** or put one on the site.

```bash
NODE_USE_ENV_PROXY=1 npm run sync:publish -- --new-code XS [--dry-run]                  # new code, empty library
NODE_USE_ENV_PROXY=1 npm run sync:publish -- --code XS-… --snippets file.json --dry-run # check + list added/changed/removed ids
NODE_USE_ENV_PROXY=1 npm run sync:publish -- --code XS-… --snippets file.json           # upload
NODE_USE_ENV_PROXY=1 npm run sync:publish -- --code XS-… --snippets file.json --notice notice.txt  # upload with the 更新通知 the owner approved (D-071)
NODE_USE_ENV_PROXY=1 npm run sync:publish -- --code XS-… --rollback                     # put the previous version back
NODE_USE_ENV_PROXY=1 npm run sync:publish -- --list-codes                               # agents only
NODE_USE_ENV_PROXY=1 npm run sync:publish -- --link-domain company.com --code XS-… [--dry-run]  # everyone signed in at company.com gets XS-…'s library
NODE_USE_ENV_PROXY=1 npm run sync:publish -- --unlink-domain company.com [--dry-run]    # remove that binding
NODE_USE_ENV_PROXY=1 npm run sync:publish -- --list-domains                             # domain → code, agents only
```

**By email domain.** A domain bound to a code (KV key `domains/<domain>`, value the code in upper case) gives everyone
who signs in to the app with an address there (`a@company.com`) that code's library through `GET /api/library` (see
账号与同步接口). Domain only, exact match, no per-address binding and no admin page. `--link-domain` refuses an invalid
domain, a free-mail domain (`free-mail.mjs`: gmail.com, qq.com, 163.com, outlook.com, … and copyboxx.com; anyone can get
an address there) and a code without a library, and prints the old and new binding. **Bind only after the owner says
发布 in the thread.** `domains/` keys are never served as files and `website:deploy` never deletes them.

The file is checked with the app's own `parseSharedLibrary` and refused if the app would skip any entry. Before an
upload, the version online is copied to `sync/<CODE>/history/snippets-<UTC ISO>.json`. `--rollback` restores the newest
of those, keeps the version it replaced as `history/replaced-<UTC ISO>.json` and drops the copy it restored, so a
second rollback goes one step further back. The script calls the Cloudflare API directly (the cloud session's proxy
adds the token; elsewhere set `CLOUDFLARE_API_TOKEN`, and optionally `CLOUDFLARE_ACCOUNT_ID`). Agents upload only
after the owner says 发布 or 部署 in the website thread.

## 账号与同步接口 (account and sync API, D-063)

`/api/*` is the server side of optional in-app registration and sync across computers (`api.mjs`, imported by
`worker.mjs` and routed before the GET-only rule; HSTS is added as on every answer). Live since 2026-10-15 (owner's
部署): D1 `copyboxx-users` is bound as `DB` and the secret `VAULT_KEY` is set. Without the `DB` binding every `/api/*`
answers `503 {"error":"unavailable"}`; without `RESEND_API_KEY`, `/api/auth/code` answers 503 until the owner sets it.

Login is only a 6-digit code sent to the email; there is no password. The app calls from Rust, so `/api` sends no
CORS headers (a browser page cannot read the answers); `OPTIONS` gets 204 with `Allow` only. JSON in and out; errors
are `{ "error": <code>, "message": <plain Chinese> }`.

| Request | Answer |
| --- | --- |
| `POST /api/auth/code` `{email, turnstile?}` | `200 {ok:true}` for any well-formed email, registered or not (mails the code through Resend; the user row is only created by a right code, D-094). `400 bad_email`, `429 rate_limited`, `503 unavailable` (no `RESEND_API_KEY`), `502 mail_failed`. While the secret `TURNSTILE_SECRET` is set (D-086), the 4th request from one email or one IP within an hour (D-087) must carry `turnstile`, a token the app's Turnstile widget produced, checked with Cloudflare; otherwise `400 captcha`. The first 3 need no token |
| `POST /api/auth/verify` `{email, code, device?}` | `200 {token, email, signedOut, activated}` (`activated`: the email's domain is a bound company domain, or it redeemed an activation code, D-086); `device` (e.g. "Windows 电脑") is trimmed, cut to 40 characters and kept on the session. At most 3 computers per account (D-069): a 4th sign-in ends the oldest sessions, and `signedOut` lists their device names (`[]` when none). Wrong, expired, used-up or unknown: always `401 bad_code` |
| `POST /api/auth/logout` (Bearer) | `200 {ok:true}`; ends only that session |
| `GET /api/vault` (Bearer) | `200 {version, updatedAt, data}` (`data` is the JSON object last uploaded), or `{version:0, updatedAt:null, data:null}` |
| `PUT /api/vault` (Bearer) `{baseVersion, data}` | `200 {version}` (old + 1). `409 {error:"version_conflict", version}` when `baseVersion` is not the current version; `400 bad_data` when `data` is not an object; `413 too_large` over 5 MB of request, or over 1.9 MB of data while the blobs live in D1 |
| `DELETE /api/account` (Bearer) | `200 {ok:true}`; deletes the user, all sessions, any code and the blob |
| `POST /api/activate` (Bearer) `{code}` | `200 {activated:true}` once the code is bound to this email (or the email was already activated); `400 bad_activation_code` for an unknown, malformed or already used code; `429 rate_limited` after 10 tries per IP in an hour. Codes are `XXXX-XXXX-XXXX-XXXX` (Crockford base32; case and dashes do not matter) made on `/admin/` |
| `GET /api/library` (Bearer) | `200 {domain, library}`: the company 话术 library bound to the account's email domain (KV `domains/<domain>` → code → `sync/<CODE>/snippets.json`, parsed). `{domain:null, library:null}` when the domain is not bound (exact match only, `sales.company.com` does not match `company.com`), is free mail, the code's library is missing or not valid JSON, or `FILES` is not bound. Read on every request, so unbinding takes effect on the next sync. `500 storage_error` when a KV read fails |
| other `/api/*` | `404 not_found`; a known path with another method `405 method_not_allowed` |

`/api/vault` and `/api/library` answer `403 not_activated` for an email that is neither in a bound company domain nor activated by a code (D-086). A missing, unknown or expired token is `401 unauthorized`; a token ended by a newer sign-in is `401 device_limit` (D1
`ended_sessions` remembers it until it would have expired). Limits: a code lives 10 minutes and dies after 5 wrong
tries; at most 5 codes per email, 20 code requests and 30 sign-in tries per IP (`CF-Connecting-IP`) each hour;
sessions last 90 days. Counters and tries are counted in the same statement that checks them, so a burst of parallel
requests cannot slip past a limit (D-094). Any uncaught D1/KV error answers `500 storage_error` JSON.

Storage: D1 `copyboxx-users` (tables in `schema.sql`; emails trimmed and lower-cased, at most 120 characters; codes
and tokens only as SHA-256). The blob, one per user under the key `vaults/<user id>.json`, goes to the R2 bucket bound
as `VAULTS` when there is one, otherwise to the D1 table `vault_blobs` (R2 was switched off on the owner's account on
2026-10-15; turning it on needs the dashboard, then add `"r2_buckets": [{ "binding": "VAULTS", "bucket_name":
"copyboxx-vaults" }]` and move existing rows). The blob is `JSON.stringify(data)` encrypted with AES-GCM under a key
derived by HKDF-SHA-256 from the secret `VAULT_KEY` and the user id (format byte, 12-byte IV, ciphertext), so the
stored copy alone reveals no content. It is not end-to-end: whoever reads the mailbox can sign in, and whoever
controls the Worker can decrypt. `VAULT_KEY` was generated in the cloud session and stored only as a Worker secret
(never printed); changing or losing it makes every stored blob unreadable, and the apps then upload again from their
local copies.

Setting up again from scratch (already done once; only after the owner says 部署):

1. `npx --yes wrangler@4.150.0 d1 create copyboxx-users`, then `d1 execute copyboxx-users --remote --file
   tools/website/schema.sql` (the schema only uses `CREATE TABLE IF NOT EXISTS`, so running it again is safe), and
   put the id into `wrangler.jsonc`.
2. Secrets (dashboard: Workers → copyboxx-site → Settings → Variables and Secrets, or `wrangler secret put`):
   `RESEND_API_KEY` (copyboxx.com must be a verified sending domain in Resend; mail goes from
   `Copyboxx <noreply@copyboxx.com>`) and `VAULT_KEY` (32 random bytes, base64).
3. `npm run website:deploy`.

## Build and deploy

```bash
npm run website:build                                      # writes dist-website/ (no network needed)
npm run website:deploy                                     # node tools/website/deploy.mjs (add -- --dry-run to only print)
```

- Each page is `partials/head.html` + `partials/header.html` (the current nav item gets `aria-current="page"`) + its
  body + `partials/footer.html`. The build fills the page title, description and canonical address, and the
  stylesheet name in one pass; a placeholder left without a value stops the build. It copies `icons/*` to the site root and
  `images/*` to `images/`; a missing folder or file only prints a warning, so the site still builds.
- `website:build` also takes `--out <dir>` (default `dist-website`, relative to the repo root), `--icons <dir>` and `--images <dir>` (defaults `tools/website/icons`, `tools/website/images`).
  Besides the site files it writes `kv-bulk.json` (every file, base64, with
  `{ type, sha256, size }` metadata) and `manifest.json` (the list of keys).
- `website:deploy` runs `wrangler@4.150.0` three times: `kv bulk put` of `kv-bulk.json`, then `kv key list` and a
  `kv bulk delete` of the keys that are no longer in `manifest.json` (old files; never `sync/`), then `deploy` of the Worker.
- Deploying needs a Cloudflare API token. `wrangler` reads `CLOUDFLARE_API_TOKEN`; in the Claude cloud session the
  proxy injects the real token, so any placeholder value works, together with the proxy's CA:
  `CLOUDFLARE_API_TOKEN=placeholder NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt npm run website:deploy`.
- The first deploy also binds `copyboxx.com` and `www.copyboxx.com` as custom domains; Cloudflare creates the DNS
  records itself.
- The sitemap's `lastmod` is the date of the checkout's preview version (`tools/preview/VERSION` in `changelog.json`).
- Try it locally:
  ```bash
  npx --yes wrangler@4.150.0 kv bulk put dist-website/kv-bulk.json --binding FILES --local --config tools/website/wrangler.jsonc
  CLOUDFLARE_API_TOKEN=placeholder npx --yes wrangler@4.150.0 dev --config tools/website/wrangler.jsonc --port 8787 --local
  ```

## 后台 (owner page, D-065)

`/admin/` lists who registered, when they last signed in and synced, which computers are signed in and how big their
cloud copy is, with 「注册 N 人 · 登录中 M 台」 (M = signed-in computers across all accounts) at the top (`admin.mjs`, routed after `/api/`). Read-only: it never decrypts a vault and has no buttons that change
user data. "Last sign-in" is the newest app session's expiry minus 90 days (sessions keep no start time). People who
signed in once but have no live session show 「还没登录过」; an email that only asked for a code is not listed (D-094).

- Sign-in: a 6-digit code mailed through Resend, only to addresses in the Worker secret `ADMIN_EMAILS`
  (comma-separated; set it in the dashboard or with the secrets API, never in the repo). Other addresses get the same
  "sent" answer and no mail. Admin codes live in `login_codes` under `admin <email>` (the space keeps the app's `/api/auth/code` from overwriting it, D-094), so an app code never opens the
  page and an admin code never creates an app user.
- Session: cookie `__Host-cbx_admin` (HttpOnly, Secure, SameSite=Strict, 12 hours); its SHA-256 in D1 `admin_sessions`.
  Removing an address from `ADMIN_EMAILS` ends its sessions at the next request.
- Page: no inline script, CSP `default-src 'none'` with `'self'` scripts and styles, `X-Frame-Options: DENY`, noindex.
  POSTs must be JSON and from the same origin.
- Activation codes (D-086): `POST /admin/api/codes {count}` (1–50) makes codes and answers them in plain text once; `GET /admin/api/codes` lists hint, made, redeemed by, when. The user list carries `activated`: `"domain"`, `"code"` or null.
- Without `DB`, `RESEND_API_KEY` or `ADMIN_EMAILS`, `/admin/api/*` answers 503.
- First deploy: create the table (`CREATE TABLE IF NOT EXISTS admin_sessions …` from `schema.sql`, D1 query API or
  `wrangler d1 execute`), set `ADMIN_EMAILS`, then `npm run website:deploy`.
