# Tauri: no browser menu or browser keys

- Date: 2026-10-12 · Thread/agent: 【工程】Tauri 迁移
- What changed: Right-clicking the page (for example an image folder) showed the WebView2 browser menu with 刷新 Ctrl+R and 打印 Ctrl+P, against D-005. The bridge now cancels that menu everywhere except inside text fields (where the system menu is how people paste with the mouse), and cancels the browser keys F5, Ctrl+R, Ctrl+P, Ctrl+S, Ctrl+U, Ctrl+G and the developer-tools keys. Our own right-click menus are unaffected because they only react to the same event and do not need its default.
- User-visible change (plain Chinese, for the preview changelog): 无(网页测试版本来就没有这个问题,只影响桌面版)
- Not done / risks: Checked with a script only; the real Windows menu and Mac need a look by hand.
- Next step: Lock right-clicks an image folder in the new test build.
