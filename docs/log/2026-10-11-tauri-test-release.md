# Tauri: publish a test build to GitHub on request

- Date: 2026-10-11 · Thread/agent: 【工程】Tauri 迁移
- What changed: the Tauri build workflow, when started by hand with `publish_test_build` on, also publishes the Windows installer and a zipped Mac app as a GitHub pre-release (`tauri-test-N`). It never runs on its own, and a pre-release is not what the app's update check offers (that reads its own manifest).
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: the installers are unsigned (SmartScreen / Gatekeeper warnings). The repository is public, so the release is public too. The Tauri app keeps its own data (different app id), so it can sit next to the Electron app.
- Next step: Lock gives testers the link; testers use the checklist.
