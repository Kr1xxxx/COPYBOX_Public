# Website (copyboxx.com)

The public site. `build.mjs` writes the files to `dist-website/`; a Cloudflare Worker (`worker.mjs`, config
`wrangler.jsonc`) serves them from the KV namespace `copyboxx-site-files` (binding `FILES`). Not to be confused with
`app/site-core.ts` (favicons of saved accounts).

The design (tokens, layouts, page contents) is `docs/specs/website-design.md`.

| Path | What it is |
| --- | --- |
| `/` | Home: hero with the three fanned cards, 三个部分, 三步装好 beside the app screenshot, 系统要求, 用起来顺手, 常见问题 |
| `/download/` | The download card (version, size, date, SHA-256), install steps, the SmartScreen warning, moving data from the old version, updating, Mac |
| `/help/` | 使用说明: a short overview, one section (two or three sentences) per part of the app, with an in-page list at the top and the FAQ at `#faq` |
| `/privacy/` | 隐私说明 |
| `/download/Copyboxx-Setup.exe` | The Windows installer: the newest `tauri-test-N` pre-release asset (`*-Windows-setup.exe`), built from `main` (D-048) |
| `/download/latest.json` | `{ version, notes, url, size, sha256, signature, updatedAt }`, same shape as the desktop update check (D-023); the Windows app reads it (D-047). `version` is the installer's own, from the release's `release-version.json` (D-048). `signature` is the release's `Copyboxx-Windows-setup.exe.sig`, checked against `src-tauri/update-public-key.txt` before it is written (D-053); apps that check signatures offer nothing without it |
| `/assets/site.<hash>.css` | The stylesheet; its name carries the first 8 hex of its sha256, so a changed file gets a new name |
| `/favicon.ico`, `/favicon.svg`, `/apple-touch-icon.png`, `/icon-192.png`, `/icon-512.png`, `/og-image.png` | Icons and the share card, copied from `icons/` |
| `/images/*.png` | App screenshots (`app-win-light.png`, `app-win-dark.png`), copied from `images/` |
| `/site.webmanifest`, `/robots.txt`, `/sitemap.xml` | Written by the build; the sitemap lists the four pages |
| anything else | `404.html` with status 404 (also `/preview/`: the web preview is no longer hosted here, only as the claude.ai Artifact; owner, 2026-10-14) |

Source files in this folder:

| File | What it is |
| --- | --- |
| `pages/{index,download,help,privacy}.html` | Page bodies (what goes inside `<main>`) with `__PLACEHOLDER__` slots |
| `partials/head.html` | Everything up to `<body>`: title, description, canonical, share-card tags, icons, manifest, the stylesheet link and the theme script (跟随系统 → 浅色 → 深色, `localStorage` key `clipboxx-site-theme`, set as `data-theme` before the page paints) |
| `partials/header.html`, `partials/footer.html` | Header (brand, nav with `__NAV_HOME__` … slots, theme toggle, 下载) and footer |
| `site.css` | All styles, light and dark; no fonts or frameworks from the network |
| `404.html` | Body of the 404 page; built with the same head, header and footer |
| `icons/`, `images/` | Committed icons and screenshots, made by hand when the icon or the UI changes |
| `build.mjs`, `deploy.mjs`, `worker.mjs`, `wrangler.jsonc` | Build, upload, the Worker and its config |

The repo is private, so the public cannot download from GitHub; that is why the site hosts the installer.

Why KV and not Workers static assets: wrangler uploads static assets with a short-lived upload token in the
`Authorization` header, and the agent proxy of the Claude cloud session replaces that header with the account token,
so the upload fails with 401. KV writes and the script upload use the normal token.

