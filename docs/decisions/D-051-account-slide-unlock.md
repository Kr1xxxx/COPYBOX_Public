### D-051 The 账号 page is frosted until it is slid open (on by default) (2026-10-14)
- Context (owner, 2026-10-14): 「账号页面,默认改成需要滑动解锁才能看,否则这个页面全部是毛玻璃的,动效用网上现成的流畅的」.
- Decision:
  - **Frosted by default.** In the full window, the 账号 section's content (the section head, the 保险箱 list, on macOS
    the old 秘密 list, the 选择 bar) is drawn but blurred and tinted (`filter: blur(16px)` plus a translucent `--bg`
    layer), `inert` and `aria-hidden`, so it cannot be read, clicked, copied or reached by keys or screen readers. The
    账号-only header actions (新增, 选择, 收起) are hidden while it is frosted. Section tabs, search, 设置, the pin button,
    the mini button and the sidebar stay as they are. Enter in the search box does not copy while frosted.
  - **The control is the classic phone 「slide to unlock」**, rebuilt in CSS and a small component
    (`app/account-veil.tsx`, maths in `app/slide-unlock.ts`; no new dependency): a rounded track, a round knob that
    follows the pointer 1:1 (pointer capture, `translate3d`, no React render per move), the label 「向右滑动解锁」
    shimmering (moving gradient clipped to the text) and fading as the knob moves, a spring back
    (`cubic-bezier(.22, 1, .36, 1)`, 320 ms) when let go before 88 % of the track, and on success the frost fades out
    in 280 ms (only `filter` and `opacity` animate) before the veil leaves the page. Frosting again is instant.
    `prefers-reduced-motion`: no shimmer, no spring, the page opens at once.
  - **Keys:** the knob is a focusable `role="slider"` (「滑动解锁」, 0–100); →, End, Enter or Space on the focused knob
    opens it. These are the control's own keys, not a shortcut: nothing opens it from anywhere else (D-005 stands).
  - **When it closes again:** on leaving the 账号 section (same rule as the 账号页密码) and when the window is hidden
    (`visibilitychange` to hidden: minimised, closed to the tray). A restart starts frosted.
  - **账号页密码 wins.** When the password is set, its screen is the only gate: no slider before or after it. Removing
    the password while on the page leaves the page open.
  - **Setting:** 设置 → 数据 → 安全, 「打开账号页先滑动解锁」 开/关, default 开, under 账号页密码.
  - **Mini window:** unchanged. It never shows the 账号 entries; on macOS its 账号 tab lists only the titles of old
    秘密 entries, which copy on click as before.
- Storage: a new browser-storage preference `clipbox.account-slide-unlock.v1` ("0" = off; missing or anything else =
  on), read and written through `readStoredChoice` / `writeStoredChoice`. Not in the vault, not in backups; nothing in
  the encryption, the vault or the 账号页密码 changes.
- Tests: `tests/slide-unlock.test.mjs`, `tests/e2e/account-slide-unlock.e2e.mjs`. The shared e2e storage state
  (`guideSeenState` in `tests/e2e/helpers.mjs`) starts with the slide off, so tests about the 账号 content reach it at
  once; the slide's own tests use `SLIDE_UNLOCK_ON`.
- Motion update (owner, 2026-10-14: 「这个感觉 动效哈,不是一样的」 — the feel of arc-library's Swipe actions, not that
  component). The knob's motion now ports Swipe actions' mechanics (MIT, D-021) with `motion/react` and
  `motionTokens`, replacing the CSS transitions described above: the knob is a motion value that follows the pointer
  1:1 on the track and rubber-bands past either end (`rubberBand`, .55, bounded by the knob width); past 88 % it
  arms (20 px hysteresis to disarm) and an accent fill, which grows out from behind the knob, springs over the whole
  track (`spring.morph`; 8 ms vibration on touch); on release it opens when armed and not flicked back, or when flung
  (> 900 px/s and the position projected 0.1 s ahead passes 88 %), else springs home (`spring.smooth`, release
  velocity capped so it cannot pass the start). Opening: the knob springs to the end (`spring.snappy`), then the
  frost and tint clear with `spring.smooth` before the veil leaves the page. While sliding the blur lightens from
  16 px to 12 px (still unreadable). Keys, `aria-valuenow`, reduced motion (everything jumps, no shimmer) and
  everything else above are unchanged.
