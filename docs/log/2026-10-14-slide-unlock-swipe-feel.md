# 账号 slide-to-unlock: the swipe-actions motion feel

- Date: 2026-10-14 · Thread/agent: 【账号】滑动解锁手感 (worker)
- What changed: The 账号 slide-to-unlock (D-051) now moves like arc-library's Swipe actions (MIT, mechanics ported,
  not the component): the knob is a `motion` value that follows the pointer, rubber-bands past both ends (.55 factor,
  bounded by the knob's width), arms past 88 % of the track with 20 px of hysteresis (an accent fill springs over the
  track with `spring.morph`; touch vibrates 8 ms), opens on release when armed or when flung (> 900 px/s with the
  0.1 s projection past the threshold), otherwise springs home with `spring.smooth` carrying the release velocity but
  never past the start. On success the knob springs to the end (`spring.snappy`) and the frost clears with
  `spring.smooth`; while sliding the frost lightens from 16 px to 12 px blur (still unreadable). Gesture maths in
  `app/slide-unlock.ts` (`rubberBand`, `knobPosition`, `velocityOf`, `slideArmed`, `slideReleaseUnlocks`,
  `homeLaunchVelocity`, `frostBlur`) with unit tests; `knobOffset` (clamped) is replaced by `knobPosition` (rubber band).
  `app/page.tsx` is untouched.
- User-visible change (plain Chinese, for the preview changelog): 滑动解锁的手感换成和 arc 组件库「滑动操作」一样：跟手、拉过头有弹性、滑到头底色铺满、快速一甩也能解锁，松手没到位会顺滑弹回
- Not done / risks: Checked in Chromium (Playwright) at 680×620, light and dark, Windows and Mac look; not yet on a
  real Windows or Mac machine or with a touch screen (the 8 ms vibration only fires on touch).
- Next step: Owner tries it in `npm run tauri:dev`; the threshold (88 %) and the flick speed (900 px/s) can be tuned.
