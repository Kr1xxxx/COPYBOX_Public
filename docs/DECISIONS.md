# Decision records

Decisions the owner has made. Ask the owner before changing one. When a decision changes, set the old entry's
status to "Superseded by D-xxx" and add a new entry — do not delete history.
Format follows lightweight architecture decision records (ADR): number, status, context, decision, consequences.
Statuses: Accepted / Superseded / Deprecated.

> New decisions are separate files in `docs/decisions/` (see its README), not rows here, so parallel PRs do not conflict.

| # | Decision | Status |
| --- | --- | --- |
| D-001 | Windows first | Accepted |
| D-002 | macOS ships Apple silicon (arm64) only | Accepted |
| D-003 | Second section: plain-text 备注 on Windows, 秘密 on macOS | Superseded by D-017 (Windows part) |
| D-004 | UI layout "H" | Accepted |
| D-005 | No keyboard shortcuts at all | Accepted |
| D-006 | No auto-clear clipboard; no command-line help in Settings | Accepted |
| D-007 | Snippet note field is 小提示, max 40 characters | Accepted |
| D-008 | AI uses an endpoint the user configures; prompts cannot be empty | Accepted |
| D-009 | Folder rules | Accepted |
| D-010 | Workflow: PRs only, the owner merges | Superseded by D-011 |
| D-011 | Small changes merge themselves; big ones wait for the owner's 合并 | Accepted |
| D-012 | Windows: the vault's device key is protected by OS encryption | Superseded by D-015 |
| D-013 | No code signing for now (internal tool); auto-update undecided | Accepted |
| D-014 | No real-device testing round before merging | Accepted |
| D-015 | Device-key protection removed for now | Superseded by D-053 (Windows) |
| D-016 | Backups stay local files; no cloud or email upload | Accepted |
| D-017 | 图片 section: replaces 备注 on Windows, added next to 秘密 on macOS | Accepted |
| D-018 | 图片 folders (目录) | Accepted |
| D-019 | 图片 shown as a 九宫格 (grid) by default | Accepted (columns changed by D-020) |
| D-020 | 图片 grid is 16宫格 (4 per row), whole picture in the thumbnail, 6% margin on frosted glass | Accepted |
| D-021 | Motion follows arc-library (components vendored into `app/arc/`, `motion` added) | Accepted |
| D-022 | Trash auto-cleanup defaults to 7 days for everyone | Accepted |
| D-023 | Version update reminder: tells, never installs; source address not chosen yet | Accepted |
| D-024 | 图片 thumbnails: small encrypted copies kept in their own database | Accepted |

## Index of `docs/decisions/` (D-025 onwards)

