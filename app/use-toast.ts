"use client";

// One toast at a time, with one timer: a newer message replaces the older one and its timer, so an old timer can
// never wipe a newer message early. Errors get their own look (ArcToast tone "error": no ✓).
import { useEffect, useState } from "react";

export type ToastTone = "ok" | "error";
// Buttons after the text: the primary one is filled with the accent colour, a secondary one stays quiet.
export type ToastAction = { label: string; onClick: () => void; variant?: "primary" | "secondary" };
// fading: the last part of its time, while it turns transparent over fadeMs (CSS does the fading, not React).
export type ToastState = { message: string; tone: ToastTone; actions?: ToastAction[]; fading: boolean; fadeMs: number };
export type ToastOptions = { tone?: ToastTone; ms?: number; actions?: ToastAction[] };
export const EMPTY_TOAST: ToastState = { message: "", tone: "ok", fading: false, fadeMs: 0 };
export const DEFAULT_TOAST_MS = 2200;
// After the pointer (or keyboard focus) leaves, a toast stays at least this long, so there is still time to read or click.
export const TOAST_RESUME_MIN_MS = 1500;
// The fade takes about the last 40% of the time, between 0.6 s and 1.2 s.
export function toastFadeMs(ms: number) {
  return Math.min(ms, Math.min(1200, Math.max(600, Math.round(ms * 0.4))));
}

// Messages from parts that only pass text (image section, 账号 panels) are sorted by their words. Text the person
// typed sits inside 「」 and is ignored, so a folder called 失败 does not turn a success red.
const ERROR_WORDS = /失败|没能|出错|无法|读不出|不是有效|没有成功|没有添加|满了|只支持|太大|找不到|打不开|不能为空|名已存在|目录最多/;
export function toastToneFor(message: string): ToastTone {
  return ERROR_WORDS.test(message.replace(/「[^」]*」/g, "")) ? "error" : "ok";
}

type Timers = { set: (callback: () => void, ms: number) => unknown; clear: (handle: unknown) => void; now?: () => number };
const browserTimers: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => performance.now(),
};

// show(message, { tone, ms, actions }): ms 0 keeps the message until the next one (used just before the page reloads).
// pause() while the pointer is on the toast or a key moved focus into it: the time stops and it is fully visible again.
// resume() when both have left: the rest of the time runs, but never less than TOAST_RESUME_MIN_MS. A message that
// arrives while the toast is held waits too. The toast going away (clear, an empty message) ends the hold.
export function createToastController(setState: (state: ToastState) => void, timers: Timers = browserTimers) {
  const now = timers.now ?? (() => Date.now());
  let timer: unknown = null;
  let current: ToastState = EMPTY_TOAST;
  let remaining = 0; // ms left when the countdown is stopped; Infinity for a message that stays
  let endsAt = 0;
  let held = false;
  const emit = (next: ToastState) => { current = next; setState(next); };
  const stop = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };
  const clear = () => {
    stop();
    held = false;
    emit(EMPTY_TOAST);
  };
  const run = (ms: number) => {
    stop();
    remaining = ms;
    endsAt = now() + ms;
    const fadeAt = Math.max(0, ms - current.fadeMs);
    const end = () => { timer = null; held = false; emit(EMPTY_TOAST); };
    const fade = () => { emit({ ...current, fading: true }); timer = timers.set(end, ms - fadeAt); };
    if (current.fading) emit({ ...current, fading: false });
    if (fadeAt > 0) timer = timers.set(() => { timer = null; fade(); }, fadeAt);
    else fade();
  };
  const show = (message: string, options: ToastOptions = {}) => {
    stop();
    if (!message) { held = false; emit(EMPTY_TOAST); return; }
    const ms = options.ms ?? DEFAULT_TOAST_MS;
    emit({ message, tone: options.tone ?? toastToneFor(message), actions: options.actions?.length ? options.actions : undefined, fading: false, fadeMs: ms > 0 ? toastFadeMs(ms) : 0 });
    remaining = ms > 0 ? ms : Infinity;
    if (ms > 0 && !held) run(ms);
  };
  const pause = () => {
    if (!current.message || held) return;
    held = true;
    if (timer !== null) { remaining = Math.max(0, endsAt - now()); stop(); }
    if (current.fading) emit({ ...current, fading: false });
  };
  const resume = () => {
    if (!held) return;
    held = false;
    if (current.message && remaining !== Infinity) run(Math.max(remaining, TOAST_RESUME_MIN_MS));
  };
  return { show, clear, pause, resume, dispose: stop };
}

export function useToast() {
  const [state, setState] = useState<ToastState>(EMPTY_TOAST);
  const [controller] = useState(() => createToastController(setState));
  useEffect(() => controller.dispose, [controller]);
  return { toast: state.message, toastTone: state.tone, toastState: state, showToast: controller.show, clearToast: controller.clear, pauseToast: controller.pause, resumeToast: controller.resume };
}
