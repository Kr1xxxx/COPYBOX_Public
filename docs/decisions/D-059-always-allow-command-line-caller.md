### D-059 「始终允许」 a program that reads a 秘密 over the command line (2026-10-15)
- Context (owner, 2026-10-15): the 「允许读取秘密吗？」 question comes up every time Codex or a similar tool runs
  `clipbox secret-get`; the owner asked for an option that keeps allowing that caller, the way Codex itself offers
  "always allow".
- Decision: the question gets a third button 「始终允许」 next to 拒绝 / 允许. The desktop shell works out who asked:
  the socket gives the process id of the `clipbox` command (kernel peer credentials), and the shell walks up its parents
  past shells and launchers (sh, zsh, bash, env, login, sandbox-exec, …) to the first real program
  (`src-tauri/src/caller.rs`); a copy of Copyboxx itself that relays for another tool (`Copyboxx --mcp`, D-060) is passed through as well, so Copyboxx is never the one remembered. That program is remembered by the full path of its executable file (from the system,
  not from what the program calls itself), and for node / python / ruby / perl / bun / deno also by the script it runs,
  so another script on the same runtime is still asked. A remembered program reads or checks one 秘密 without the
  question and the window shows 「已自动允许「…」读取秘密」. Exporting all 秘密 (`secret-export`) is always asked and
  never offers 「始终允许」. A locked 账号 page still refuses everything. When the shell cannot tell who asked, only
  拒绝 / 允许 are offered.
- The list lives in `clipbox.automation-trusted.v1` (localStorage, plain JSON list of { name, id, addedAt }), is shown in
  设置 → 数据 → 始终允许的程序 with 取消 for each entry, and is a device-only key (`LOCAL_ONLY_KEYS`): never in a backup, and a
  restore starts with an empty list, because the same path on another computer may be another program.
- Limits (said in 设置): this is a convenience, not a lock. Any program running as the same user could start the
  remembered program itself, replace its file if it sits in a user-writable folder (Homebrew, npm), or edit the list.
  The question was never stronger than that against such a program; the toast keeps every automatic read visible.
- Status: accepted (owner's request, 2026-10-15); merges only on the owner's 「合并」 because it relaxes a protection
  on secrets.
