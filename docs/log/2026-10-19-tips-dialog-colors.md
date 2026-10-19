# Tips dialog colours

- Date: 2026-10-19 · Thread/agent: 設計 · Tips 弹窗配色
- What changed: The Tips (每日小贴士) dialog drops the solid black 「知道了」 button for the brand orange (deeper #b25638 in light so white text passes 4.5:1, brand #d97757 with dark text in dark), colours the 「Tips」 label orange, and gives the right-way example a green bar on a lighter green tint. Colour only, Tips dialog only (`app/globals.css`, brand dialog block). Also: the popup fonts (Poppins, Lora, MiSans off macOS) now load at app start (`app/font-warmup.tsx`, mounted in `app/layout.tsx`); before, the first popup opened in a fallback font and its text jumped when the real font arrived (owner: 「点开 Tips 字会动」).
- User-visible change (plain Chinese, for the preview changelog): 小贴士弹窗换了配色：「知道了」改成暖橙色，正确示范带一条绿色竖线；第一次打开小贴士等弹窗时文字不再跳一下
- Not done / risks: 无
- Next step: 无
