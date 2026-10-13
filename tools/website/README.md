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
| `/preview/` | Asks for the passphrase first (see below), then the web preview, a copy of `dist-preview/` (its pages use relative paths, so a subfolder works); `/preview` redirects there |
| `/download/Copyboxx-Setup.exe` | The Windows installer: the newest `tauri-test-N` pre-release asset (`*-Windows-setup.exe`) |
| `/download/latest.json` | `{ version, notes, url, size, sha256, updatedAt }`, same shape as the desktop update check (D-023); not wired yet |
| `/assets/site.<hash>.css` | The stylesheet; its name carries the first 8 hex of its sha256, so a changed file gets a new name |
| `/favicon.ico`, `/favicon.svg`, `/apple-touch-icon.png`, `/icon-192.png`, `/icon-512.png`, `/og-image.png` | Icons and the share card, copied from `icons/` |
| `/images/*.png` | App screenshots (`app-win-light.png`, `app-win-dark.png`), copied from `images/` |
| `/site.webmanifest`, `/robots.txt`, `/sitemap.xml` | Written by the build; robots.txt keeps `/preview/` out of search engines, the sitemap lists the four pages |
| anything else | `404.html` with status 404 |

Source files in this folder:

| File | What it is |
| --- | --- |
| `pages/{index,download,help,privacy}.html` | Page bodies (what goes inside `<main>`) with `__PLACEHOLDER__` slots |
| `partials/head.html` | Everything up to `<body>`: title, description, canonical, share-card tags, icons, manifest, the stylesheet link and the theme script (跟随系统 → 浅色 → 深色, `localStorage` key `clipboxx-site-theme`, set as `data-theme` before the page paints) |
| `partials/header.html`, `partials/footer.html` | Header (brand, nav with `__NAV_HOME__` … slots, theme toggle, 在线试用, 下载) and footer |
| `site.css` | All styles, light and dark; no fonts or frameworks from the network |
| `404.html`, `preview-gate.html` | Bodies of the 404 page and the passphrase page; built with the same head, header and footer. The gate keeps `__MESSAGE__` for the Worker |
| `icons/`, `images/` | Committed icons and screenshots, made by hand when the icon or the UI changes |
| `build.mjs`, `deploy.mjs`, `worker.mjs`, `wrangler.jsonc` | Build, upload, the Worker and its config |

The repo is private, so the public cannot download from GitHub; that is why the site hosts the installer.

Why KV and not Workers static assets: wrangler uploads static assets with a short-lived upload token in the
`Authorization` header, and the agent proxy of the Claude cloud session replaces that header with the account token,
so the upload fails with 401. KV writes and the script upload use the normal token.

The Worker answers GET and HEAD (plus POST of the passphrase form to `/preview/`), sends an `ETag` (the file's
sha256, 304 on a match), `no-cache` for `.html` and `.json` and for the other files under `preview/` (no hash in their
names), a one-year immutable cache for `preview/assets/` (hashed names), one hour for the installer, and the installer
as a download named `Copyboxx-Setup.exe`.

## 网页测试版口令 (preview passphrase)

Everything under `/preview/` asks for a passphrase first; `/`, `/download/*` and the 404 page do not. The passphrase is
`PREVIEW_SECRET` in `wrangler.jsonc` (`vars`); it is case-insensitive and surrounding spaces are ignored. To change it,
edit it there and run `npm run website:deploy` (changing it also logs everyone out). If it is missing or blank, nobody
gets in and the page says 网页测试版暂未开放.

The page is `preview-gate.html` (KV key of the same name, with an inline fallback in `worker.mjs`); the form posts to
`/preview/`. A right answer sets the cookie `preview_pass` (a SHA-256 of the passphrase, `HttpOnly`, `Secure`,
`Path=/preview`) for 30 days. Without it, preview pages show the passphrase page and other preview files answer 401
「需要口令」. This is a light gate that keeps the preview to colleagues, not a security boundary: anyone who knows
the passphrase can share it, and the preview holds only sample data.

## Build and deploy

```bash
npm run build && npm run preview:build                     # dist-preview/
npm run website:build                                      # downloads the newest installer from GitHub Releases
npm run website:build -- --installer path/to/setup.exe     # or uses a local file
npm run website:deploy                                     # node tools/website/deploy.mjs (add -- --dry-run to only print)
```

- Each page is `partials/head.html` + `partials/header.html` (the current nav item gets `aria-current="page"`) + its
  body + `partials/footer.html`. The build fills `__VERSION__`, `__UPDATED__`, `__SIZE__`, `__SHA256__`, the page
  title, description and canonical address, and the stylesheet name in one pass; a placeholder
  left without a value stops the build (except `__MESSAGE__` in the gate). It copies `icons/*` to the site root and
  `images/*` to `images/`; a missing folder or file only prints a warning, so the site still builds.
- `website:build` also takes `--preview <dir>`, `--out <dir>` (defaults `dist-preview`, `dist-website`, relative
  to the repo root), `--icons <dir>` and `--images <dir>` (defaults `tools/website/icons`, `tools/website/images`).
  Besides the site files it writes `kv-bulk.json` (every file, base64, with
  `{ type, sha256, size }` metadata) and `manifest.json` (the list of keys). Downloading needs `GITHUB_TOKEN` or
  `GH_TOKEN`. In the Claude cloud session Node's `fetch` needs `NODE_USE_ENV_PROXY=1` to go through the proxy:
  `NODE_USE_ENV_PROXY=1 npm run website:build`.
- `website:deploy` runs `wrangler@4.150.0` three times: `kv bulk put` of `kv-bulk.json`, then `kv key list` and a
  `kv bulk delete` of the keys that are no longer in `manifest.json` (old preview chunks), then `deploy` of the Worker.
- Deploying needs a Cloudflare API token. `wrangler` reads `CLOUDFLARE_API_TOKEN`; in the Claude cloud session the
  proxy injects the real token, so any placeholder value works, together with the proxy's CA:
  `CLOUDFLARE_API_TOKEN=placeholder NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt npm run website:deploy`.
- The first deploy also binds `copyboxx.com` and `www.copyboxx.com` as custom domains; Cloudflare creates the DNS
  records itself.
- Publishing a newer installer or preview: run the builds again (preview, then website) and deploy again.
- Try it locally:
  ```bash
  npx --yes wrangler@4.150.0 kv bulk put dist-website/kv-bulk.json --binding FILES --local --config tools/website/wrangler.jsonc
  CLOUDFLARE_API_TOKEN=placeholder npx --yes wrangler@4.150.0 dev --config tools/website/wrangler.jsonc --port 8787 --local
  ```
