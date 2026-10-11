"use client";

// The six-dot drag handle. Press and drag sorts (the caller's `onBeginDrag`); a plain click opens a small menu with
// 上移 / 下移 for the same item. The menu carries no keyboard-shortcut hints (D-005) and no 隐藏: nothing draggable
// here can be hidden.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { ArcMenu } from "./arc/menu";
import { Icon } from "./ui-atoms";

const CLICK_SLOP = 5;

export function ReorderHandle({ className, label, title, disabled, canMoveUp, canMoveDown, onBeginDrag, onMove, children }: {
  className: string;
  label: string;
  title: string;
  disabled?: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onBeginDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onMove: (delta: -1 | 1) => void;
  children?: ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pos) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setPos(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [pos]);

  function open(event: React.MouseEvent<HTMLButtonElement>) {
    const start = down.current;
    down.current = null;
    // A drag ends with a click on the handle too; only a press that stayed put counts as a click.
    if (start && event.detail > 0 && Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 100)), left: Math.max(8, Math.min(rect.left, window.innerWidth - 176)) });
  }

  const choose = (delta: -1 | 1) => { setPos(null); onMove(delta); };

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={className}
        disabled={disabled}
        aria-label={label}
        title={title}
        aria-haspopup="menu"
        aria-expanded={Boolean(pos)}
        onPointerDown={(event) => { down.current = { x: event.clientX, y: event.clientY }; onBeginDrag(event); }}
        onClick={open}
      >{children}</button>
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>{pos && <>
          <div key="scrim" className="menu-scrim" role="presentation" onMouseDown={() => setPos(null)} />
          <ArcMenu key="menu" className="dropdown reorder-menu" origin="top left" label={label} style={{ top: pos.top, left: pos.left }}>
            <button type="button" role="menuitem" disabled={!canMoveUp} onClick={() => choose(-1)}><Icon name="arrowUp" />上移</button>
            <button type="button" role="menuitem" disabled={!canMoveDown} onClick={() => choose(1)}><Icon name="arrowDown" />下移</button>
          </ArcMenu>
        </>}</AnimatePresence>,
        document.body,
      )}
    </>
  );
}
