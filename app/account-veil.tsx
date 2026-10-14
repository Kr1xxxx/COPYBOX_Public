"use client";

// 账号 page veil (D-051): until the person slides it open, the 账号 content is drawn but frosted, unreachable and hidden
// from screen readers. The control is the classic phone 「slide to unlock」: a round knob that follows the pointer 1:1,
// a shimmering label that fades as the knob moves, a spring back when let go early, and the frost fading out on success.
// The knob is a focusable slider: →, End, Enter or Space on it slides it open (a control's own keys, not a shortcut).
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { knobOffset, slideLabelOpacity, slideProgress, slideReachedEnd } from "./slide-unlock.ts";

// How long the frost takes to clear after a successful slide (matches .account-veil-frame.revealing in globals.css).
const REVEAL_MS = 280;

export function AccountVeil({ veiled, onUnlock, children }: { veiled: boolean; onUnlock: () => void; children: ReactNode }) {
  const reduced = useReducedMotion() ?? false;
  const [revealing, setRevealing] = useState(false);
  // Veiled again (left the section, window hidden): start from the beginning.
  if (!veiled && revealing) setRevealing(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function slid() {
    if (reduced) { onUnlock(); return; }
    setRevealing(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(onUnlock, REVEAL_MS);
  }

  return (
    <div className={`account-veil-frame${veiled ? " veiled" : ""}${veiled && revealing ? " revealing" : ""}`}>
      <div className="account-veil-content" inert={veiled} aria-hidden={veiled || undefined}>{children}</div>
      {veiled && <div className="account-veil">
        <SlideToUnlock onDone={slid} reduced={reduced} />
      </div>}
    </div>
  );
}

function SlideToUnlock({ onDone, reduced }: { onDone: () => void; reduced: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ id: number; x: number; from: number; max: number } | null>(null);
  const offset = useRef(0);
  const done = useRef(false);
  const [settled, setSettled] = useState(false);

  function travel() {
    const track = trackRef.current;
    const knob = knobRef.current;
    if (!track || !knob) return 0;
    const pad = parseFloat(getComputedStyle(track).paddingLeft) || 0;
    return Math.max(0, track.clientWidth - knob.offsetWidth - pad * 2);
  }

  // Written straight to the elements while dragging: no React render per pointer move.
  function place(to: number, max: number) {
    offset.current = to;
    const progress = slideProgress(to, max);
    if (knobRef.current) {
      knobRef.current.style.transform = `translate3d(${to}px, 0, 0)`;
      knobRef.current.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
    }
    if (labelRef.current) labelRef.current.style.opacity = String(slideLabelOpacity(progress));
  }

  function animated(on: boolean) {
    trackRef.current?.classList.toggle("springing", on && !reduced);
  }

  function finish() {
    if (done.current) return;
    done.current = true;
    drag.current = null;
    animated(true);
    place(travel(), travel());
    setSettled(true);
    onDone();
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (done.current || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    animated(false);
    drag.current = { id: event.pointerId, x: event.clientX, from: offset.current, max: travel() };
    knobRef.current?.focus({ preventScroll: true });
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const now = drag.current;
    if (!now || now.id !== event.pointerId) return;
    place(knobOffset(now.from, event.clientX - now.x, now.max), now.max);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const now = drag.current;
    if (!now || now.id !== event.pointerId) return;
    drag.current = null;
    if (slideReachedEnd(slideProgress(offset.current, now.max))) { finish(); return; }
    // Let go early: spring back to the start.
    animated(true);
    place(0, now.max);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowRight", "End", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    finish();
  }

  return (
    <div ref={trackRef} className={`slide-unlock${settled ? " settled" : ""}`}>
      <span ref={labelRef} className="slide-unlock-label" aria-hidden="true">向右滑动解锁</span>
      <div ref={knobRef} className="slide-unlock-knob" role="slider" tabIndex={0} aria-label="滑动解锁" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={onKeyDown}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
      </div>
    </div>
  );
}
