// 账号 page slide-to-unlock (D-051): the setting and the knob maths. The component is app/account-veil.tsx.
// The gesture maths (release velocity, flick, arming with hysteresis) follow arc-library's Swipe actions
// (https://uiarc.dev, MIT, see app/arc/LICENSE-arc-library.txt), adapted to a track that only goes one way.
import { readStoredChoice, writeStoredChoice } from "./stored-choice.ts";

// "0" = off; missing (or anything else) = on. Kept in the browser's storage, never in the vault.
export const SLIDE_UNLOCK_KEY = "clipbox.account-slide-unlock.v1";

export function readSlideUnlockOn(): boolean {
  return readStoredChoice(SLIDE_UNLOCK_KEY, ["0", "1"] as const, "1") !== "0";
}

export function writeSlideUnlockOn(on: boolean) {
  writeStoredChoice(SLIDE_UNLOCK_KEY, on ? "1" : "0");
}

// Released at or past this share of the track, the knob counts as slid to the end.
export const SLIDE_UNLOCK_THRESHOLD = 0.88;

// Disarms only when the knob comes back this many pixels below the threshold, so it does not flicker on the edge.
export const SLIDE_ARM_HYSTERESIS = 20;
// Seconds of travel projected from the release velocity, roughly a 0.99 deceleration rate.
export const SLIDE_PROJECTION = 0.1;
// Release speed in px/s that counts as a flick.
export const SLIDE_FLICK = 900;
// Pointer samples older than this (ms) before the last one do not count toward the release velocity.
const VELOCITY_WINDOW = 80;
// Samples kept while dragging.
export const SLIDE_SAMPLES = 12;

// Where the knob sits for a pointer that would put it at `raw`: 1:1 along the track, stopped at either end. It never
// leaves the track (owner, 2026-10-14: the rubber band past the end looked like the knob sliding out of the track).
export function knobPosition(raw: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(raw)) return 0;
  return Math.min(max, Math.max(0, raw));
}

// px/s from timestamped [ms, x] pointer samples, over the last 80 ms.
export function velocityOf(samples: readonly (readonly [number, number])[]): number {
  const last = samples[samples.length - 1];
  if (!last) return 0;
  const first = samples.find((sample) => last[0] - sample[0] <= VELOCITY_WINDOW) ?? last;
  const elapsed = (last[0] - first[0]) / 1000;
  const velocity = elapsed > 0 ? (last[1] - first[1]) / elapsed : 0;
  return Number.isFinite(velocity) ? velocity : 0;
}

// Past the threshold the slider is armed (let go now and it opens); once armed it stays armed until the knob comes back
// SLIDE_ARM_HYSTERESIS pixels below the threshold.
export function slideArmed(offset: number, max: number, wasArmed: boolean): boolean {
  if (!(max > 0) || !Number.isFinite(offset)) return false;
  if (wasArmed) return offset > SLIDE_UNLOCK_THRESHOLD * max - SLIDE_ARM_HYSTERESIS;
  return slideReachedEnd(slideProgress(offset, max));
}

// Let go at `offset` moving at `velocity` px/s: opens when armed and not flicked back toward the start, or when flung
// toward the end hard enough that the projected position passes the threshold.
export function slideReleaseUnlocks(offset: number, max: number, velocity: number, armed: boolean): boolean {
  if (!(max > 0) || !Number.isFinite(offset) || !Number.isFinite(velocity)) return false;
  if (armed && velocity > -SLIDE_FLICK) return true;
  const projected = offset + velocity * SLIDE_PROJECTION;
  return offset > 0 && velocity > SLIDE_FLICK && projected >= SLIDE_UNLOCK_THRESHOLD * max;
}

// The velocity the spring home starts with. Heading home, it is capped so the spring cannot carry the knob past the start.
export function homeLaunchVelocity(from: number, velocity: number): number {
  if (!Number.isFinite(velocity) || !Number.isFinite(from)) return 0;
  const toward = Math.sign(velocity) === -Math.sign(from) && velocity !== 0;
  return toward ? Math.sign(velocity) * Math.min(Math.abs(velocity), Math.abs(from) * 12) : velocity;
}

// The frost lightens a little as the knob travels (16px blur at the start, 12px at the threshold and beyond), and clears
// as `reveal` goes from 0 to 1 after a successful slide. Never readable before that.
export function frostBlur(progress: number, reveal: number): number {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const r = Math.min(1, Math.max(0, Number.isFinite(reveal) ? reveal : 0));
  const travelled = Math.min(1, p / SLIDE_UNLOCK_THRESHOLD);
  return (16 - 4 * travelled) * (1 - r);
}

// 0 … 1 along the track.
export function slideProgress(offset: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(offset)) return 0;
  return Math.min(1, Math.max(0, offset / max));
}

export function slideReachedEnd(progress: number): boolean {
  return progress >= SLIDE_UNLOCK_THRESHOLD;
}

// The 「向右滑动解锁」 text fades out over the first half of the slide, as on the classic phone lock screen.
export function slideLabelOpacity(progress: number): number {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return Math.max(0, 1 - p * 2);
}
