### D-049 风格 setting: 经典 (beige) or 清爽 (cool grey + lavender, after cardart.cc) (2026-10-14)
- Context (owner, 2026-10-14): 「按照cardart风格,给我做一个风格主题」, then 「我说的主题是给软件做一个主题」 — a look for the
  desktop app, not the website, in the style of cardart.cc (reference only; the app keeps its own layout).
- Decision:
  - A second appearance axis **风格** next to 主题 in 设置 → 外观: 经典 (default, today's beige with orange-red) and
    清爽 (cool grey with lavender). Each works with 跟随系统 / 浅色 / 深色, so 清爽 has a light and a dark palette.
  - The light 清爽 palette is the website's (D-045, `docs/specs/website-design.md`); token tables and the short list of
    shape overrides are in `docs/specs/app-style-fresh.md`.
  - The style only changes colours, radii (pill search, buttons and segmented controls; 16 px open row), shadows and
    heading weights. Nothing moves: no size, padding, margin, font size or position changes.
  - Stored as the plain preference key `clipbox.style` (`classic` | `fresh`), next to `clipbox.theme`; it travels with
    backups like every `clipbox.*` key. The window chrome keeps following 主题 (the desktop bridge is not called).
- Consequence: existing users see no change until they pick 清爽. New colour rules must use the tokens, or add a
  `[data-style="fresh"]` override, so both styles stay readable.
