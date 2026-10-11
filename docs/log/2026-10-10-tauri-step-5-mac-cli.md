# Tauri step 5: command line door (macOS)

- Date: 2026-10-10 · Thread/agent: 【工程】Tauri 迁移
- What changed: the Tauri shell now runs the same command line door as the Electron app (`src-tauri/src/automation.rs`): a private unix socket at `~/Library/Application Support/Clipbox/automation.sock` takes one JSON command, hands it to the page and returns the page's answer (same errors, 1 MB limit, 10 s timeout). On start it also installs the existing `clipbox` command to `~/.local/bin/clipbox` (the script is embedded from `desktop/clipbox-cli.cjs`; step 8 moves it). Windows does not start it, as before.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: ran with the real `clipbox` script on Linux (status, add, list, get all worked through the page); not on a Mac. The command still needs Node on the computer, as today; rewriting it as a small native program is optional and not done. If the Electron app is running at the same time, the second app finds the socket busy and starts without the command line.
- Next step: step 6 (old data move; high-risk, waits for 合并).
