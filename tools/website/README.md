# Website (copyboxx.com)

The public site. `build.mjs` writes the files to `dist-website/`; a Cloudflare Worker (`worker.mjs`, config
`wrangler.jsonc`) serves them from the KV namespace `copyboxx-site-files` (binding `FILES`). Not to be confused with
`app/site-core.ts` (favicons of saved accounts).

| Path | What it is |
| --- | --- |
| `/` | Product introduction in Chinese (`index.html`; version, installer size and date are filled in at build time) |
| `/preview/` | The web preview, a copy of `dist-preview/` (its pages use relative paths, so a subfolder works); `/preview` redirects there |
| `/download/Clipboxx-Setup.exe` | The Windows installer: the newest `tauri-test-N` pre-release asset (`*-Windows-setup.exe`) |
| `/download/latest.json` | `{ version, notes, url, size, sha256, updatedAt }`, same shape as the desktop update check (D-023); not wired yet |
| anything else | `404.html` with status 404 |

The repo is private, so the public cannot download from GitHub; that is why the site hosts the installer.

Why KV and not Workers static assets: wrangler uploads static assets with a short-lived upload token in the
`Authorization` header, and the agent proxy of the Claude cloud session replaces that header with the account token,
so the upload fails with 401. KV writes and the script upload use the normal token.

The Worker answers GET and HEAD only, sends an `ETag` (the file's sha256, 304 on a match), `no-cache` for `.html` and
`.json` and for the other files under `preview/` (no hash in their names), a one-year immutable cache for
`preview/assets/` (hashed names), one hour for the installer, and the
installer as a download named `Clipboxx-Setup.exe`.

## Build and deploy

```bash
npm run build && npm run preview:build                     # dist-preview/
npm run website:build                                      # downloads the newest installer from GitHub Releases
npm run website:build -- --installer path/to/setup.exe     # or uses a local file
npm run website:deploy                                     # node tools/website/deploy.mjs (add -- --dry-run to only print)
```

- `website:build` also takes `--preview <dir>` and `--out <dir>` (defaults `dist-preview`, `dist-website`, relative
  to the repo root). Besides the site files it writes `kv-bulk.json` (every file, base64, with
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
