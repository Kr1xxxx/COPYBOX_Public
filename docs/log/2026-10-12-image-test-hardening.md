# Harden the image copy test against a busy machine

- Date: 2026-10-12 · Thread/agent: 【工程】代碼整理
- What changed: The 图片 test "the copy button on a tile puts a PNG on the clipboard" caught a "已复制" state that is on screen for about a second, so it failed about one run in four when the machine was busy. It now records what the tile showed (new `recordChanges` / `changesSeen` in `tests/e2e/helpers.mjs`) and checks that the tile got the copied class, the text 已复制 and the label 已复制 图一. It checks the same three things; with the copied class removed from the app it fails. The PNG-on-clipboard check is unchanged.
- User-visible change (plain Chinese, for the preview changelog): 无
- Not done / risks: "a card opened on the last, short row scrolls into view" (image-grid.e2e.mjs) also fails under load, but that is an app race, not a test one: the card is scrolled into view once, 280 ms after it opens (`app/image-section.tsx`, the openId effect), and on a slow machine the card is still growing then, so it ends up not fully in view. Not changed here because 图片 is being worked on in another thread; needs a fix there (scroll again once the card has finished growing).
- Next step: 【圖片】 fixes the single-shot scroll.
