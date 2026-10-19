# Mac installs updates itself

- Date: 2026-10-19 · Thread/agent: 更新 · Mac 自動安裝更新
- What changed: 「立即更新」 now works on the Mac (D-078): when `latest-mac.json` carries `size` and `sha256` of the zip,
  the app downloads it with the Windows progress bar, checks size and SHA-256 (CommonCrypto), unpacks it with `ditto`,
  swaps the running `.app` for the new one (old one kept until the swap worked) and restarts
  (`src-tauri/src/update.rs`). Without those two fields the Mac keeps D-073's 「下载」 in the browser. The `start` error
  now reads 「新版本没能装上」 on both platforms (`app/update-notice.tsx`). Rust unit tests for the manifest, file names
  and bundle path.
- User-visible change (plain Chinese, for the preview changelog): Mac 版点「立即更新」也会自动下载、换上新版并重新打开，不用再手动拖进「应用程序」
- Not done / risks: not tried on a real Mac (compiled for `aarch64-apple-darwin` here; CI's Mac build runs the tests).
  An app started from a read-only place (App Translocation) or a folder the user cannot write to shows 「新版本没能装上」
  and must use 「去网站下载」. Nothing visible changes in the web preview, so no new preview version.
- Next step: packaging thread: when uploading the next Mac staff build, add `size` and `sha256` of
  `Copyboxx-macOS-arm64.zip` to `download/private-<token>/latest-mac.json` (see D-078). Mac apps from 2.0.15 and
  earlier need one more manual install.
