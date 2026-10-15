// 账号 page auto-lock (D-070): after the page is opened (slid open, or the 账号页密码 entered), it closes again once nobody
// has touched the app for a while. The choice lives in the browser's storage, never in the vault.
import { readStoredChoice, writeStoredChoice } from "./stored-choice.ts";

export const AUTO_LOCK_KEY = "clipbox.account-auto-lock.v1";

// Seconds without activity before the page closes again; 0 = 不上锁. The order is the order shown in 设置 → 安全.
export const AUTO_LOCK_OPTIONS = [10, 20, 30, 0] as const;
export type AutoLockSeconds = (typeof AUTO_LOCK_OPTIONS)[number];
export const AUTO_LOCK_DEFAULT: AutoLockSeconds = 20;

export function readAutoLockSeconds(): AutoLockSeconds {
  return readStoredChoice(AUTO_LOCK_KEY, AUTO_LOCK_OPTIONS, AUTO_LOCK_DEFAULT);
}

export function writeAutoLockSeconds(seconds: AutoLockSeconds) {
  writeStoredChoice(AUTO_LOCK_KEY, seconds);
}

export function autoLockLabel(seconds: AutoLockSeconds): string {
  return seconds === 0 ? "不上锁" : `${seconds} 秒`;
}

// Whether the countdown runs right now: the 账号 page is showing and open, and there is a lock to go back to.
// With 账号页密码 set, the password screen is that lock (in either window); without it, the slide veil is, which only the
// full window has (D-051).
export function autoLockRunning(state: { seconds: number; accountMode: boolean; lockSet: boolean; unlocked: boolean; slideOn: boolean; slidOpen: boolean; fullWindow: boolean }): boolean {
  if (!(state.seconds > 0) || !state.accountMode) return false;
  if (state.lockSet) return state.unlocked;
  return state.slideOn && state.slidOpen && state.fullWindow;
}

// What the 「自动上锁」 row says under its title.
export function autoLockHint(seconds: AutoLockSeconds, hasLock: boolean): string {
  if (!hasLock) return "要先设账号页密码或打开滑动解锁，才会自动上锁";
  if (seconds === 0) return "解锁后一直保持打开，直到离开账号页";
  return `解锁后 ${seconds} 秒内没有操作，账号页就会重新上锁`;
}
