"use client";

// One toast at a time, with one timer: a newer message replaces the older one and its timer, so an old timer can
// never wipe a newer message early. Errors get their own look (ArcToast tone "error": no ✓).
import { useEffect, useState } from "react";

export type ToastTone = "ok" | "error";
export type ToastState = { message: string; tone: ToastTone };
export type ToastOptions = { tone?: ToastTone; ms?: number };
export const EMPTY_TOAST: ToastState = { message: "", tone: "ok" };
export const DEFAULT_TOAST_MS = 2200;

// Messages from parts that only pass text (image section, 账号 panels) are sorted by their words. Text the person
// typed sits inside 「」 and is ignored, so a folder called 失败 does not turn a success red.
const ERROR_WORDS = /失败|没能|出错|无法|读不出|不是有效|没有成功|没有添加|满了|只支持|太大|找不到|打不开|不能为空|名已存在|目录最多/;
export function toastToneFor(message: string): ToastTone {
  return ERROR_WORDS.test(message.replace(/「[^」]*」/g, "")) ? "error" : "ok";
}

type Timers = { set: (callback: () => void, ms: number) => unknown; clear: (handle: unknown) => void };
const browserTimers: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

// show(message, { tone, ms }): ms 0 keeps the message until the next one (used just before the page reloads).
export function createToastController(setState: (state: ToastState) => void, timers: Timers = browserTimers) {
  let timer: unknown = null;
  const stop = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };
  const clear = () => {
    stop();
    setState(EMPTY_TOAST);
  };
  const show = (message: string, options: ToastOptions = {}) => {
    stop();
    if (!message) { setState(EMPTY_TOAST); return; }
    setState({ message, tone: options.tone ?? toastToneFor(message) });
    const ms = options.ms ?? DEFAULT_TOAST_MS;
    if (ms > 0) timer = timers.set(() => { timer = null; setState(EMPTY_TOAST); }, ms);
  };
  return { show, clear, dispose: stop };
}

export function useToast() {
  const [state, setState] = useState<ToastState>(EMPTY_TOAST);
  const [controller] = useState(() => createToastController(setState));
  useEffect(() => controller.dispose, [controller]);
  return { toast: state.message, toastTone: state.tone, showToast: controller.show, clearToast: controller.clear };
}
