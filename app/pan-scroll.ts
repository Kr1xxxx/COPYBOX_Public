// Holding the 常用值 row and moving sideways slides it: its scrollbar is hidden, and a mouse has no other way to reach
// the values cut off at the right (Krix, 2026-10-19). The six-dot handle still reorders instead of sliding.
import { useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

export function usePanScroll() {
  const slid = useRef(false);
  return {
    // The window hears the move and the release: capturing the pointer would retarget the release and lose the click on a value.
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      slid.current = false;
      if (event.button !== 0 || (event.target as HTMLElement).closest(".var-grip")) return;
      const bar = event.currentTarget;
      const startX = event.clientX;
      const startLeft = bar.scrollLeft;
      let moved = false;
      const move = (pointer: PointerEvent) => {
        if (!moved && Math.abs(pointer.clientX - startX) < 6) return;
        moved = true;
        bar.scrollLeft = startLeft - (pointer.clientX - startX);
      };
      const release = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", release); window.removeEventListener("pointercancel", release); slid.current = moved; };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", release);
      window.addEventListener("pointercancel", release);
    },
    // releasing after a slide is not a click on the value under the pointer: nothing is filled
    onClickCapture(event: ReactMouseEvent<HTMLElement>) { if (slid.current) { event.stopPropagation(); event.preventDefault(); } slid.current = false; },
  };
}
