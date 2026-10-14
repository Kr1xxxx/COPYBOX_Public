# Test build may ship without TinyPNG keys when the owner says so

- Date: 2026-10-14 · Thread/agent: 官網 · 網站與 Cloudflare 操作（常駐）
- What changed: tauri.yml gets a workflow_dispatch input allow_missing_tinify_keys (default false). With it, a published test build goes ahead when the CLIPBOX_TINIFY_KEYS secret is empty; without it the gate still stops the build. Krix asked for the current main on the website now, without waiting for the secret.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: the installer built this way has no built-in TinyPNG key, so staff who have not set their own key save images uncompressed. Rebuild once the secret is added.
- Next step: Krix adds CLIPBOX_TINIFY_KEYS, then rebuild without the input and swap the website installer again.
