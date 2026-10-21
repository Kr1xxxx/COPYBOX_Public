# Mini window without boxes, 公司 / 我的 filter icon, search options row

- Date: 2026-10-20 · Thread/agent: 迷你窗口 · 「公司 / 我的」筛选
- What changed: mini window tabs are plain text with an underline (no boxes); 公司 / 我的 sit behind a filter icon inside the mini search box; six folders show without sliding; on Windows the mini window drops the system title bar and gets its own ✕ (bridge `closeWindow`, capability `core:window:allow-close`, `set_decorations` in window_mode.rs). In the full window, 中文拼音 / 英文单词 and 此目录 / 全部目录 moved to their own row while searching, so they no longer wrap. D-106.
- User-visible change (plain Chinese, for the preview changelog): 迷你窗口去掉按钮框，标签都是文字，选中的标红加下划线；「公司 / 我的」收进搜索框右边的筛选图标；目录一排直接显示 6 个；Windows 迷你窗口去掉系统标题栏，右上角有关闭按钮；搜索时「中文拼音 / 英文单词」单独一行，不再挤成两行。
- Not done / risks: the Windows frameless mini window (dragging, ✕, edge snap) was not tried on a real PC; only the Rust code was checked. Browser tests: the changed ones in main-flows / mini-tabs / folder-short-names ran; the full e2e suite did not.
- Next step: on Windows, open the mini window, drag it by the top row, press ✕ (goes to the tray), and check 贴边 still folds.
