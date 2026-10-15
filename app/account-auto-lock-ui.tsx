"use client";

// 设置 → 安全 → 「账号页自动上锁」 and the countdown that closes the 账号 page again (D-070). The rules are in account-auto-lock.ts.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArcSegmented } from "./arc/segmented";
import { resolveFocusWrapIndex } from "./clipbox-core";
import { AUTO_LOCK_OPTIONS, autoLockHint, autoLockLabel, type AutoLockSeconds } from "./account-auto-lock";

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

// A text field being typed into on the 账号 page holds the lock off, so a pause to think never throws away an edit.
function editingAccountField() {
  const active = document.activeElement as HTMLElement | null;
  if (!active?.closest(".vault-inline")) return false;
  if (active.isContentEditable) return true;
  return (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) && !active.readOnly && !active.disabled;
}

// While `running`, calls onLock once `seconds` pass with no pointer, key or wheel activity anywhere in the window.
export function useAccountAutoLock(running: boolean, seconds: number, onLock: () => void) {
  const onLockRef = useRef(onLock);
  useEffect(() => { onLockRef.current = onLock; });
  useEffect(() => {
    if (!running || !(seconds > 0)) return;
    const wait = seconds * 1000;
    let last = Date.now();
    let timer = 0;
    const check = () => {
      const left = last + wait - Date.now();
      if (left > 0) { timer = window.setTimeout(check, left); return; }
      if (editingAccountField()) { last = Date.now(); timer = window.setTimeout(check, wait); return; }
      onLockRef.current();
    };
    const touch = () => { last = Date.now(); };
    timer = window.setTimeout(check, wait);
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, touch, { capture: true, passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, touch, { capture: true });
    };
  }, [running, seconds]);
}

export function AutoLockRow({ seconds, hasLock, onChange }: { seconds: AutoLockSeconds; hasLock: boolean; onChange: (seconds: AutoLockSeconds) => void }) {
  const [confirmOff, setConfirmOff] = useState(false);
  return (
    <div className="settings-row"><div><strong>账号页自动上锁</strong><small>{autoLockHint(seconds, hasLock)}</small></div>
      <ArcSegmented className="settings-segment" mode="radio" label="账号页自动上锁" value={String(seconds)}
        onSelect={(value) => { const next = Number(value) as AutoLockSeconds; if (next === seconds) return; if (next === 0) setConfirmOff(true); else onChange(next); }}
        options={AUTO_LOCK_OPTIONS.map((option) => ({ value: String(option), label: autoLockLabel(option) }))} />
      {confirmOff && <AutoLockOffConfirm onCancel={() => setConfirmOff(false)} onConfirm={() => { setConfirmOff(false); onChange(0); }} />}
    </div>
  );
}

// The same small card as 删除确认. 取消 has focus, so Enter or Escape keeps the lock.
function AutoLockOffConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") || []);
      const wrapIndex = resolveFocusWrapIndex(focusable.indexOf(document.activeElement as HTMLElement), focusable.length, event.shiftKey);
      if (wrapIndex >= 0) { event.preventDefault(); focusable[wrapIndex].focus(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);
  // Drawn on the page itself, so the card covers the whole window and not only the 设置 panel.
  return createPortal(
    <div className="delete-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section ref={dialogRef} className="delete-confirm-dialog" data-local-esc="" role="alertdialog" aria-modal="true" aria-labelledby="auto-lock-off-title" aria-describedby="auto-lock-off-text">
        <header><h2 id="auto-lock-off-title">不再自动上锁？</h2><p id="auto-lock-off-text">解锁后账号页会一直打开，离开电脑时别人也能看到你的账号和密码。</p></header>
        <form onSubmit={(event) => { event.preventDefault(); onConfirm(); }}>
          <div className="delete-confirm-item"><strong>账号页自动上锁</strong><small>改为不上锁</small></div>
          <div className="delete-confirm-actions"><button ref={cancelRef} type="button" onClick={onCancel}>取消</button><button className="primary">确认不上锁</button></div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
