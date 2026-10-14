### D-048 Test builds carry their own version and come from main only (2026-10-14)
- Context: the website (D-045) writes `download/latest.json`, which the Windows app reads to offer updates (D-047). Its
  `version` came from the checkout's `tools/preview/VERSION` at website-build time, while the installer it served was
  the newest `tauri-test-N` release, built earlier from whatever `main` and `VERSION` were then. The two drift apart
  as soon as a preview version merges before a new test build: on 2026-10-14 `main` was 1.69 while the newest release
  carried 1.67.0. A deploy in that state tells every Windows copy 「有新版本 1.69」, 立即更新 installs 1.67.0 again, and
  after the restart the banner is back. Besides, any branch could publish a test build, and the website would have
  served it to staff as the newest one.
- Decision (owner, 2026-10-14, items 1 and 2 of the review of the update push):
  - The Tauri workflow puts `release-version.json` next to the installers in every test release:
    `{ version, preview, ref, commit }`, where `version` is `package.json` after `sync-version` (the number inside the
    installer), `preview` is `tools/preview/VERSION`, `ref` the branch and `commit` the sha.
  - Test builds are published only from `main`: a dispatch with 「publish」 on any other branch builds, keeps the
    installers as run artifacts, and prints a warning instead of a release.
  - The website build (`tools/website/build.mjs`) takes the advertised version, the number on the pages and the
    changelog notes from that file, never from its own checkout. A release without the file, a file without an app
    version, or one with `ref` other than `main` stops the build with a clear message. A local installer
    (`--installer`) must come with `--installer-version`; without it the build falls back to the checkout's number
    and warns, because nobody can check a local file.
- Consequences: after this change the next website deploy needs a fresh test build from `main` (older releases carry
  no version file). The site may be deployed from a newer checkout than the installer; the pages then show the
  installer's version and a warning is printed. `latest.json` can no longer name a version that is not inside the
  installer, so the update banner cannot loop.
- Status: Accepted (owner: 「1 没问题 2 也可以」).