The Worker answers GET and HEAD, sends an `ETag` (the file's sha256, 304 on a match), `no-cache` for `.html` and
`.json`, a one-year immutable cache for `assets/` (hashed names), one hour for the installer, and the installer as a
download named `Copyboxx-Setup.exe`. A plain `http://` request gets a 301 to the same `https://` address, and every
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
NODE_USE_ENV_PROXY=1 npm run sync:publish -- --code XS-… --rollback                     # put the previous version back
NODE_USE_ENV_PROXY=1 npm run sync:publish -- --list-codes                               # agents only
```

The file is checked with the app's own `parseSharedLibrary` and refused if the app would skip any entry. Before an
upload, the version online is copied to `sync/<CODE>/history/snippets-<UTC ISO>.json`. `--rollback` restores the newest
of those, keeps the version it replaced as `history/replaced-<UTC ISO>.json` and drops the copy it restored, so a
second rollback goes one step further back. The script calls the Cloudflare API directly (the cloud session's proxy
adds the token; elsewhere set `CLOUDFLARE_API_TOKEN`, and optionally `CLOUDFLARE_ACCOUNT_ID`). Agents upload only
after the owner says 发布 or 部署 in the website thread.

## Build and deploy

```bash
npm run website:build                                      # downloads the newest installer from GitHub Releases
npm run website:build -- --installer path/to/setup.exe --installer-version 1.69.0   # or uses a local file
npm run website:deploy                                     # node tools/website/deploy.mjs (add -- --dry-run to only print)
```

- Each page is `partials/head.html` + `partials/header.html` (the current nav item gets `aria-current="page"`) + its
  body + `partials/footer.html`. The build fills `__VERSION__`, `__UPDATED__`, `__SIZE__`, `__SHA256__`, the page
  title, description and canonical address, and the stylesheet name in one pass; a placeholder
  left without a value stops the build. It copies `icons/*` to the site root and
  `images/*` to `images/`; a missing folder or file only prints a warning, so the site still builds.
- `website:build` also takes `--out <dir>` (default `dist-website`, relative to the repo root), `--icons <dir>` and `--images <dir>` (defaults `tools/website/icons`, `tools/website/images`).
  Besides the site files it writes `kv-bulk.json` (every file, base64, with
  `{ type, sha256, size }` metadata) and `manifest.json` (the list of keys). Downloading needs `GITHUB_TOKEN` or
  `GH_TOKEN`. In the Claude cloud session Node's `fetch` needs `NODE_USE_ENV_PROXY=1` to go through the proxy:
  `NODE_USE_ENV_PROXY=1 npm run website:build`.
- `website:deploy` runs `wrangler@4.150.0` three times: `kv bulk put` of `kv-bulk.json`, then `kv key list` and a
  `kv bulk delete` of the keys that are no longer in `manifest.json` (old files; never `sync/`), then `deploy` of the Worker.
- Deploying needs a Cloudflare API token. `wrangler` reads `CLOUDFLARE_API_TOKEN`; in the Claude cloud session the
  proxy injects the real token, so any placeholder value works, together with the proxy's CA:
  `CLOUDFLARE_API_TOKEN=placeholder NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt npm run website:deploy`.
- The first deploy also binds `copyboxx.com` and `www.copyboxx.com` as custom domains; Cloudflare creates the DNS
  records itself.
- Publishing a newer installer: run `website:build` again and deploy again.
- The version the site advertises is the installer's own (D-048): the build reads `release-version.json` from the
  release (`{ version, preview, ref, commit }`, written by the Tauri workflow, builds of `main` only) and uses it for
  `latest.json`, the pages and the changelog notes. A release without that file, or built from another branch, stops
  the build: publish a new test build from `main` first. With `--installer`, pass `--installer-version` (the app
  version inside the file); without it the build falls back to `tools/preview/VERSION` and warns.
- Try it locally:
  ```bash
  npx --yes wrangler@4.150.0 kv bulk put dist-website/kv-bulk.json --binding FILES --local --config tools/website/wrangler.jsonc
  CLOUDFLARE_API_TOKEN=placeholder npx --yes wrangler@4.150.0 dev --config tools/website/wrangler.jsonc --port 8787 --local
  ```
