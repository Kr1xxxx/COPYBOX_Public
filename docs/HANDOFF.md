# Handoff board

> The single "where are we now". Feature PRs do **not** edit this file (parallel PRs would conflict): leave a note in
> `docs/log/` instead. Only the coordinator updates the status below. Keep this file under 100 lines.

## Status (2026-10-14)

- Repository: https://github.com/Kr1xxxx/Clipbox (public). Product name **Copyboxx 复制盒** (D-046); internal names stay
  `clipbox`. Start from `main`; all work goes through Claude in the claude.ai project 「修改 COPYBOXX」.
- Checks on `main`: `npm run lint`, `npm run typecheck`, `npm test` (~570 unit), `npm run test:e2e` (~290) all green.
- Merging: D-041 (replaces D-011). Agents merge green PRs themselves; only high-risk PRs (user data, storage or
  encryption format, releases, anything irreversible) wait for the owner's 合并.
- Workflow (`CLAUDE.md`): coordinator on Opus high effort; workers Opus medium (`.claude/agents/worker.md`).
- Decisions: `docs/DECISIONS.md` table holds D-001…D-024; **D-025…D-052 are files in `docs/decisions/`** (the table is
  not extended, by rule). Next free number: check that folder and the open PRs.
- `app/page.tsx` is ~2330 lines; keep splitting it. Verification: `docs/features.json` (browser only, D-014).

## Web preview (网页测试版)

A claude.ai Artifact, not Cloudflare: https://claude.ai/artifact/3z3pHry2u3e5iBqKwrZMss. Only the publisher bumps
`tools/preview/VERSION` (+0.01) and `changelog.json` (`tools/preview/README.md`). The owner asked on 2026-10-14 to stop
showing it publicly: copyboxx.com no longer hosts it (PR #165); the Artifact stays for the owner.

| Version | PR | What changed |
| --- | --- | --- |
| v1.71 | #146–#149 | 账号页 slide to unlock (D-051); guide text; C-mark app icon (D-050); new wordmark |
| v1.72 | #150 | 「补齐 10 张测试图」 works again in the preview |
| v1.73 | #152 | Slide-unlock knob stays on its track |
| v1.74 | #153 | Settings home: version + date, 「账号与同步」 card |
| v1.75 | #155 | Settings logo 40 px; first menu item 外观 → 概览 |
| v1.76 | #157, #160 | 企业同步码 (D-052): sync on start and every 30 min, 「立即同步」 |
| v1.77 | #158, #161 | Two own TinyPNG keys; second takes over for the month when the first is used up or wrong |
| v1.78 | — | Skipped (never published) |
| v1.79 | #162, #163 | First run: empty 话术 list leads with 「输入企业同步码」; the guide mentions the code |
| v1.80–v1.81 | #164 | Advisor items 11 and 13 (mini window copies the first block; staff-irrelevant settings hidden) |

## Website and installer (copyboxx.com)

Cloudflare Worker `copyboxx-site`; docs `tools/website/README.md`. Only sessions in the Cloudflare environment can
deploy; production deploys need the owner's own fresh 「部署」. Live: installer 1.71.0, new wordmark and app icon
(PR #151, #154), copy update PR #159 (「断网也能照常复制」, 企业同步码, auto-update wording, privacy page lists the
update check and sync download; showcase pictures white + purple with made-up content).
话术 sync endpoint (PR #156): `GET https://copyboxx.com/sync/<code>/snippets.json`; publish with
`npm run sync:publish` (README 「话术同步」). Real sync codes never go in the repo or on the public site.

Image compression (D-055, 2026-10-15): only keys each person fills in 设置; no built-in key, no website proxy (owner
dropped the proxy before merge). The owner revoked the old TinyPNG keys.

## Reviews of 2026-10-14 (outside the repo, in the project's shared files)

- Audit: `audit/2026-10-14-audit.md`. Severe: S1 auto-update trusts copyboxx.com only, installer unsigned (update
  signing in progress, `src-tauri/src/update.rs`); S2 no forced HTTPS / HSTS (fixed in PR #165: HTTPS only with HSTS).
- Advisor list: `advice/2026-10-14-improvements.md` (29 items). Owner picked 1, 2, 3, 10 (done), 11 (mini window copies
  the first block of a 话术 with unfilled 【变量】) and 13 (hide settings staff do not need) — 11 and 13 in v1.80 (PR #164).
- Content sync plan: `plans/content-sync-plan.md`. Phase 1 done (D-052); phase 2 (team code) and 3 (accounts without
  passwords) not started. No admin backend: Claude publishes on the owner's 「发布话术」 after showing a diff.

## Security hardening (in progress, 2026-10-14)

- Done in the hardening PR: backup import refuses PBKDF2 counts outside 100 000…5 000 000 and malformed salt / IV
  (`app/pbkdf2-limits.ts`); every key derivation caps the count, so a tampered record cannot freeze the app.
- Done in the same PR: Mac command line — 秘密 commands (`secret-get`, `secret-verify`, `secret-export`) wait for 允许
  in the app (45 s, then refused) and are refused while the 账号 page is locked.
- Waiting on the owner: move the device key into the OS credential store (would supersede D-015). High risk.
- Other threads: TinyPNG built-in keys out of the public repo (D-037); preview passphrase `comely` out of
  `tools/website/wrangler.jsonc`; update signing (S1).

## Waiting on the owner

- Device key in the OS credential store: Windows only, both, or keep D-015.
- Real-device checks never done (D-014): slide unlock, settings home, 企业同步码, first-run onboarding, two TinyPNG
  keys, the 秘密 允许 question on a Mac.
- Before auto-update works on a machine, the owner installs the new Copyboxx by hand once (quit from the tray,
  uninstall without 「删除应用程序数据」).

## Known risks

- The vault and its device key are stored together (D-015): a copied data folder can be decrypted, except 账号 data
  under a 账号页密码 (D-040).
- Auto-update (D-047) checks a sha256 from the same site as the installer; unsigned (D-013) until signing lands.
- main-flows collapse e2e test is flaky (fallback timer); CI retries once and can hide it.
- Many unit tests assert on source text and break on refactors; `tests/e2e/` is the reference for behaviour.
- The task board (rows 1–27) was frozen on 2026-10-09 and is history: see git history of this file.
