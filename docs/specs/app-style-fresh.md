# 风格 清爽 (app theme after cardart.cc, D-049)

A second appearance axis next to 主题: 设置 → 外观 → 风格 = 经典 (default, the beige look) or 清爽 (cool grey + lavender).
Both work with 跟随系统 / 浅色 / 深色. **Nothing moves:** the style changes colours, radii, shadows and font weights only —
never sizes, paddings, margins, font sizes, positions or element order.

## Model

- `app/preferences.ts`: `StyleChoice = "classic" | "fresh"`.
- `app/page.tsx`: key `clipbox.style` (plain preference, travels with backups like `clipbox.theme`), options
  `["classic", "fresh"]`, default `classic`. 清爽 sets `<html data-style="fresh">`; 经典 removes the attribute.
  The desktop bridge is not called: the window chrome keeps following 主题.
- `app/settings.tsx`: one `settings-row` 风格 right after 主题, `ArcSegmented` radio 经典 | 清爽.

## Where the CSS goes (`app/globals.css`) and why

| Block | Selector | Place |
| --- | --- | --- |
| Light 清爽 | `:root[data-style="fresh"] { … }` | after the second `:root { --hit … color-scheme: light; }`, **before** the dark media block, so 跟随系统 on a dark system still picks dark |
| Dark 清爽, 跟随系统 | `:root[data-style="fresh"]:not([data-theme="light"]) { … }` | inside `@media (prefers-color-scheme: dark)`, after its rules |
| Dark 清爽, forced | `:root[data-theme="dark"][data-style="fresh"] { … }` | after the `:root[data-theme="dark"] …` rules |

The component overrides sit with the light block, before the dark rules, so the existing dark shadows (same
specificity, later) still win in dark.

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

Dark 清爽:

| Token | Value | Token | Value |
| --- | --- | --- | --- |
| `--bg` | `#14171c` | `--ink` | `#eef0f3` |
| `--sidebar` | `#101317` | `--ink-2` | `#d2d6dc` |
| `--card` | `#1f242b` | `--ink-3` | `#a9b0ba` |
| `--content` | `#1a1e24` | `--muted` | `#8a919d` |
| `--fill` | `#2a3038` | `--accent` | `#a39cf0` |
| `--hover` | `#232830` | `--accent-hover` | `#b5aff4` |
| `--line` | `#2c323a` | `--accent-soft` | `#33305c` |
| `--line-soft` | `#262b32` | `--accent-tint` | `#2a2846` |
| `--border` | `#363d47` | `--accent-ink` | `#d4d0ff` |
| `--star` | `#e8bd4a` | `--danger` | `#f08b82` |
| `--ring` | `rgba(163, 156, 240, .3)` | `--hit` | `#5c4e1a` |
| `--set-card` | `#242a32` | `--set-edge` | `rgba(255, 255, 255, .08)` |

`--ok` … keep the dark base values. Rail thumbs in `.list-frame`: `rgba(238,240,243,.26)` / `.42` (the classic warm
white looks yellowish on cool dark grey).

## Overrides (all under `[data-style="fresh"]`)

- Pills (`border-radius: 9999px`): `.native-search` (also in the mini window), `.primary-button` (新增, 复制 in the open
  row, dialog and update buttons), `.inline-editor .editor-save`, `.toast-action.primary`, dialog `button.primary`,
  segmented controls `.kind-switch` (话术 | 图片 | 账号), `.segmented`, `.scope-switch`, `.settings-segment` and their
  buttons (the `.arc-seg-pill` inherits the radius).
- Open row and inline editor: radius 16, border `var(--line)`, cool light shadow; dark keeps black shadows.
- Shadows: `.arc-seg-pill` `0 1px 2px rgba(31,39,51,.08), 0 0 0 .5px rgba(31,39,51,.05)`; `.dropdown`,
  `.product-filter-menu`, `.toast` `0 12px 32px rgba(31,39,51,.12), 0 0 0 1px rgba(31,39,51,.05)`; settings dialog
  `0 24px 64px rgba(31,39,51,.18), …`; settings backdrop cool `rgba(31,39,51,.32)` (dark: black as before).
- Headings at 650 → 600: settings page title, settings card `h3`, settings `h2`, guide `h2`, vault group `h3`.
- Old dialog / editor styles that hard-code the warm accent (`#b5593a`, `#8a3f26`, `#f6e6dc`, …) are pointed back at
  the tokens: dialog primary buttons, 保存, chips (`.editor-kind span`, `.editor-reference`, `.import-folder-list span`,
  `.segment-toggle`, `.summary-control button`), focus rings of old inputs, `.backup-head p`, checkbox accent colour,
  `.update-banner` outline, the search placeholder and the logo mark lines.

## Tests

- `tests/inline-ui.test.mjs`: the three selectors exist in the order above.
- `tests/e2e/settings.e2e.mjs`: 风格 清爽 switches colours, survives a reload, 经典 brings beige back; dark system.
- `tests/e2e/layout-guard.e2e.mjs`: win32 × light/dark × normal/mini with 清爽.
