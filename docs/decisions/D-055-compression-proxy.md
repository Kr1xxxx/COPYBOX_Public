### D-055 Image compression goes through copyboxx.com with the 企业同步码; no TinyPNG key ships in the app (2026-10-15)
- Context (owner, 2026-10-15, thread 「做代理」): the repo is public and anything built into the installer can be dug out,
  so the owner refuses to put TinyPNG keys into the installer (secret `CLIPBOX_TINIFY_KEYS` stays empty) and has revoked
  the two old keys. Staff should still get compressed pictures without applying for a key themselves.
- Decision: the Worker `copyboxx-site` answers `POST https://copyboxx.com/compress`. The picture is the body (PNG, JPEG
  or WebP judged by its first bytes, at most 5 MB, TinyPNG's own limit), the 企业同步码 goes in the header
  `X-Copyboxx-Code`. A code is valid when its 话术 file `sync/<CODE>/snippets.json` exists in KV (D-052); a missing or
  unknown code gets the same plain 404 as `/sync/`. The Worker sends the picture to TinyPNG with the keys in the Worker
  secret `TINIFY_KEYS` (comma-separated; on 401/429 the next key is tried) and returns the result. Nothing is stored or
  logged. At most 20 pictures a minute per code (rate-limit binding `COMPRESS_LIMITER`), and the app's own 100 a month per
  computer still applies. No CORS headers: only the desktop shell (`src-tauri/src/tinify.rs`, key `proxy:<code>`) calls it.
- Order in the app: own keys from 设置 first; else the 企业同步码 through the proxy; else keys an installer might carry;
  else the original is stored with a hint to fill in the 企业同步码.
- Consequences: the key never leaves Cloudflare; the owner sets or rotates it himself in the Cloudflare dashboard
  (Workers & Pages → copyboxx-site → Settings → Variables and Secrets). Anyone holding a valid code can use the company's
  quota (up to the rate limit); a leaked code is changed as in D-052. Every compression needs the network and copyboxx.com.
- Status: accepted (owner asked for it, 2026-10-15 「做代理」).
