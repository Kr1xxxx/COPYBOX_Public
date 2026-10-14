# 账号 slide-to-unlock: the knob stays on the track

- Date: 2026-10-14 · Thread/agent: coordinator (owner: 「账号页面向右滑动,怎么按钮还能滑出轨道去?」)
- What changed: The rubber band past either end is removed. `knobPosition` clamps to the track (`rubberBand` is gone),
  and the drawn knob and fill are clamped too, so the spring to the end cannot overshoot visibly. D-051's motion
  paragraph says so. The unit and e2e tests that asserted the overshoot now assert the knob stops at the ends.
- User-visible change (plain Chinese, for the preview changelog): 账号页滑动解锁：按钮到轨道两头就停住，不会再滑出轨道
- Not done / risks: Checked in Chromium only, not yet in the Windows or Mac app.
- Next step: 无
