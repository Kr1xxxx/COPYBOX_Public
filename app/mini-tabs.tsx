"use client";

// The mini window's tab rows (top: 全部 / 收藏 / 最近; under the search box: the folders): each one scrolls sideways. Press and drag
// moves it (mouse), the wheel and the trackpad work too, and the active tab slides into view. The 话术/图片 switch
// stays outside the top row, pinned at the left.
import { useEffect, useRef } from "react";

// `placeholder`: keeps the tab's space but shows nothing, so rows do not change width when a section lacks that tab.
// `fullName`: the whole name when `label` is a shortened one (the folder row); it becomes the tooltip and accessible name.
export type MiniTab = { id: string; label: string; fullName?: string; placeholder?: boolean };

const DRAG_START_PX = 4;

export function MiniTabs({ tabs, active, onSelect, label, className = "" }: { tabs: MiniTab[]; active: string; onSelect: (id: string) => void; label: string; className?: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean; id: number } | null>(null);
  const justDragged = useRef(false);

  useEffect(() => {
    const el = scroller.current;
    const tab = el?.querySelector<HTMLElement>(".mini-tab.active");
    if (!el || !tab) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Measured against the row itself, so it does not matter which ancestor is the offset parent.
    const tabLeft = tab.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
    const left = tabLeft - (el.clientWidth - tab.offsetWidth) / 2;
    el.scrollTo({ left: Math.max(0, left), behavior: reduced ? "auto" : "smooth" });
  }, [active]);

  // React's onWheel is passive, so the wheel is turned into sideways scrolling with a native listener.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || el.scrollWidth <= el.clientWidth) return;
      event.preventDefault();
      el.scrollLeft += event.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // The desktop shell moves the window on a mouse-down inside the top band; the row is excluded so dragging it only scrolls.
  function keepWindowStill(event: React.MouseEvent) { event.stopPropagation(); }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    drag.current = { x: event.clientX, left: event.currentTarget.scrollLeft, moved: false, id: event.pointerId };
  }
  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.x;
    if (!state.moved) {
      if (Math.abs(dx) < DRAG_START_PX) return;
      state.moved = true;
      event.currentTarget.setPointerCapture(state.id);
      event.currentTarget.classList.add("dragging");
    }
    event.currentTarget.scrollLeft = state.left - dx;
  }
  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    drag.current = null;
    event.currentTarget.classList.remove("dragging");
    if (!state?.moved) return;
    // The click that follows a drag must not pick a tab.
    justDragged.current = true;
    window.setTimeout(() => { justDragged.current = false; }, 0);
  }

  return (
    // The handlers only add mouse dragging to a row that already scrolls natively; the tabs inside are the real controls.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={scroller}
      className={`mini-tabs ${className}`}
      role="group"
      aria-label={label}
      onMouseDown={keepWindowStill}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={(event) => { if (justDragged.current) { event.stopPropagation(); event.preventDefault(); } }}
    >
      {tabs.map((tab) => tab.placeholder ? (
        <button key={tab.id} type="button" className="mini-tab placeholder" disabled tabIndex={-1} aria-hidden="true">{tab.label}</button>
      ) : (
        <button key={tab.id} type="button" className={`mini-tab ${tab.id === active ? "active" : ""}`} aria-pressed={tab.id === active} title={tab.fullName} aria-label={tab.fullName} onClick={() => onSelect(tab.id)}>{tab.label}</button>
      ))}
    </div>
  );
}
