// 账号 page slide-to-unlock (D-050): the setting and the knob maths. The component is app/account-veil.tsx.
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

// Where the knob sits for a pointer that moved `dx` pixels since it was pressed at `start`: never off the track.
export function knobOffset(start: number, dx: number, max: number): number {
  if (!(max > 0)) return 0;
  const next = start + dx;
  if (!Number.isFinite(next)) return 0;
  return Math.min(max, Math.max(0, next));
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
