### D-046 The product is called Copyboxx (复制盒); Chinese installer with brand pictures and a new icon (2026-10-13)
- Context: the owner renamed the product again: 「名字改成COPYBOXX」, and 「windows 版本安装包改名,图标别忘了更新,安装包改中文,
  安装时有个什么屏幕截图还是什么的,没必要就去掉」.
- Decision (owner, 2026-10-13):
  - **Name**: everything a person reads says **Copyboxx** (spelled like this, as Clipboxx was; Chinese name 复制盒
    unchanged). It replaces Clipboxx in every place D-044 lists (settings header, settings rows, 关于, backup notes and
    error messages, startup screen, window title, tray, the `clipbox` command's messages, page title fallback, web
    preview, README) and `productName` is `Copyboxx`, so the installer, install folder (`%LOCALAPPDATA%\Copyboxx`), Start
    menu, 「应用和功能」 entry (publisher now Copyboxx too) and the Mac `Copyboxx.app` carry the new name.
  - **Everything D-044 keeps unchanged still holds**: identifier `com.clipbox.tauri`, `clipbox.*` storage keys,
    IndexedDB names, file formats, the binary `clipbox.exe`, the `clipbox` command, the automation socket path and code
    identifiers. Older decisions, logs and changelog entries keep the old names as history.
  - **Release files**: `Copyboxx-Windows-setup.exe` and `Copyboxx-macOS-arm64.zip` (ASCII only; GitHub mangles Chinese
    asset names), release title 「Copyboxx 测试版 #N（测试用，不是正式版）」; tags stay `tauri-test-N`. The website serves
    the installer as `download/Copyboxx-Setup.exe` (D-045) and still picks the newest `tauri-test-N` asset ending in
    `-Windows-setup.exe`.
  - **Installer in Chinese**: NSIS `languages: ["SimpChinese"]`, no language picker. The uninstaller's box reads
    「删除应用程序数据」 (Tauri's own translation).
  - **No stock pictures in the installer**: the first and last page showed NSIS's default blue computer picture
    (`Wizard\win.bmp`) on the left; it is replaced by a plain brand picture (`src-tauri/icons/installer-sidebar.bmp`,
    164×314: the icon and 复制盒 on a light background). The installer and uninstaller icon (title bar, top-right of the
    inner pages, the setup file itself) was NSIS's stock disc; it is now the app icon. The bottom line read
    "Nullsoft Install System v3.x"; `bundle.copyright` 「Copyboxx 复制盒」 replaces it. The welcome page itself cannot be
    dropped through configuration (only with a custom NSIS template, which we do not keep), so it stays, now with the
    brand picture. No separate header picture: the inner pages show the app icon at the top right.
  - **Icon**: a dark tile holding a light box with two overlapping cards (copy), palette tile #262628, lavender
    #DCD6FF, accent #7B72B8, card #F8F7FF. Sources `src-tauri/icons/icon.svg` (plus pixel-fitted `icon-16.svg`,
    `icon-24.svg`); `node scripts/render-icons.mjs` writes `icon.png` (macOS style, transparent margin), `icon.ico`
    (16–256 px, tile without margin), `icon.icns` and the installer picture.
  - **Old launch-at-login entries** (Windows): every rename installs a new app beside the old one, and the old copy's
    `HKCU\…\Run\<old name>` entry would start the old app at login (the shared single-instance lock then only shows the
    old window). On startup the app removes the entries named Clipbox, Clipboxx or CLIP BOX whose program is the Tauri
    `clipbox.exe` with `--hidden`, and if one of them was on (not switched off in Task Manager) it switches launch at
    login on for itself through the autostart plugin. The Electron app's entry and the current name's entry are not
    touched (`src-tauri/src/old_autostart.rs`).
- Consequence: like D-044, a test build installs beside the previous one; uninstall the old 「Clipboxx」/「Clipbox」 once
  **without** ticking 「删除应用程序数据」 (it deletes the shared `com.clipbox.tauri` data). Launch at login moves over by
  itself once Copyboxx has run, but while the old copy is still open (tray) a launch of Copyboxx only brings up the
  old window, so quit the old one from its tray menu (退出) first. The installer that is on the website until the next
  deploy is still the old one.
- Status: Accepted (owner request 2026-10-13). Supersedes the name in D-044.
