# 「始终允许」 for command line 秘密 reads

- Date: 2026-10-15 · Thread/agent: 功能 · 秘密讀取始終允許
- What changed: The 「允许读取秘密吗？」 question has a third button 「始终允许」. The Mac/Linux shell now sends who asked
  (`src-tauri/src/caller.rs`: socket peer pid, walked up past shells to the first real program, remembered by its
  executable path plus script for node/python). A remembered program reads or checks one 秘密 without asking (with a
  toast); exporting all 秘密 always asks. The list is in 设置 → 数据 → 始终允许的程序 with 取消, stored in
  `clipbox.automation-trusted.v1`, device-only (not in backups). D-059. Touches app/page.tsx only in the automation
  command handler (`onAutomationCommand`).
- User-visible change (plain Chinese, for the preview changelog): 命令行读取秘密时可以选「始终允许」，同一个程序（比如 codex）以后不再询问；可在 设置 → 数据 → 始终允许的程序 里取消。
- Not done / risks: Not tried on a real Mac yet: how Codex shows up there (its file path, whether its sandbox lets it
  reach the socket) needs one walk-through. The Mac code (`proc_pidpath`) only compiles in CI with the `mac-check` label.
- Next step: The parallel thread for a Codex connection on Windows can reuse `ask(action, caller)` and the same list.
