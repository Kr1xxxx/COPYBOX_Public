# Test builds carry their version; the website advertises only that (D-048)

- Date: 2026-10-14 · Thread/agent: coordinator (owner picked items 1 and 2 of the update-push review)
- What changed: `.github/workflows/tauri.yml` writes `release-version.json` ({ version, preview, ref, commit }) next to the installers and publishes test builds only from `main` (a dispatch on another branch keeps the installers as artifacts and warns). `tools/website/build.mjs` reads that file from the newest `tauri-test-N` release and uses its version for `download/latest.json`, the pages and the changelog notes; a release without it, or built from another branch, stops the build. `--installer` takes a new `--installer-version`. Tests in `tests/website-build.test.mjs`. No app code changed.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: the newest release today (tauri-test-119, app 1.67.0) has no version file, so the next website deploy first needs a new test build published from `main` with this workflow. Not run against GitHub from here (the container cannot reach api.github.com); the parsing and the choice of release are unit-tested.
- Next step: merge, publish a test build from `main`, then build and deploy the website from a session with the Cloudflare token.
