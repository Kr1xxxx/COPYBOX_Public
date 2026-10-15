"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Two ways to see a hidden 账号 value: 「按住显示」 shows it only while pressed (and never longer than
// HOLD_LIMIT_MS, in case the release is missed); 「显示」 keeps it shown until clicked again (「隐藏」) or hide().
const HOLD_LIMIT_MS = 5000;

export type Reveal = {
  isShown: (id: string) => boolean;
  isPinned: (id: string) => boolean;
  hold: (id: string) => void;
  release: () => void;
  toggle: (id: string) => void;
  hide: () => void;
};

export function useReveal(): Reveal {
  const [held, setHeld] = useState("");
  const [pinned, setPinned] = useState<ReadonlySet<string>>(() => new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const release = useCallback(() => { clearTimeout(timer.current); setHeld(""); }, []);
  const hold = useCallback((id: string) => {
    setHeld(id);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHeld(""), HOLD_LIMIT_MS);
  }, []);
  const toggle = useCallback((id: string) => setPinned((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);
  const hide = useCallback(() => { release(); setPinned((current) => (current.size ? new Set() : current)); }, [release]);

  return {
    isShown: (id) => held === id || pinned.has(id),
    isPinned: (id) => pinned.has(id),
    hold, release, toggle, hide,
  };
}

export function RevealButtons({ reveal, id, label, className = "reveal-pair-button" }: { reveal: Reveal; id: string; label: string; className?: string }) {
  const pinned = reveal.isPinned(id);
  return (
    <>
      <button type="button" className={className} aria-label={`按住显示${label}`} title="按住时显示，松开就隐藏"
        onPointerDown={() => reveal.hold(id)} onPointerUp={reveal.release} onPointerLeave={reveal.release} onPointerCancel={reveal.release}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); reveal.hold(id); } }}
        onKeyUp={reveal.release} onBlur={reveal.release}>按住显示</button>
      <button type="button" className={className} aria-label={`${pinned ? "隐藏" : "显示"}${label}`} aria-pressed={pinned}
        title={pinned ? "点一下隐藏" : "点一下显示，再点隐藏"} onClick={() => reveal.toggle(id)}>{pinned ? "隐藏" : "显示"}</button>
    </>
  );
}