Kept up to date by the coordinator, not by feature PRs. Links are written `[D-NNN](…)` on purpose: the uniqueness test in
`tests/docs-structure.test.mjs` counts only plain `| D-NNN |` rows, so these do not clash with the files. D-054 (update
signing, PR #168) is listed once it merges.

| # | Decision | Status |
| --- | --- | --- |
| [D-025](decisions/D-025-thumbnails-not-encrypted.md) | 图片 thumbnails are stored unencrypted | Accepted |
| [D-026](decisions/D-026-shared-library.md) | Shared 话术 library: per-entry sync that never overwrites the employee's edits | Accepted |
| [D-027](decisions/D-027-hidden-totp-mac.md) | Hidden 验证码 (two-factor codes), Mac only | Accepted |
| [D-028](decisions/D-028-variable-pins-and-name-defaults.md) | Variable blocks: pinned values and Name defaults | Accepted |
| [D-029](decisions/D-029-tauri-desktop-shell.md) | Desktop app moves from Electron to Tauri 2 | Accepted |
| [D-030](decisions/D-030-vault-typed-items.md) | 保险箱: typed secret items, Mac only | Accepted |
| [D-031](decisions/D-031-vault-site-icons.md) | 保险箱 site icons, no live lookup | Accepted |
| [D-032](decisions/D-032-data-move-file.md) | Old data moves to the Tauri app through one encrypted file | Accepted |
| [D-033](decisions/D-033-image-trash.md) | 图片 have a 回收站 | Accepted |
| [D-034](decisions/D-034-electron-removed.md) | Electron removed; Tauri is the only desktop shell | Accepted |
| [D-035](decisions/D-035-standard-folders-sortable.md) | The standard 话术 folders can be sorted | Accepted |
| [D-036](decisions/D-036-app-version-follows-trial.md) | The app version follows the web preview version | Accepted |
| [D-037](decisions/D-037-tinypng-image-compression.md) | Pictures are compressed with TinyPNG, at most 100 a month | Accepted; keys: only each person's own (D-055) |
| [D-038](decisions/D-038-account-windows-and-lock.md) | Windows gets the 账号 page, with an opening password | Accepted; "password is only a door" superseded by D-040 |
| [D-039](decisions/D-039-auto-backup-in-data-folder.md) | Daily automatic backup in the data folder | Accepted |
| [D-040](decisions/D-040-account-password-encrypts-data.md) | The 账号 password really encrypts the 账号 data | Accepted |
| [D-041](decisions/D-041-agents-merge-green-prs.md) | Agents merge green PRs; only high-risk PRs wait for 合并 | Accepted |
| [D-042](decisions/D-042-premigration-copy-auto-delete.md) | Recovery code never lost unseen; pre-migration copy deletes itself | Accepted |
| [D-043](decisions/D-043-incremental-image-backups.md) | Automatic backups keep each picture once | Accepted |
| [D-044](decisions/D-044-product-name-clipboxx.md) | Product name Clipboxx (复制盒) | Superseded by D-046 |
| [D-045](decisions/D-045-website-copyboxx.md) | Public website at copyboxx.com | Accepted; site preview copy removed 2026-10-14 |
| [D-046](decisions/D-046-product-name-copyboxx.md) | Product name Copyboxx (复制盒), Chinese installer | Accepted; icon superseded by D-050 |
| [D-047](decisions/D-047-auto-update.md) | Windows updates itself (立即更新) | Accepted |
| [D-048](decisions/D-048-test-builds-carry-their-version.md) | Test builds carry their own version and come from main only | Accepted |
| [D-049](decisions/D-049-folder-short-names.md) | Own folders can have a short name for the mini window | Accepted |
| [D-050](decisions/D-050-app-icon-c-mark.md) | The app icon is the owner's C mark | Accepted |
| [D-051](decisions/D-051-account-slide-unlock.md) | The 账号 page is frosted until slid open | Accepted |
| [D-052](decisions/D-052-sync-codes.md) | Company content reaches staff by 同步码, published by an agent | Accepted |
| [D-053](decisions/D-053-device-key-windows-credential-manager.md) | Windows keeps the device key in Credential Manager | Accepted |
| [D-055](decisions/D-055-own-compression-keys.md) | Image compression uses only keys each person fills in; no built-in key, no website proxy | Accepted |

---

### D-001 Windows first (2026-10)
- Context: most users are on Windows.
- Decision: build features and visuals for Windows first; macOS gets the necessary adaptations only.
- Consequences: native Windows title bar, tray, NSIS installer. A feature is not done until verified on a real
  Windows machine (`docs/features.json`).

### D-002 macOS ships Apple silicon only (2026-10-08)
- Decision: `npm run desktop:pack` builds arm64 only — no Intel, no universal build.

### D-003 Second section (2026-10-08)
- Decision: on Windows it is called 备注 and is plain text — content shown directly, with no masking/hold-to-reveal,
  copy reference, "referenced by" field or split segments. On macOS it is called 秘密 and keeps those features.
- Consequences: code switches on `PLAIN_NOTES`; the stored data format is the same on both platforms.

### D-004 UI layout "H" (2026-10)
- Decision: 128px sidebar + search-first content panel; the selected entry expands in place; editing, filling
  variables and creating folders happen inline, without dialogs. Full window minimum 680×620; mini window fixed
  at 360×440, always on top. Hidden scrollbars, with a fade hint on long content. The list shows no summaries,
  abbreviations or copy times.
- Consequences: switching entries is animated — the old card folds away gradually and its border never flashes
  white (covered by an e2e test).

### D-005 No keyboard shortcuts at all (2026-10-08)
- Context: the owner asked twice to remove them.
- Decision: no shortcut hints, no Ctrl/⌘ combinations, no Alt+arrow sorting, no global hotkey. Arrow keys, Enter
  to copy and Esc inside the search box are ordinary input; they stay, but nothing advertises them.
- Consequences: the window is opened from the tray icon; reordering is by drag or the up/down buttons in Settings.

### D-006 No auto-clear clipboard; no command-line help (2026-10)
- Decision: neither platform clears the clipboard after copying. Settings shows no command-line or shortcut help
  (not on macOS either).

### D-007 小提示 (2026-10)
- Decision: the snippet's note field is called 小提示, at most 40 characters, so it does not clash with the Windows
  备注 section.

### D-008 AI endpoint (2026-10-08)
- Decision: AI 润色 (polish) and AI 整理 (tidy) sit next to the snippet content and can be undone. They use an
  endpoint the user enters in Settings (OpenAI-compatible chat/completions): URL, model, API key, polish prompt,
  tidy prompt. Empty prompts cannot be saved. Presets for common services and a "fetch models" button are offered.
  Without an endpoint the device's built-in model is used; without that, tidy falls back to rules and polish is
  unavailable.
- Consequences: the API key is encrypted by the OS, stored only on the device and never included in backups.
  Polishing or tidying sends the snippet text to the configured service.

### D-009 Folders (2026-10)
- Decision: the standard snippet folders (询盘接待, 产品样品, 报价成交, 定制生产, 客户跟进, 物流清关, 售后争议) are fixed —
  colour only. Other folders can be created, renamed, recoloured, deleted and drag-sorted in both the sidebar and
  Settings; Settings also has up/down buttons.

### D-010 Workflow (2026-10-09) — superseded by D-011
- Context: agents and developers all push with the owner's GitHub account, so GitHub cannot require an approval.
- Decision: never push to `main`; one task per PR; CI must be green; only the owner merges. Documentation is in
  English. Reports to the owner are in Chinese, in four parts: 做了什么 / 没做好的地方 / 需要你做的 / 建议下一步.
  Finish whatever can be finished.
- Consequences: "only the owner merges" is enforced by rules and branch protection, not by GitHub approvals.
  If people get their own accounts, require 1 approval.

### D-011 Merge policy (2026-10-08)
- Context: the owner works only through agents and never opens the GitHub website; waiting on every small fix is
  unnecessary. The repository is private on a free plan, so GitHub's own branch protection and auto-merge are not
  available.
- Decision: CI classifies every PR (`scripts/classify-pr.mjs`). **Small** (wording, styling, bug fixes, tests, docs;
  at most 350 changed lines in `app/`, tests and docs not counted) merges itself once all checks pass. **Big**
  (anything in `desktop/`, dependencies, CI/scripts, the rulebook, storage/encryption, deleted app files, weakened
  tests, over 350 app lines, or labelled `major` by the agent for new/removed features and layout changes) is
  labelled `needs-owner` and merged only after the owner writes 合并 in the conversation.
- Addendum (2026-10-09, owner): any PR with 500 or more changed lines in total (all files, tests and docs included)
  is also **big**. The first rule only counted `app/`, so a 1,180-line docs-only PR (#43) merged itself.
- Consequences: agents report which PRs merged by themselves. The owner raised the limit to 350 lines (2026-10-08); it is based on this project's history:
  real small fixes were 5–40 lines, features 100–1000+. Every merge can be reverted.
- One change per PR — changes are not batched. Small, frequent PRs are easier to check and to revert; the only cost
  is GitHub Actions minutes (about 5 billed minutes per CI run; the free plan includes 2,000 a month).

### D-012 Device key protected by the OS (2026-10-08) — superseded by D-015
- Context: the device key sat next to the vault, so anyone who copied the data folder could decrypt it.
- Decision (owner approved "修法 A"): on Windows the key is encrypted with `safeStorage` (DPAPI) and stored by the main
  process (`desktop/device-key.cjs`, `device-key.json`); the page asks for it through `window.clipboxDesktop`
  (`app/device-key-guard.ts`). An existing vault is migrated on first start by re-encrypting it with a fresh key; every
  step is repeatable after a crash and the old key is deleted only once the new vault opens. No start-up password.
- Not on macOS yet: an unsigned Mac app can lose access to its Keychain item after an update (D-013). macOS and the
  browser keep the old behaviour.
- Consequences: if Windows loses its key (admin password reset, restored profile) the vault cannot be opened, so the
  snippet backup matters. A key that is unreadable is an error, never "no key yet" — the vault is never replaced.

### D-013 No code signing for now (2026-10-08)
- Decision: Clipbox is an internal tool; the installers stay unsigned (Windows SmartScreen shows a warning, Mac needs
  right-click → Open). Auto-update is not built. Revisit if it is distributed beyond the company.

### D-014 No real-device testing round (2026-10-08)
- Decision: the owner does not want a Windows/Mac test round before merging. PR #1 and later PRs merge on green CI and
  the owner's 合并.
- Consequences: `docs/features.json` keeps Windows/Mac at `false` (an agent only sets `true` after walking through the
  steps). Anything that only a real machine can show (DPAPI, tray, taskbar, installer) is a known risk, listed in
  `docs/HANDOFF.md`.

### D-015 Device-key protection removed for now (2026-10-08)
- Context (owner): the encryption could make data unrecoverable, and snippets and notes are not that important; what matters is a good cloud upload (backup) of them.
- Decision (owner): no encryption of the device key for now; the code from PR #7 is removed. The vault and its device
  key are stored together again, as before (see README, "Security boundaries").
- Consequences: a copied data folder can be decrypted. Nothing was released with D-012, so no user data was moved to
  the protected store; if a build with PR #7 was ever run on a real machine, that vault's key lives only in
  `device-key.json` and the vault will not open until the encrypted snippet backup is imported. To bring the feature
  back, restore PR #7 from git history (it includes the migration and tests).

### D-016 Backups stay local (2026-10-08)
- Context: after removing device-key protection (D-015) the owner wanted "good cloud upload" of snippets and notes.
  Backing up by email to a fixed company address (`<prefix>@comelylash.com`) was considered; the app has no server
  and cannot send mail by itself, and sending needs either a mail account in the app or a manual attach.
- Decision (owner): keep saving the encrypted backup as a local file ("本地保存即可"). No cloud, email or sync feature.
- Consequences: "no server, no accounts" still holds. Getting the backup file somewhere safe is up to the person
  (copy it to a synced folder or mail it themselves). Revisit only if the owner asks again.

### D-017 图片 section (2026-10-09)
- Context (owner): "单独复制图片的功能 … 把备注直接改成复制图片". No 备注 entries are in use.
- Decision (owner): Windows shows 话术 | 图片 — the 备注 section is gone. macOS keeps 秘密 and adds 图片: 话术 | 秘密 | 图片.
  An image is copied as the picture itself (PNG). Spec: `docs/specs/image-section.md`.
- Consequences: images live in their own encrypted IndexedDB store (`clipbox-images`), keyed from the vault's device key;
  the vault and `clipbox.vault.v1` are unchanged. v1 has no folders, trash or image backup — images are not in any backup
  file yet, so clearing app data loses them. Old Windows 备注 entries, if any, stay in the vault but are not shown.

### D-018 图片 folders (2026-10-09)
- Context (owner): "图片目录页做出来" — the first version of 图片 (D-017) had no folders.
- Decision (owner): 图片 gets 目录 like 话术: a sidebar with 全部图片, user-made folders (rename, colour, delete) and 未分类;
  images are moved with `移动到`; adding while a folder is open puts the image there. Deleting a folder never deletes
  images. Folders are kept in creation order (no drag-sorting yet). Spec: `docs/specs/image-folders.md`.
- Consequences: the folder name sits inside each image's encrypted record (`ImageMeta.folder`) and the folder list is one
  more encrypted record (`folders`) in the same IndexedDB store; no database version change, vault untouched. An older
  build reading this store would show the folder list as a nameless image, so do not downgrade after using folders.

### D-019 图片 九宫格 (2026-10-09)
- Context (owner): "图片哪里给我做成九宫格".
- Decision (owner): the 图片 page shows pictures as a grid of 3 square thumbnails per row (the full window is at least
  680 px wide). A copy button sits on every tile; clicking a tile opens its detail card as a full-width row under that tile's
  row. A `宫格 | 列表` switch (kept per device in `localStorage` key `clipbox.image-view`) brings back the old list. The
  mini window always shows the grid, 3 compact columns, and a tile click copies. Spec: `docs/specs/image-grid.md`.
- Consequences: a UI preference only; no stored image data changes.

### D-020 图片 16宫格, whole picture in the thumbnail (2026-10-09)
- Context (owner): "帮我做成 16 宫格,外加缩略图不要做自适应,要做能看到图片全部的大小".
- Decision (owner): the grid has **4 tiles per row** (16 tiles = 4 full rows); this replaces the 3 columns of D-019
  (mini window too). Thumbnails are never cropped: the whole picture is shown inside the square tile
  (`object-fit: contain`, empty space shows the tile background). The same goes for the small list thumbnail.
- Tile look (owner: "图片预览这里,就算是正方形,也留边, 背景都做成毛玻璃风", then "留空 6%"): in the grid and the mini grid every
  picture, even a square one, sits 6% in from each edge of its tile (the picture box is 88% of the tile) and is never
  cropped. Behind it is colourless frosted glass: a neutral translucent surface with a backdrop blur, a fine grain and an inner highlight, over soft grey blobs so the blur is visible (owner: "做成不带颜色的,纯毛玻璃";
  it first used a blurred copy of the picture, which picked up its colours). The small list thumbnail is unchanged.
- Consequences: CSS and `IMAGE_GRID_COLUMNS` only; no
  stored image data changes. Tests that expected 3 columns or a cropped thumbnail (`cover`) now expect 4 columns and
  `contain`, because the owner changed the behaviour.

### D-023 Version update reminder (2026-10-09)
- Context (owner): "版本更新提醒做一下". Employees on an old build never get fixes (D-013: no auto-update).
- Decision: on launch and then once a day the desktop app reads a small JSON file `{"version","notes","url"}` from an
  address set in `desktop/update-config.cjs` (or env `CLIPBOX_UPDATE_URL`). If it names a newer version, the full window
  shows a top banner: version, short notes, `下载` (opens the https link in the browser) and `稍后` (hides that version
  only, `localStorage` key `clipbox.update-dismissed`). Nothing is downloaded or installed by the app, and the page
  cannot pass its own link: the main process opens only the link it read itself.
- The address is empty for now (owner: 先不定), so the check is off and nothing is sent anywhere. The repo is private,
  so GitHub Releases cannot serve employees without a token; pick a shared link or share drive before turning it on.
- Consequences: D-013 still holds (no code signing, no auto-install). Publishing the JSON and installer is a release
  to employees and waits for the owner.
### D-021 Motion follows arc-library (2026-10-09)
- Context (owner): "动效优先使用 https://github.com/kuratlielia/arc-library.git 中的 UI 组件"; asked which parts could be replaced and chose
  "全面换" (replace everything that can be) on the decision card.
- Decision (owner): animated UI is taken from arc-library (MIT) instead of hand-written CSS animation. Components are copied as
  source into `app/arc/` (with `LICENSE-arc-library.txt`), adapted to Clipbox's colours and Chinese text; they use the `motion`
  package (new dependency, exact version 13.4.0). `lucide-react` is not added: Clipbox's own icons are used. Not taken over:
  command palette and shortcut recorder (D-005, no shortcuts).
- Plan, one PR per step: 1 copy icon + toast; 2 switches, segmented controls, checkboxes; 3 menus and dialogs; 4 rename,
  search, drop zone, empty pages, counters.
- Consequences: package.json and the lock file change (owner's 合并 needed for every step). `prefers-reduced-motion` is honoured by
  every vendored component. Tests that read class names keep working because the old class names stay on the elements.

### D-022 Trash auto-cleanup defaults to 7 days for everyone (2026-10-09)
- Context (owner): "自动清理默认七天". The default used to be 不清理 (`clipbox.trash-retention-days` unset). Asked whether people
  who never chose a setting should keep 不清理 or move to 7 days, the owner chose 「全部 7 天」 and confirmed it in this thread
  ("確認全部 7 天").
- Decision (owner): everyone who never picked a cleanup period moves to 7 天, existing users included. Trash older than 7 days
  is deleted for good on the next start (accepted by the owner). Anyone who picked 不清理, 30 天 or 90 天 earlier keeps that choice.
- Consequences: `DEFAULT_TRASH_DAYS = 7` in `app/preferences.ts` is the single place to change it. No migration, no notice.

### D-024 图片 thumbnails (2026-10-09)
- Context (owner, advisor item 9: "做一下 ... 如果不好看我会回退"): opening the 图片 page decrypted every original at full size.
- Decision (owner): keep a small thumbnail per image. It is derived data: a copy at most 320 px on the longest side (WebP),
  encrypted with the same key and the same scheme as the images (AES-GCM, record id bound in), stored in its **own**
  IndexedDB database `clipbox-image-thumbs`. The original images and their database `clipbox-images` are not changed, not migrated
  and not rewritten. A thumbnail is made the first time an image is shown (or when its record is missing or unreadable) and
  deleted with the image. Pictures that are already small are shown as they are. Tiles and rows use the thumbnail; only an
  opened picture loads the full original, and copying always uses the original.
- Consequences: dropping the thumbnail database only makes thumbnails be made again; no data is lost. Rollback = revert the PR.
