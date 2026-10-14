# 风格 setting: 经典 / 清爽

- Date: 2026-10-14 · Thread/agent: Claude worker (coordinator spec `app-style-fresh`)
- What changed: 设置 → 外观 has a new 风格 row (经典 | 清爽, key `clipbox.style`, D-050). 清爽 sets `data-style="fresh"` on the page and switches to a cool grey + lavender palette (light and dark) with pill-shaped search, buttons and segmented controls, lighter cool shadows and 600-weight headings; nothing moves. Spec: `docs/specs/app-style-fresh.md`. Tests: source-order test, settings e2e (switch, reload, dark system) and four win32 layout-guard cases with 清爽.
- User-visible change (plain Chinese, for the preview changelog): 设置 → 外观 新增「风格」：经典（现在的米色）/ 清爽（浅灰底、淡紫点缀），浅色深色都有
- Not done / risks: Only checked in the browser (Windows look via the e2e fake); not walked through on a real Windows or Mac window. macOS-only 秘密 screens are not covered by the 清爽 layout-guard cases. Some rarely seen old dialog styles may still show a warm grey.
- Next step: Owner tries 清爽 on Windows and says whether the lavender and greys feel right.
