import type { AnimationEvent } from "react";

// Each list row slides in once (the `row-in` keyframes in globals.css). When React moves a row in the DOM — a
// starred snippet jumping to the top, a card dropped after a drag — the browser restarts that animation, so the rows
// flicker in again. Once a row has finished its entrance we mark the DOM node itself (React does not manage this
// attribute, so it survives re-renders and moves) and the CSS stops replaying the animation for it.
export function onRowAnimationEnd(event: AnimationEvent<HTMLElement>) {
  if (event.animationName !== "row-in") return;
  const target = event.target;
  if (!(target instanceof HTMLElement) || !target.classList.contains("native-row")) return;
  target.dataset.entered = "";
}
