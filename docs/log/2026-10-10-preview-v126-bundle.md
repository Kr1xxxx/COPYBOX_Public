# Preview v1.26: imported patches from other threads

- Date: 2026-10-10 · Thread/agent: 【話術】話術功能與測試版
- What changed: bundled for the web trial page, unpushed: images patches (new-folder field border, image favourites, folder drag handle on the left, image folder sorting), security patches 0001-0004 (vault typed items, overview, API key, 验证码 QR), the tools layout-guard e2e test (its whitelist entries for the row menu, variable popup, backup dialog, 新建目录 and the mini 已复制 contrast were removed because they are fixed), and the mini-window `已复制` green text darkened to #1c6f43 for contrast. Rejected CSS/test hunks of the patches were appended by hand (they only append at file ends).
- User-visible change (plain Chinese, for the preview changelog): see changelog v1.26.
- Not done / risks: not pushed (upload freeze); the layout guard skips some steps (variable-popup, images-added, images-open) on its own; the totp-add step fails on Mac because the 验证码 dialog is now inside 保险箱 (whitelisted by the tools thread).
- Next step: each owner thread checks its part in the preview.
