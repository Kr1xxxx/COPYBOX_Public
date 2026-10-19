### D-078 The Mac installs updates itself too: 立即更新 downloads the zipped app, checks it, swaps it in and restarts (2026-10-19)
- Context (owner, 2026-10-19: 「Mac 自动安装更新可以」). D-073 only told the Mac about a new version and sent it to the
  browser because the app is unsigned (D-013). Update signing stays dropped. What the Mac needs for an update the app
  installs itself is not a signature: a file the app downloads itself carries no "from the internet" (quarantine) mark,
  so macOS opens the new copy the way it opened the old one. Only a copy downloaded by a browser gets that mark, which is
  why D-073's by-hand install needed 「仍要打开」.
- Decision (replaces the "download in the browser" part of D-073; the rest of D-073 stays):
  - **The Mac reads the same `latest-mac.json`** (D-073) and now also uses its `size` and `sha256`, which are the
    zip's. With both present the banner shows 「立即更新」 exactly as on Windows (D-047: progress bar, 「正在安装，马上自动重新
    打开」, errors with 「重试」 and 「去网站下载」); without them the Mac keeps D-073's 「下载」 in the browser.
  - **The zip is what the build already makes**: `ditto -c -k --keepParent Copyboxx.app Copyboxx-macOS-arm64.zip`
    (`.github/workflows/tauri.yml`), no `.app.tar.gz` and no Tauri updater plugin (it would need a signing key).
  - **Download and check** are the Windows path in `src-tauri/src/update.rs`: same host rule (https on `copyboxx.com`),
    exact size, SHA-256 computed while downloading, now from the Mac's own CommonCrypto (`CC_SHA256_*` in libSystem, no
    new dependency), into `$TMPDIR/clipbox-update/<name from the link>`.
  - **Install** (`start_installer` on macOS): after the page has saved (`flush::then_after_flush`, as 退出 / 重启),
    `/usr/bin/ditto -x -k` unpacks the zip next to it, the running bundle (`current_exe()` three levels up, must end in
    `.app`) is moved into that folder as `previous.app`, the new `.app` is moved to the bundle's path, the folder is
    deleted and the bundle's change time is refreshed. If the second move fails the old bundle is moved back and the
    page shows 「更新没成功：新版本没能装上」 (the `start` reason, reworded for both platforms; was 「安装程序没能打开」). Then
    `app.restart()` (the same call as 重启) starts the new version from the same path. Data lives under
    `~/Library/Application Support/com.clipbox.tauri` and is never touched.
  - **Linux** still never looks (`MANIFEST_NAME` empty) and could only open a link.
- Who gets it: Mac apps built with this code, once `latest-mac.json` carries `size` and `sha256`. A Mac app built
  before this (staff build 2.0.15 and earlier) shows 「下载」 as before and has to be replaced by hand once more.
- Staff build (private repo, packaging thread): nothing changes in the code beyond `UPDATE_FOLDER` (D-073). When
  uploading a Mac build to `download/private-<token>/`, write `latest-mac.json` as
  `{ "version", "notes", "url", "size", "sha256" }` where `size` is the zip's byte count and `sha256` its hex digest
  (`shasum -a 256`), the same way `latest.json` describes the Windows installer.
- Known limits: an app that runs from a read-only place (App Translocation: a quarantined copy started from the
  Downloads folder and never moved), from another volume than the temp folder, or from a folder the user may not write
  to, cannot be swapped; it reports 「新版本没能装上」 and 「去网站下载」 still works. Not tried on a real Mac; the Rust
  code was compiled for `aarch64-apple-darwin` and runs in CI's Mac build (`mac-check` label).
- Status: Accepted (owner choice 2026-10-19).
