"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { railThumb, scrollTopForThumbDrag, scrollTopForTrackClick, type ScrollMetrics } from "./scroll-rail-core";

const IDLE_AFTER_MS = 800;

const metricsOf = (element: HTMLElement): ScrollMetrics => ({ scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight });

// Wraps a scrolling list (its first child) without changing the list's size or place. Adds, on top of it:
// - a soft shadow under the header while the list is scrolled away from the top (depth between header and list);
// - a thin bar on the right showing how much is above and below; its thumb can be dragged, the track clicked to page.
// The list keeps its hidden native scrollbar and its keyboard scrolling; the overlay is aria-hidden.
// State lives in data attributes on the frame (no React re-render on every scroll).
export function ListScrollFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [scroller, setScroller] = useState<HTMLElement | null>(null);

  // The list is remounted when the folder or section changes (it is keyed); follow the current element.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const pick = () => {
      const first = frame.firstElementChild;
      setScroller(first instanceof HTMLElement && !first.classList.contains("list-depth") ? first : null);
    };
    pick();
    const observer = new MutationObserver(pick);
    observer.observe(frame, { childList: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!frame || !track || !thumb || !scroller) return;
    let frameRequest = 0;
    let idleTimer = 0;

    const sync = () => {
      frameRequest = 0;
      const metrics = metricsOf(scroller);
      const { visible, size, offset } = railThumb(metrics, track.clientHeight);
      if (visible) frame.dataset.overflow = ""; else delete frame.dataset.overflow;
      if (metrics.scrollTop > 0.5) frame.dataset.scrolled = ""; else delete frame.dataset.scrolled;
      thumb.style.height = `${size}px`;
      thumb.style.transform = `translateY(${offset}px)`;
    };
    const schedule = () => { if (!frameRequest) frameRequest = requestAnimationFrame(sync); };
    const onScroll = () => {
      schedule();
      frame.dataset.active = "";
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => { delete frame.dataset.active; }, IDLE_AFTER_MS);
    };

    // Size changes: the list itself (window resize) and each of its rows (a card opening, an image loading).
    const resizeObserver = new ResizeObserver(schedule);
    const observeChildren = () => {
      resizeObserver.disconnect();
      resizeObserver.observe(scroller);
      resizeObserver.observe(track);
      for (const child of Array.from(scroller.children)) resizeObserver.observe(child);
    };
    observeChildren();
    // Rows added or removed (items change, search narrows the list).
    const mutationObserver = new MutationObserver(() => { observeChildren(); schedule(); });
    mutationObserver.observe(scroller, { childList: true });

    scroller.addEventListener("scroll", onScroll, { passive: true });
    sync();
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      cancelAnimationFrame(frameRequest);
      window.clearTimeout(idleTimer);
      delete frame.dataset.overflow;
      delete frame.dataset.scrolled;
      delete frame.dataset.active;
      delete frame.dataset.dragging;
    };
  }, [scroller]);

  function onTrackPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    const frame = frameRef.current;
    if (!scroller || !track || !thumb || !frame || event.button !== 0) return;
    event.preventDefault();
    const trackTop = track.getBoundingClientRect().top;
    if (event.target !== thumb) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      scroller.scrollTo({ top: scrollTopForTrackClick(event.clientY - trackTop, metricsOf(scroller), track.clientHeight), behavior: reduce ? "auto" : "smooth" });
      return;
    }
    // Drag the thumb: the pointer is captured so the drag keeps working outside the thin bar.
    const startY = event.clientY;
    const startTop = scroller.scrollTop;
    thumb.setPointerCapture(event.pointerId);
    frame.dataset.dragging = "";
    const move = (moveEvent: PointerEvent) => {
      scroller.scrollTop = scrollTopForThumbDrag(startTop, moveEvent.clientY - startY, metricsOf(scroller), track.clientHeight);
    };
    const end = () => {
      delete frame.dataset.dragging;
      thumb.removeEventListener("pointermove", move);
      thumb.removeEventListener("pointerup", end);
      thumb.removeEventListener("pointercancel", end);
    };
    thumb.addEventListener("pointermove", move);
    thumb.addEventListener("pointerup", end);
    thumb.addEventListener("pointercancel", end);
  }

  return (
    <div ref={frameRef} className={`list-frame ${className}`.trim()}>
      {children}
      <div className="list-depth" aria-hidden="true" />
      <div ref={trackRef} className="scroll-rail" aria-hidden="true" onPointerDown={onTrackPointerDown}>
        <div ref={thumbRef} className="scroll-rail-thumb" />
      </div>
    </div>
  );
}
