# Decision records

Decisions the owner has made. Ask the owner before changing one. When a decision changes, set the old entry's
status to "Superseded by D-xxx" and add a new entry — do not delete history.
Format follows lightweight architecture decision records (ADR): number, status, context, decision, consequences.
Statuses: Accepted / Superseded / Deprecated.

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
| D-015 | Device-key protection removed for now | Accepted |
| D-016 | Backups stay local files; no cloud or email upload | Accepted |
| D-017 | 图片 section: replaces 备注 on Windows, added next to 秘密 on macOS | Accepted |
| D-018 | 图片 folders (目录) | Accepted |
| D-019 | 图片 shown as a 九宫格 (grid) by default | Accepted (columns changed by D-020) |
| D-020 | 图片 grid is 16宫格 (4 per row), whole picture in the thumbnail, 6% margin on frosted glass | Accepted |

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
  cropped. Behind it is colourless frosted glass: a neutral translucent surface with a backdrop blur (owner: "做成不带颜色的,纯毛玻璃";
  it first used a blurred copy of the picture, which picked up its colours). The small list thumbnail is unchanged.
- Consequences: CSS and `IMAGE_GRID_COLUMNS` only; no
  stored image data changes. Tests that expected 3 columns or a cropped thumbnail (`cover`) now expect 4 columns and
  `contain`, because the owner changed the behaviour.
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
