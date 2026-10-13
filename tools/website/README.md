# Website (copyboxx.com)

The public site: static files in `dist-website/`, served by a Cloudflare Worker with static assets
(`wrangler.jsonc`). Not to be confused with `app/site-core.ts` (favicons of saved accounts).

| Path | What it is |
| --- | --- |
| `/` | Product introduction in Chinese (`index.html`; version, installer size and date are filled in at build time) |
| `/preview/` | The web preview, a copy of `dist-preview/` (its pages use relative paths, so a subfolder works) |
| `/download/Clipboxx-Setup.exe` | The Windows installer: the newest `tauri-test-N` pre-release asset (`*-Windows-setup.exe`) |
| `/download/latest.json` | `{ version, notes, url, size, sha256, updatedAt }`, same shape as the desktop update check (D-023); not wired yet |
| anything else | `404.html` |

The repo is private, so the public cannot download from GitHub; that is why the site hosts the installer.

## Build and deploy

```bash
npm run build && npm run preview:build                     # dist-preview/
npm run website:build                                      # downloads the newest installer from GitHub Releases
npm run website:build -- --installer path/to/setup.exe     # or uses a local file
npm run website:deploy                                     # wrangler deploy --config tools/website/wrangler.jsonc
```

- `website:build` also takes `--preview <dir>` and `--out <dir>` (defaults `dist-preview`, `dist-website`, relative
  to the repo root). Downloading needs `GITHUB_TOKEN` or `GH_TOKEN`. In the Claude cloud session Node's `fetch`
  needs `NODE_USE_ENV_PROXY=1` to go through the proxy: `NODE_USE_ENV_PROXY=1 npm run website:build`.
- Deploying needs a Cloudflare API token. `wrangler` reads `CLOUDFLARE_API_TOKEN`; in the Claude cloud session the
  proxy injects the real token, so any placeholder value works, together with the proxy's CA:
  `CLOUDFLARE_API_TOKEN=placeholder NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt npm run website:deploy`.
- The first deploy also binds `copyboxx.com` and `www.copyboxx.com` as custom domains; Cloudflare creates the DNS
  records itself.
- Publishing a newer installer or preview: run the builds again (preview, then website) and deploy again.
- Try it locally: `CLOUDFLARE_API_TOKEN=placeholder npx --yes wrangler@4.150.0 dev --config tools/website/wrangler.jsonc --port 8787 --local`.
