# Settings window in the brand look, with bundled fonts

- Date: 2026-10-15 · Thread/agent: 「设计 · 设置页重做」
- What changed: The whole Settings window (nav, search, page and section titles, rows, choice switches, buttons, text
  fields) now uses the brand-guidelines palette and type like the D-071 popups, light and dark, Windows and Mac. Done in
  `app/globals.css` by redefining the colour tokens inside `.settings-dialog`, so every part in it follows; the
  selected tab gets a short orange bar; rows no longer show a doubled divider. Fonts now ship with the app (owner's
  picks, 2026-10-15): Poppins and Lora for Latin letters (Fontsource, OFL, Latin-only files) and MiSans (Xiaomi) for
  Chinese in Settings and the popups on Windows and the browser; the Mac keeps PingFang. 概览 no longer shows the
  「概览」 page title under the wordmark. 关于 has a new 字体 line naming the fonts, as the MiSans licence asks.
  The preview build now points stylesheet urls (fonts) at `assets/static/media/` correctly.
- User-visible change (plain Chinese, for the preview changelog): 设置页换成和弹窗一样的新配色；设置页和弹窗的字体改为软件自带：英文 Poppins / Lora，Windows 中文 MiSans；概览顶部不再显示「概览」两个字
- Not done / risks: MiSans may not be subsetted under its licence, so its two files add about 10 MB to the installer. Main window fonts unchanged (list titles stay 宋体).
- Next step: 无
