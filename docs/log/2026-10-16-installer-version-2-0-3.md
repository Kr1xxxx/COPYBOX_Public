# Installer version reads like the preview (2.03 → 2.0.3)

- Date: 2026-10-16 · Thread/agent: 打包 · 打包與推送（常駐）
- What changed: From 2.00 on, `appVersionFrom` puts the preview's hundredths in the last part of the app version
  ("2.03" → "2.0.3", "2.10" → "2.0.10", "3.00" → "3.0.0") instead of the middle part ("2.03" → "2.3.0"), at the
  owner's request (「写成 2.0.3 不行吗」). 1.x is unchanged; the order still goes up (1.99.0 < 2.0.0 < 2.0.3 < 2.0.10).
  `previewFromApp` reads both forms. The website test now checks latest.json against the expected version exactly.
- User-visible change (plain Chinese, for the preview changelog): 安装包版本号改成和网页测试版对应，比如 2.03 → 2.0.3
- Not done / risks: One private staff build 2.3.0 (2026-10-16 00:44Z) used the old form. A computer that installed it
  sees 2.0.x as older and will not update by itself; it needs one manual install of the new build.
- Next step: 无
