"use client";

// 账号 page veil (D-051): until the person slides it open, the 账号 content is drawn but frosted, unreachable and hidden
// from screen readers. The control is a phone-style 「slide to unlock」 track whose gesture follows arc-library's Swipe
// actions (https://uiarc.dev, MIT, see app/arc/LICENSE-arc-library.txt): the knob is a motion value that follows the
// pointer, rubber-bands past either end, arms past the threshold (a fill springs over the track), opens on release when
// armed or when flung, springs home otherwise, and the frost then clears with a spring. The maths is in slide-unlock.ts.
// The knob is a focusable slider: →, End, Enter or Space on it slides it open (a control's own keys, not a shortcut).
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type AnimationPlaybackControls } from "motion/react";
import { motionTokens } from "./arc/motion-tokens.ts";
import { SLIDE_SAMPLES, frostBlur, homeLaunchVelocity, knobPosition, slideArmed, slideLabelOpacity, slideProgress, slideReleaseUnlocks, velocityOf } from "./slide-unlock.ts";

export function AccountVeil({ veiled, onUnlock, children }: { veiled: boolean; onUnlock: () => void; children: ReactNode }) {
  const reduced = useReducedMotion() ?? false;
  const contentRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);

  return (
    <div className={`account-veil-frame${veiled ? " veiled" : ""}`}>
      <div ref={contentRef} className="account-veil-content" inert={veiled} aria-hidden={veiled || undefined}>{children}</div>
      {veiled && <div ref={veilRef} className="account-veil">
        <SlideToUnlock onDone={onUnlock} reduced={reduced} content={contentRef} veil={veilRef} />
      </div>}
    </div>
  );
}

type Drag = { pointer: number; type: string; startX: number; origin: number; samples: [number, number][] };

