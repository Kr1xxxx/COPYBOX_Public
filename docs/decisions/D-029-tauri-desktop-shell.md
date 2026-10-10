### D-029 Move the desktop app from Electron to Tauri 2 (2026-10-10)
- Context (owner, 2026-10-10): the app takes 100–200 MB of memory and an installer of about 100 MB, which is too much for
  something this small. Native apps per platform were judged too much work; Tauri keeps one UI code base.
- Decision: replace the Electron shell (`desktop/`) with Tauri 2 (`src-tauri/`) in steps, each its own PR. The UI in `app/`
  is not rewritten; it is saved as a static page (`scripts/tauri-frontend.mjs`) and loaded by the shell, which gives it the same
  `window.clipboxDesktop` object (`src-tauri/bridge.js`). The Electron app keeps shipping until the Tauri build reaches parity.
  Plan: `/mnt/project-files/tauri/migration-plan.md` (8 steps).
- Consequences: Windows uses WebView2, macOS uses WebKit, so the page runs in different engines than today. Their browser
  storage is separate from Electron's, so existing encrypted data needs an export/import (step 6, high-risk: waits for the
  owner's 合并). Releasing the Tauri build to employees and deleting Electron also wait for the owner.
- Status: Accepted (owner: "那就 tauri 吧").
