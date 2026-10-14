# Agent notes (single-agent mode)

Long-lived notes for the one agent that now works on Clipbox alone (no coordinator, no threads, no project memory).
Update this file at the end of every session. No keys, passwords or customer data here.

## Owner and how to talk to him

- Owner: Kris (GitHub `Kr1xxxx`). Reply in short, spoken Chinese, conclusion first, no code, no jargon, no time estimates.
  He does not read GitHub or code; he only sees the test builds and your messages.
- One line per new web preview: version + what changed + link. Otherwise one summary when everything is done or waiting.
- After each batch of merges, tell him what merged. When asked, say honestly what is merged and what is not pushed.
- At a fork, pick the recommended option, say which, keep going. A real decision: one question, one option per line,
  mark the recommended one.
- "Anything worth improving?": numbered list, problems first, then improvements, mark recommendations, wait for numbers.

## Merging and releasing

- Merge rules live in AGENTS.md "Merging" (D-041): green PRs are merged by the agent; only high-risk PRs (data
  could be lost, corrupted or locked; staff releases; irreversible steps) wait for Kris to write 合并.
- Web preview: bundle two preview versions per PR to GitHub (earlier for urgent fixes or when he asks).
- After every merged PR that changes the app, run the `Tauri build` workflow on `main` with `publish_test_build`
  (a `tauri-test-N` pre-release on GitHub Releases). Do not send him the link unless he asks. Staff only get it once
  the website is deployed again (`npm run website:build && npm run website:deploy` from a session with the
  Cloudflare token, D-047); the site takes the version from the release's `release-version.json`, so the test build
  must come from `main` (D-048; a dispatch on another branch publishes nothing).
- Never offer or push a staff release; he dropped it. Do not start "snippets with images" (on hold).

## Web preview

- The old preview link (claude.ai/artifact/8KDd4JegPkmWtWbtuRZNWS) is not reachable from this agent's account.
  Publish `dist-preview/` (see `tools/preview/README.md`) as a new artifact, tell Kris the new link once, then keep
  republishing to that same link.
- Preview link: https://claude.ai/artifact/3z3pHry2u3e5iBqKwrZMss (republish to this same link; it was v1.64 on 2026-10-13).
- App version = `1.<preview number>.0`; the only source is `tools/preview/VERSION`.

## Sub-agents

- Work goes to sub-agents (worker, own worktree, Opus at medium effort; CLAUDE.md). The main session writes the
  prompt, reviews the diff, runs all checks, then opens and merges the PR. Two workers never edit the same file at once.

## UI rules

- Use the `make-interfaces-feel-better` skill for UI work; animations from github.com/kuratlielia/arc-library.
- Never move elements or change layout on your own; ask first. Obvious typos: just fix.
- No "AI look": no English caps labels, badges or filler subtitles; Chinese only (`tests/no-english-labels.test.mjs`).
- Fixed layout: section switch order 话术 | 图片 | 账号 (2026-10-13); 常用 highlight block right of 编辑; header 收起 left of 选择 (话术, 图片, 账号); 回收站 at the
  bottom of the sidebar above 设置 (话术, 账号).
- Pinned values never enter 常用; right-click-pinned values stay first in the row, with a border.
- 话术 cards start collapsed and remember the last open card (`clipbox.open-card`); 收起 clears it; search opens the
  first result. Numbers show as `#001` (`#1000` above 999); `#14`, `#014`, `CB-0014` all match.
- Keep the empty-state line 「内容用 AES-256 加密，只保存在这台设备上」 until Kris says otherwise.

## Status (2026-10-13)

- `main` and the preview are v1.64 (#107 Tauri reliability fixes, #109 话术 list: no jump on starring, header shadow
  + right-side scroll bar, 收起 on the open card; #110 preview bump). A `tauri-test-N` build from main was started.
- Kris said 照做 to a nine-item review (2026-10-13): fix exit-save gap, restore not queued, recovery code after a
  crash, auto-delete the pre-migration backup after a few unlocks (changes D-040), large-list speed, key re-derived
  on every save, toast timers, incremental image auto-backup + failure notice, capacity warning; rules unified (D-041).
  Items touching save / restore / keys wait for his 合并.
- Next after that: keep splitting `app/page.tsx` (~2120 lines) in small PRs; then the flaky image-folder drag e2e test.
- Known: one WebKit-only e2e failure (image grid copy-button keyboard focus), pre-existing.
- Windows smoke test (`tests/windows-smoke/`, #97) runs on windows-latest; keep it. It cannot test drag feel,
  right-click feel or real TinyPNG.
- TinyPNG (D-037): two built-in keys live only in Kris's chat; never write them anywhere. Ask him if needed.

## Server (another agent builds it)

- Spec: `server-api.md` (not in the repo; ask Kris). Client already has shared-snippet GET, update check GET and
  account reset POST, with empty URLs hard-coded (`DEFAULT_UPDATE_URL`, `RESET_SERVER_URL`).
- When Kris says the server is ready: wire the URLs, then build leaderboard upload + staff name (D-034).
- Open decisions for Kris: reset email sends a code or a link; whether email verification may unlock the local
  account lock (with D-040 encryption the server cannot recover data, only the recovery code can).

## Waiting on Kris

- Real-machine try of drag, right-click menu and real image compression.
- Server decisions and deployment; shared-snippet URL; AI provider; GitHub repo description text.
