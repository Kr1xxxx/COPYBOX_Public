# Tauri step 4: AI key, AI requests, update reminder, restart

- Date: 2026-10-10 · Thread/agent: 【工程】Tauri 迁移
- What changed: the Tauri shell now keeps the AI key in the operating system's credential store (Windows Credential Manager / macOS Keychain; `src-tauri/src/ai.rs`, new crate `keyring`) and sends AI requests itself (new crate `reqwest`, rustls), with the same address rules and messages as `desktop/ai.cjs`. The update reminder (`src-tauri/src/update.rs`) follows `desktop/update-check.cjs` (off until `DEFAULT_UPDATE_URL` is set; `CLIPBOX_UPDATE_URL` overrides it). The page's restart call restarts the app. Version, address and notes rules are unit-tested.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: the key store and the HTTP calls were built and unit-tested for their rules only; saving a key and calling a real AI address need a real Windows / Mac. The key is stored in the credential store, not in an encrypted file, so an AI key saved in the Electron app is not carried over: the person re-enters it (one time, at the data move in step 6). This removes the plaintext-key problem the acceptance review raised for the Tauri build.
- Next step: step 5 (Mac command line).
