# Mac update reminder

- Date: 2026-10-16 · Thread/agent: 功能 · Mac 更新提醒
- What changed: The Mac app now checks `latest-mac.json` in the update folder (`UPDATE_FOLDER` + per-platform
  `MANIFEST_NAME` in `src-tauri/src/update.rs`; Windows keeps `latest.json`) and shows the 有新版本 banner. 「下载」 opens
  the link in the browser and the banner then says how to install by hand (`app/update-notice.tsx`, new `opened`
  phase, 「知道了」 hides it until the next launch). The website Worker serves `.zip` as `application/zip`. D-073, Rust
  unit tests, e2e in `tests/e2e/update-notice.e2e.mjs`.
- User-visible change (plain Chinese, for the preview changelog): Mac 版有新版本时也会提醒，点「下载」在浏览器里下载，并告诉你怎么换上新版
- Not done / risks: not tried on a real Mac. Nothing is offered until someone uploads `latest-mac.json` and the zip.
- Next step: staff build: set `UPDATE_FOLDER` to the private folder (replaces the private `DEFAULT_UPDATE_URL`), then
  upload `download/private-<token>/Copyboxx-macOS-arm64.zip` and `latest-mac.json`
  (`{"version","notes","url"}`, url = that zip) next to the Windows files. Mac apps built before this need one manual
  install.
