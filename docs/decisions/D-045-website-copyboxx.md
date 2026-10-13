### D-045 Public website at copyboxx.com: introduction, web preview and the Windows installer (2026-10-13)
- Context (owner, 2026-10-13): 「copyboxx.com，先部署网站说明，外加网页预览功能，外加 windows 下载链接」. Until now the web
  preview was only a claude.ai artifact and installers lived in `tauri-test-N` pre-releases on a private GitHub
  repository, which the public cannot download from (D-023). The domain `copyboxx.com` is on the owner's Cloudflare
  account (zone active, certificate for the root and `*.copyboxx.com`, no DNS records before this decision).
- Decision:
  - **One static site, three paths.** `https://copyboxx.com/` is a product introduction page in plain Chinese;
    `/preview/` is the same web preview the owner already reviews (built from `tools/preview/`, a snapshot of the
    branch it was built from, data only in the visitor's browser); `/download/Clipboxx-Setup.exe` is the Windows
    installer (file name after the product name Clipboxx, D-044). `/download/latest.json` carries `{"version","notes","url"}` (the D-023 update-check shape) plus size and
    SHA-256; the desktop update check is **not** pointed at it yet (the owner's call, D-023 stays).
  - **Hosting: Cloudflare Workers static assets**, config `tools/website/wrangler.jsonc`, Worker name `copyboxx-site`,
    custom domains `copyboxx.com` and `www.copyboxx.com` (Cloudflare creates the DNS records itself). No server code,
    no database, nothing collected from visitors. Cloudflare R2 is not used (not enabled on the account); the installer
    is published as a static file (about 2.3 MB).
  - **Which installer.** The newest `tauri-test-N` pre-release built from `main` (today: `tauri-test-92`, app version
    1.65.0, built before the rename in D-044, so the installed app still says Clipbox until the next test build is
    published to the site). The page shows the preview version (`tools/preview/VERSION`), the file size and the update date. The
    installers stay unsigned (D-013); the page tells the visitor how to pass the Windows warning.
  - **How it is published.** From the repository: `npm run build && npm run preview:build && npm run website:build`
    then `npm run website:deploy` (`tools/website/README.md`). The deploy runs from an agent session whose Cloudflare
    token is injected by the environment; nothing is deployed from CI. Updating the site or the installer is a new
    build and deploy, done by the coordinator after the preview version changes.
- Consequences: the website is the first public address of the product; whatever is on `main` when the coordinator
  deploys is what the public can download. A newer installer reaches the site only through a deploy. The repository
  gains `tools/website/` and two npm scripts; `wrangler` is run through `npx` with a pinned version, not added as a
  dependency. "Never push a staff release" (agent notes) is superseded for the website by this owner request; the
  update-check address (D-023) is still empty.
- Status: Accepted (owner request 2026-10-13).
