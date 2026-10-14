### D-050 风格 setting: 经典 (beige) or 清爽 (cool grey + lavender, after cardart.cc) (2026-10-14)
- Context (owner, 2026-10-14): 「按照cardart风格,给我做一个风格主题」, then 「我说的主题是给软件做一个主题」 — a look for the
  desktop app, not the website, in the style of cardart.cc (reference only; the app keeps its own layout).
- Decision:
  - A second appearance axis **风格** next to 主题 in 设置 → 外观: 经典 (default, today's beige with orange-red) and
    清爽 (white and lavender). **清爽 is light only** (owner, 2026-10-14: 「这个黑色紫色的,不要暗夜版本了,只要白色紫色这个就行」):
    while it is on, the page forces 浅色 whatever 主题 says, and the 主题 row says so instead of showing the choice; the
    stored 主题 comes back with 经典.
  - The light 清爽 palette is the website's (D-045, `docs/specs/website-design.md`); token tables and the short list of
    shape overrides are in `docs/specs/app-style-fresh.md`.
  - The style only changes colours, radii (pill search, buttons and segmented controls; 16 px open row), shadows and
    heading weights. Nothing moves: no size, padding, margin, font size or position changes.
  - Stored as the plain preference key `clipbox.style` (`classic` | `fresh`), next to `clipbox.theme`; it travels with
    backups like every `clipbox.*` key. The window chrome follows the shown theme (浅色 while 清爽 is on).
- Consequence: existing users see no change until they pick 清爽. New colour rules must use the tokens, or add a
  `[data-style="fresh"]` override, so both styles stay readable. A dark 清爽 palette is not wanted; do not add one.
