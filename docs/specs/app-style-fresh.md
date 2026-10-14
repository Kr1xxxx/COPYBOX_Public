# 风格 清爽 (app theme after cardart.cc, D-050)

A second appearance axis next to 主题: 设置 → 外观 → 风格 = 经典 (default, the beige look) or 清爽 (white + lavender).
经典 works with 跟随系统 / 浅色 / 深色; **清爽 is light only** (owner, 2026-10-14): while it is on, `app/page.tsx` applies
浅色 whatever 主题 says (page attribute and window chrome), and the 主题 row shows 「清爽风格只有浅色」 instead of its
choice. The stored 主题 is kept and comes back with 经典. **Nothing moves:** the style changes colours, radii, shadows and font weights only —
never sizes, paddings, margins, font sizes, positions or element order.

## Model

- `app/preferences.ts`: `StyleChoice = "classic" | "fresh"`.
- `app/page.tsx`: key `clipbox.style` (plain preference, travels with backups like `clipbox.theme`), options
  `["classic", "fresh"]`, default `classic`. 清爽 sets `<html data-style="fresh">`; 经典 removes the attribute.
  The theme effect applies `style === "fresh" ? "light" : theme` to `data-theme` and the desktop bridge.
- `app/settings.tsx`: one `settings-row` 风格 right after 主题, `ArcSegmented` radio 经典 | 清爽; while 清爽 is on, the
  主题 row keeps its label but shows the note instead of the radio group.

## Where the CSS goes (`app/globals.css`) and why

One block, `:root[data-style="fresh"] { … }` plus its component overrides, after the second
`:root { --hit … color-scheme: light; }` and before the dark media block. Because the page forces `data-theme="light"`
while 清爽 is on, neither `:root:not([data-theme="light"])` nor `:root[data-theme="dark"]` matches, so no dark 清爽
block exists and none should be added.

## Tokens

Light 清爽 (shared with the website, `docs/specs/website-design.md`, D-045):

| Token | Value | Token | Value |
| --- | --- | --- | --- |
| `--bg` | `#f8fafc` | `--ink` | `#1f2733` |
| `--sidebar` | `#f1f3f6` | `--ink-2` | `#3a4350` |
| `--card` | `#ffffff` | `--ink-3` | `#5b6472` |
| `--content` | `#f4f6f9` | `--muted` | `#6b7280` |
| `--fill` | `#e6e9ee` | `--accent` | `#6f67c9` |
| `--hover` | `#eceff3` | `--accent-hover` | `#5f57b9` |
| `--line` | `#e3e6eb` | `--accent-soft` | `#e9e6fb` |
| `--line-soft` | `#eceef2` | `--accent-tint` | `#f1effc` |
| `--border` | `#d9dee5` | `--accent-ink` | `#4a4397` |
| `--star` | `#d9a118` | `--danger` | `#c0392b` |
| `--ring` | `rgba(111, 103, 201, .18)` | `--hit` | `#f7e7a0` |
| `--set-edge` | `rgba(31, 39, 51, .08)` | | |

`--ok`, `--ok-bg`, `--warn`, `--warn-bg`, `--danger-bg` and `color-scheme` stay as in the light base.

There is no dark 清爽 palette (owner's choice, 2026-10-14).

## Overrides (all under `[data-style="fresh"]`)

- Pills (`border-radius: 9999px`): `.native-search` (also in the mini window), `.primary-button` (新增, 复制 in the open
  row, dialog and update buttons), `.inline-editor .editor-save`, `.toast-action.primary`, dialog `button.primary`,
  segmented controls `.kind-switch` (话术 | 图片 | 账号), `.segmented`, `.scope-switch`, `.settings-segment` and their
  buttons (the `.arc-seg-pill` inherits the radius).
- Open row and inline editor: radius 16, border `var(--line)`, cool light shadow.
- Shadows: `.arc-seg-pill` `0 1px 2px rgba(31,39,51,.08), 0 0 0 .5px rgba(31,39,51,.05)`; `.dropdown`,
  `.product-filter-menu`, `.toast` `0 12px 32px rgba(31,39,51,.12), 0 0 0 1px rgba(31,39,51,.05)`; settings dialog
  `0 24px 64px rgba(31,39,51,.18), …`; settings backdrop cool `rgba(31,39,51,.32)`.
- Headings at 650 → 600: settings page title, settings card `h3`, settings `h2`, guide `h2`, vault group `h3`.
- Old dialog / editor styles that hard-code the warm accent (`#b5593a`, `#8a3f26`, `#f6e6dc`, …) are pointed back at
  the tokens: dialog primary buttons, 保存, chips (`.editor-kind span`, `.editor-reference`, `.import-folder-list span`,
  `.segment-toggle`, `.summary-control button`), focus rings of old inputs, `.backup-head p`, checkbox accent colour,
  `.update-banner` outline, the search placeholder and the logo mark lines.

## Tests

- `tests/inline-ui.test.mjs`: the 清爽 block sits before the dark media block, no dark 清爽 selectors exist, and the page forces 浅色.
- `tests/e2e/settings.e2e.mjs`: 风格 清爽 switches colours, survives a reload, 经典 brings beige back; on a dark system 清爽 stays light, the 主题 choice is put away and comes back with 经典.
- `tests/e2e/layout-guard.e2e.mjs`: win32 × light/dark system × normal/mini with 清爽 (the dark cases check that it stays light).
