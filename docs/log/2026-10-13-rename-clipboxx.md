# Product name Clipboxx (复制盒)

- Date: 2026-10-13 · Thread/agent: worker W9 (rename)
- What changed: every user-visible "Clipbox" outside app/page.tsx is now "Clipboxx" (settings rows, backup notes and errors, window title, tray, CLI messages, page title fallback, web preview header, README), productName in tauri.conf.json is Clipboxx (release file names and the Windows smoke test follow), and the first settings page opens with 「Clipboxx 复制盒」 at its top. Identifier, storage keys, file formats, exe name, CLI command and socket path stay "clipbox" (D-044).
- User-visible change: 产品名改成 Clipboxx；打开设置，最上面显示「Clipboxx 复制盒」
- Not done / risks: three strings in app/page.tsx (startup error, loading screen, invalid-backup alert) are left for the coordinator. The installed app gets a new name, so the next test build installs beside the old Clipbox: uninstall the old one once without ticking 「删除应用数据」, and switch launch at login on again.
- Next step: run the Windows smoke test and a Mac build with the new name.