function SlideToUnlock({ onDone, reduced, content, veil }: { onDone: () => void; reduced: boolean; content: RefObject<HTMLDivElement | null>; veil: RefObject<HTMLDivElement | null> }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  // Knob offset along the track (px), how far the fill covers the rest of the track (0 … 1), how far the frost has cleared (0 … 1).
  const x = useMotionValue(0);
  const cover = useMotionValue(0);
  const reveal = useMotionValue(0);
  const max = useRef(0);
  const knobSize = useRef(44);
  const drag = useRef<Drag | null>(null);
  const travel = useRef<AnimationPlaybackControls | null>(null);
  const stretch = useRef<AnimationPlaybackControls | null>(null);
  const clearing = useRef<AnimationPlaybackControls | null>(null);
  const armed = useRef(false);
  const done = useRef(false);
  const opened = useRef(false);
  const [settled, setSettled] = useState(false);

  const labelOpacity = useTransform(x, (value) => slideLabelOpacity(slideProgress(value, max.current)));
  // The fill's right edge rides the knob's right edge; armed, it springs on to the end of the track.
  const fillX = useTransform([x, cover], ([value = 0, progress = 0]: number[]) => value + progress * (Math.max(max.current, value) - value));

  function measure() {
    const track = trackRef.current;
    const knob = knobRef.current;
    if (!track || !knob) return;
    const pad = parseFloat(getComputedStyle(track).paddingLeft) || 0;
    knobSize.current = knob.offsetWidth || knobSize.current;
    max.current = Math.max(0, track.clientWidth - knob.offsetWidth - pad * 2);
  }

  // The frost and the aria value follow the motion values directly: no React render per frame. At rest, the CSS frost applies.
  useEffect(() => {
    measure();
    const track = trackRef.current;
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    if (track) observer?.observe(track);
    const paint = () => {
      const offset = x.get(), cleared = reveal.get();
      const body = content.current, layer = veil.current;
      knobRef.current?.setAttribute("aria-valuenow", String(Math.round(slideProgress(offset, max.current) * 100)));
      if (!body || !layer) return;
      if (offset === 0 && cleared === 0) {
        body.style.removeProperty("filter");
        body.style.removeProperty("opacity");
        layer.style.removeProperty("opacity");
        return;
      }
      const r = Math.min(1, Math.max(0, cleared));
      body.style.filter = `blur(${frostBlur(slideProgress(offset, max.current), r).toFixed(2)}px) saturate(${(0.9 + 0.1 * r).toFixed(3)})`;
      body.style.opacity = (0.75 + 0.25 * r).toFixed(3);
      layer.style.opacity = (1 - r).toFixed(3);
    };
    const offX = x.on("change", paint);
    const offReveal = reveal.on("change", paint);
    const body = content.current, layer = veil.current;
    return () => {
      offX();
      offReveal();
      observer?.disconnect();
      travel.current?.stop();
      stretch.current?.stop();
      clearing.current?.stop();
      // Veiled again or opened: the CSS takes over from a clean slate.
      body?.style.removeProperty("filter");
      body?.style.removeProperty("opacity");
      layer?.style.removeProperty("opacity");
    };
  }, [x, reveal, content, veil]);

  function setArmed(next: boolean) {
    armed.current = next;
    if (next) trackRef.current?.setAttribute("data-armed", "");
    else trackRef.current?.removeAttribute("data-armed");
  }

  function stretchTo(value: number) {
    stretch.current?.stop();
    if (reduced) { cover.jump(value); return; }
    stretch.current = animate(cover, value, motionTokens.spring.morph);
  }

  function arm(value: number, pointerType: string) {
    const next = slideArmed(value, max.current, armed.current);
    if (next === armed.current) return;
    setArmed(next);
    if (next && pointerType === "touch") navigator.vibrate?.(8);
    stretchTo(next ? 1 : 0);
  }

  // Let go early: spring home, carrying the release velocity but never past the start.
  function settleHome(velocity = 0) {
    if (armed.current || cover.get() !== 0) stretchTo(0);
    setArmed(false);
    if (reduced) { x.jump(0); return; }
    travel.current = animate(x, 0, { ...motionTokens.spring.smooth, velocity: homeLaunchVelocity(x.get(), velocity) });
  }

  function open() {
    if (opened.current) return;
    opened.current = true;
    onDone();
  }

  // The frost clears once the knob reaches the end.
  function clearFrost() {
    if (clearing.current || opened.current) return;
    clearing.current = animate(reveal, 1, { ...motionTokens.spring.smooth, onComplete: open });
    const off = reveal.on("change", (value) => { if (value >= 0.98) { off(); open(); } });
  }

  // Slid open: the knob springs to the end with the release velocity, the fill covers the track, then the frost clears.
  function commit(velocity = 0) {
    if (done.current) return;
    done.current = true;
    drag.current = null;
    setArmed(false);
    measure();
    stretchTo(1);
    setSettled(true);
    travel.current?.stop();
    const end = max.current;
    if (reduced) { x.jump(end); open(); return; }
    const off = x.on("change", (value) => { if (value >= end - 1) { off(); clearFrost(); } });
    travel.current = animate(x, end, { ...motionTokens.spring.snappy, velocity: velocity > 0 ? velocity : 0, onComplete: () => { off(); clearFrost(); } });
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (done.current || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    // Catch the knob mid-flight: the next move carries on from wherever it is now.
    travel.current?.stop();
    measure();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointer: event.pointerId, type: event.pointerType, startX: event.clientX, origin: x.get(), samples: [[event.timeStamp, event.clientX]] };
    knobRef.current?.focus({ preventScroll: true });
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    const value = knobPosition(current.origin + event.clientX - current.startX, max.current, knobSize.current);
    x.set(value);
    current.samples.push([event.timeStamp, event.clientX]);
    if (current.samples.length > SLIDE_SAMPLES) current.samples.shift();
    arm(value, current.type);
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = null;
    current.samples.push([event.timeStamp, event.clientX]);
    const velocity = event.type === "pointercancel" ? 0 : velocityOf(current.samples);
    if (slideReleaseUnlocks(x.get(), max.current, velocity, armed.current)) commit(velocity);
    else settleHome(velocity);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowRight", "End", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    commit();
  }

  return (
    <div ref={trackRef} className={`slide-unlock${settled ? " settled" : ""}`}>
      <div className="slide-unlock-fill-clip" aria-hidden="true"><motion.div className="slide-unlock-fill" style={{ x: fillX }} /></div>
      <motion.span className="slide-unlock-label" aria-hidden="true" style={{ opacity: labelOpacity }}>向右滑动解锁</motion.span>
      <motion.div ref={knobRef} className="slide-unlock-knob" role="slider" tabIndex={0} aria-label="滑动解锁" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} style={{ x }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onKeyDown={onKeyDown}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
      </motion.div>
    </div>
  );
}
