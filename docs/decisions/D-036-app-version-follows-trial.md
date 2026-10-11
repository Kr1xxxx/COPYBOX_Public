# D-036: the app version follows the trial version

- Date: 2026-10-11
- Context: the Mac app showed "v0.2.24" while the web trial was at v1.43; testers asked why two numbers.
- Decision: the app version is the trial version plus `.0` (trial 1.43 → app 1.43.0). Its one source is
  `tools/preview/VERSION`, which only the preview publisher (【話術】) changes. `scripts/sync-version.mjs` copies it into
  `package.json`, `package-lock.json`, `src-tauri/Cargo.toml` and `Cargo.lock`; `npm run tauri:build` and the Tauri CI
  workflow run it before building, so an installer always carries the current number. The committed files may lag until
  the next build; a test only checks that they agree with each other.
- Consequences: staff update checks compare the new numbers (1.x is higher than 0.2.x, so nobody is held back). A patch
  release between two trial versions would need a different rule (the script refuses anything but `major.minor`).
- Status: Accepted (owner chose 「同步」 on the version question).
