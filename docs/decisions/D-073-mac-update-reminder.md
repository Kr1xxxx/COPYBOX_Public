### D-073 The Mac is told about a new version and downloads it in the browser (2026-10-16)
- Context (owner, 2026-10-16: 「Mac为什么没有自动更新」, then picked 「Mac 更新提醒」 on the packaging thread's card): the Windows
  app installs updates itself (D-047), but the Mac app never even looked (`DEFAULT_UPDATE_URL` was empty off Windows).
  The Mac app is unsigned (D-013), so the app cannot replace itself without macOS stopping it.
- Decision:
  - **The Mac checks too**, on launch and once a day like Windows, but reads its own file: `latest-mac.json` in the
    same folder as Windows' `latest.json` (`UPDATE_FOLDER` + `MANIFEST_NAME` in `src-tauri/src/update.rs`). Same shape
    `{ version, notes, url }` (size and sha256 may be there, they are not used); `url` is the zipped app
    (`Copyboxx-macOS-arm64.zip`) and must be https on `copyboxx.com` like every update link. Two files, so the Mac and
    Windows builds can be published on different days. Linux still never looks.
  - **The staff build changes only `UPDATE_FOLDER`** to its private folder (`download/private-<token>/`); both
    platforms follow it, so the Mac link stays on the private path and never points at the public download page.
  - **The banner** is the same 「有新版本 X」 as Windows with 「下载」 and 「稍后」. 「下载」 opens the link in the browser and
    the banner turns into 「正在浏览器里下载新版本 X」 with how to finish: open it, drag Copyboxx into 「应用程序」 to replace
    the old one (the content stays), and if macOS stops it, 「系统设置 › 隐私与安全性」 → 「仍要打开」. 「知道了」 hides it until
    the app opens again, so the reminder comes back until the new version is installed; 「稍后」 still hides that
    version for good. A Windows shell that can only 「下载」 gets the same state with its own hint.
- Who gets it: Mac apps built with this code. A Mac app built before it has to be installed by hand once.
- Status: Accepted (owner choice 2026-10-16).
