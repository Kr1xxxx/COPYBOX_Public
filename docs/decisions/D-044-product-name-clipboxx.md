### D-044 The product is called Clipboxx (复制盒); internal names stay "clipbox" (2026-10-13)
- Context: the owner renamed the product: 「产品名字改成 Clipboxx，设置打开的首页顶部就显示产品名字和中文产品名 复制盒」.
- Decision (owner, 2026-10-13):
  - **Everything a person reads says Clipboxx**: settings rows (数据位置, 关闭按钮说明, 关于 「Clipboxx v…」 and the copied
    version info), backup notes and error messages, the startup/loading screen, the desktop window title, the tray tooltip
    and 「打开 Clipboxx」, the Chinese errors the shell returns to the `clipbox` command, the command's own messages, the page
    `<title>` fallback, the web preview header, the README.
  - **The first settings page (外观) opens with 「Clipboxx」 and 「复制盒」 at its top** (the name in the `.section-head h1`
    serif style, 复制盒 muted beside it). It is not shown on the other pages or while searching settings.
  - **Installed app name**: `productName` in `src-tauri/tauri.conf.json` is `Clipboxx`. That names the Windows installer,
    the install folder (`%LOCALAPPDATA%\Clipboxx`), the Start menu shortcut, the 「应用和功能」 entry and the launch-at-login
    entry (`HKCU\…\Run\Clipboxx`), and on the Mac `Clipboxx.app` with `CFBundleName`/`CFBundleDisplayName` Clipboxx and
    the LaunchAgent `~/Library/LaunchAgents/Clipboxx.plist`.
- Deliberately unchanged, and why:
  - The bundle `identifier` `com.clipbox.tauri`: the app data folder, the WebView2/WebKit storage that holds the encrypted
    vault, the single-instance lock and the AI key in the OS credential store are all keyed by it. Changing it would make
    the new app start empty.
  - Storage keys (`clipbox.*`), IndexedDB names, file formats (`clipbox-data-move`, `clipbox-auto-backup`,
    `clipbox-auto-YYYY-MM-DD.json`): changing them needs a migration and would make old backups unreadable.
  - The Cargo package and binary name `clipbox` (the exe stays `clipbox.exe`; Tauri 2 no longer renames it to productName),
    the `clipbox` command, the automation socket `~/Library/Application Support/Clipbox/automation.sock` (the command and the
    app must agree on it), code identifiers (`ClipboxDesktop`, `window.clipboxDesktop`), the package and repository names.
  - Comments and older decisions and logs keep the old name as history.
- Consequence: a test build installed over the old one installs beside it as a second app (the installer looks for its
  own name). Both share the same data. Uninstall the old 「Clipbox」 once, **without** ticking 「删除应用数据」 (that box
  deletes the shared `com.clipbox.tauri` folders). Launch at login has to be switched on again in Clipboxx.
