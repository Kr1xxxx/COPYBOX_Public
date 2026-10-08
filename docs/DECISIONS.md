# Decision records

Decisions the owner has made. Ask the owner before changing one. When a decision changes, set the old entry's
status to "Superseded by D-xxx" and add a new entry — do not delete history.
Format follows lightweight architecture decision records (ADR): number, status, context, decision, consequences.
Statuses: Accepted / Superseded / Deprecated.

| # | Decision | Status |
| --- | --- | --- |
| D-001 | Windows first | Accepted |
| D-002 | macOS ships Apple silicon (arm64) only | Accepted |
| D-003 | Second section: plain-text 备注 on Windows, 秘密 on macOS | Accepted |
| D-004 | UI layout "H" | Accepted |
| D-005 | No keyboard shortcuts at all | Accepted |
| D-006 | No auto-clear clipboard; no command-line help in Settings | Accepted |
| D-007 | Snippet note field is 小提示, max 40 characters | Accepted |
| D-008 | AI uses an endpoint the user configures; prompts cannot be empty | Accepted |
| D-009 | Folder rules | Accepted |
| D-010 | Workflow: PRs only, the owner merges | Accepted |

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

### D-010 Workflow (2026-10-09)
- Context: agents and developers all push with the owner's GitHub account, so GitHub cannot require an approval.
- Decision: never push to `main`; one task per PR; CI must be green; only the owner merges. Documentation is in
  English. Reports to the owner are in Chinese, in four parts: 做了什么 / 没做好的地方 / 需要你做的 / 建议下一步.
  Finish whatever can be finished.
- Consequences: "only the owner merges" is enforced by rules and branch protection, not by GitHub approvals.
  If people get their own accounts, require 1 approval.
