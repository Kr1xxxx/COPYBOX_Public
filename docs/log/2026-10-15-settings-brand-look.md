# Settings window in the brand look

- Date: 2026-10-15 · Thread/agent: 「设计 · 设置页重做」
- What changed: The whole Settings window (nav, search, page and section titles, rows, choice switches, buttons, text
  fields) now uses the brand-guidelines palette and type like the D-071 popups, light and dark, Windows and Mac. Done in
  `app/globals.css` only by redefining the colour tokens inside `.settings-dialog`, so every part in it follows; the
  selected tab gets a short orange bar. Visual only: no setting moved or changed. Rows no longer show a doubled divider.
- User-visible change (plain Chinese, for the preview changelog): 设置页换成和弹窗一样的新配色和字体，选中的分类左边有一条橙色小竖线，深浅色都一样
- Not done / risks: Poppins / Lora are not bundled, so most computers show Arial / Georgia with the system Chinese font (same as the popups).
- Next step: 无
