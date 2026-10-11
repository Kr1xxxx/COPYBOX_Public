# Electron → Tauri parity list

Status of every `desktop/` capability in the Tauri shell (`src-tauri/`). "Linux" = run on the Linux test box (WebKitGTK,
Xvfb + openbox); "Windows" and "Mac" mean real hardware and are **not done yet** for any row. Update a row only after
walking through it. A test (`tests/tauri-shell.test.mjs`) checks that the bridge offers every method the page expects and
that every command it calls is registered.

| Capability | Electron | Tauri | Checked on |
| --- | --- | --- | --- |
| Page loaded from a file, no server process | yes | step 1 | Linux |
| Copy text / copy image | yes | step 1 | Linux (text); image not checked |
| Window size and position remembered, kept on screen | yes | step 2 | Linux |
| Mini window (small, on top, fixed size, hides after copy) | yes | steps 2–3 | Linux (size and return); hide-after-copy by unit test |
| Mac overlay title bar | yes | step 1 | not checked |
| Theme (system / light / dark) | yes | step 2 | not checked |
| 30 s idle: calmer animation | yes | step 2 | Linux |
| Tray icon and menu, click to show | yes | step 3 | **not checked (no tray in the test box)** |
| Close button behaviour (tray / taskbar / quit) | yes | step 3 | unit test of the decision only |
| Single instance | yes | step 3 | **not checked** |
| Launch at login, silent `--hidden` start | yes | step 3 | **not checked** |
| Open data folder | yes | step 3 | not checked |
| AI key in the OS credential store, AI requests from Rust | yes | step 4 | unit tests; real store not checked |
| Update reminder | yes | step 4 | unit tests |
| Restart | yes | step 4 | not checked |
| Company 话术 library fetch (plain GET, 5 MB, 15 s) | yes | step 7 (was missing) | unit test of the address rules |
| Website icon for 保险箱 entries (own site only, public addresses, https) | yes | step 7 (added after main moved) | unit tests of the address and image rules; network part not run |
| Build time shown in 设置→关于 | yes | step 7 (added after main moved) | unit test of the date |
| Mac command line (socket + `clipbox`) | yes | step 5 | Linux (status, add, list, get) |
| Old data move (export in Electron, import in Tauri) | – | step 6 | Chromium only |
| Content security policy | none | step 7: page may load only its own files | Linux (page loads and answers commands) |
| One version number | package.json | step 7: Tauri reads package.json; Cargo.toml checked by test | test |
| Installer | NSIS / dmg | NSIS (current user) + .app from CI | CI only; not run on a real machine |

Not carried over on purpose: the local page server. Step 8 (D-034) moved `clipbox-cli.cjs` to `tools/` and removed
Electron (`desktop/`, the electron packages, the Electron-only tests). Rust tests in `src-tauri/` now cover what those tests checked.

Unsigned installers: Windows will show the SmartScreen warning as it does for the Electron installer today.
