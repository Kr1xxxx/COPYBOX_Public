### D-047 Windows updates itself: 立即更新 downloads, checks and installs the new version (2026-10-13)
- Context (owner, 2026-10-13): 「下载能不能做成自动更新?」, then 「更新能不能点击下载后自动覆盖? 带上进度条那种?」. Until now the
  update reminder (D-023) only opened a download link, and its address was empty, so nobody was ever told. The public
  website (D-045) now serves `https://copyboxx.com/download/latest.json` with `version`, `notes`, `url`, `size` and
  `sha256` of the Windows installer.
- Decision:
  - **The Windows app checks `https://copyboxx.com/download/latest.json`** on launch and once a day
    (`DEFAULT_UPDATE_URL` in `src-tauri/src/update.rs`; `CLIPBOX_UPDATE_URL` still overrides it for testing). This
    replaces "the address stays empty" in D-023 and "the update check is not pointed at the site" in D-045, for Windows
    only. macOS and Linux stay off: the site has no Mac installer.
  - **Only a download link that is `https` on the host `copyboxx.com`** (no other port, no login in the link) is
    accepted; anything else makes the check an error and nothing is shown. A redirect during the download must stay
    on that host too. The installer's file name is taken from the link, never written into the app (the product name
    may change again).
  - **The banner** (`app/update-notice.tsx`): 「有新版本 X」 + notes, 「立即更新」 and 「稍后」 (稍后 still hides that version,
    `clipbox.update-dismissed`). 立即更新 shows a slim progress bar with percent and 「已下载 3.1 / 5.2 MB」 and no buttons,
    then 「正在安装，马上自动重新打开」. On failure: 「更新没成功：…」 (网络 / 文件不完整 / 存不下 / 安装程序没能打开) with 「重试」
    and 「去网站下载」 (the old browser download). A shell without `installUpdate` (an older app, the Mac) or a manifest
    without size and checksum keeps today's 「下载」.
  - **Download and check** (`update::install_update`): the installer the last check found is streamed with reqwest
    `Response::chunk()` into `%TEMP%\clipbox-update\<name from the link>`; progress goes to the page as
    `clipbox:update-progress` events at most ten times a second. The size must equal the manifest's `size` (also the
    `Content-Length`, and no more bytes than that are taken) and the SHA-256, computed while downloading with Windows'
    own BCrypt (`windows` crate feature `Win32_Security_Cryptography`, no new dependency), must equal the manifest's
    `sha256`. Any mismatch deletes the file and reports an error. A second 立即更新 while one runs does nothing.
    No cancel button (not needed for a 2–5 MB file).
  - **Save first, then install.** Once the file is verified the app quits the same way as 退出 and 重启: it marks the
    quit, keeps the window's place, asks the page to save what it still holds back (`flush::then_after_flush`, the
    page answers or 1.5 s pass), and only inside that callback starts the installer, then exits. If the installer
    cannot be started, the quit is called off, the file is deleted, and the page shows the error; the app stays open.
  - **Installer switches, from Tauri's NSIS template** (tauri-bundler 2.10.1, which `@tauri-apps/cli` 2.12.1 uses,
    `src/bundle/windows/nsis/installer.nsi`): started detached as `<installer> /P /R /UPDATE`.
    - `/P` passive: every page is skipped (`SkipIfPassive`), the reinstall question is answered without showing it,
      only the small progress window is shown and it closes itself (`SetAutoClose true`).
    - `/R` restart: in `.onInstSuccess`, only for passive or silent installs, it runs
      `nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe"`, so the new version opens by itself.
    - `/UPDATE`: `PageLeaveReinstall` goes straight to installing over the old files ("In update mode, always proceeds
      without uninstalling"), so the old uninstaller never runs and the launch-at-login entry
      (`HKCU\…\Run\<productName>`, removed only "when not updating") is kept; the WebView2 download is skipped too.
    - If the app were still running, `CheckIfAppIsRunning` closes it without asking in passive mode
      (`RmForceShutdown`); by then the page has saved, and normally the app has already exited.
    - The installer is per-user (`installMode: currentUser` → `RequestExecutionLevel user`), so no administrator
      prompt. It installs into the folder of the earlier install (`RestorePreviousInstallLocation`) when the product
      name matches. The data lives under the identifier `com.clipbox.tauri` (D-044) and is never touched; the data
      deletion in the uninstaller only runs on a real uninstall with its box ticked, never with `/UPDATE`.
- Who gets updates: every Windows app that already has this code, whenever the coordinator deploys a newer installer
  and `latest.json` to the website (D-045). Apps installed before this change still need one manual install.
  Deploying to the website is therefore a release to everyone who has the app.
- Integrity: https + host check + exact size + SHA-256 from the manifest. The manifest and the installer come from the
  same site, so this protects against broken or swapped downloads in transit, not against someone who controls the
  site. Installers stay unsigned (D-013); a file the app writes itself carries no "downloaded from the internet" mark,
  so Windows does not show its warning when it is started this way.
- Consequences: a product rename changes the install folder and the 「应用和功能」 entry (D-044), so the first automatic
  update across a rename installs the new name beside the old one (same data), and launch at login stays with the old
  one until the old app is uninstalled. Avoid renaming between releases, or add an installer hook that removes the old
  install first. A deploy whose `latest.json` and installer disagree makes every update fail with 「文件不完整」 until it
  is fixed; the build writes both from the same file.
- Status: Accepted (owner request 2026-10-13).
