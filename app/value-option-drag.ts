// Holding a remembered value of a 话术 block and moving it puts it in another place; the other values slide aside.
// Moved out of page.tsx as it was: the handlers close over the render they were made in, exactly like before.
import { useLayoutEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { moveOption, type PinnedValues, type ValueMemory } from "./variable-memory";

export function useValueOptionDrag(valueMemory: ValueMemory, pinnedValues: PinnedValues, setValueMemory: Dispatch<SetStateAction<ValueMemory>>, setPinnedValues: Dispatch<SetStateAction<PinnedValues>>) {
  const dragOption = useRef<{ name: string; value: string; startX: number; startLeft: number; moved: boolean; grab: number; element: HTMLElement } | null>(null);
  // Holding a listed value and moving it drags it to another place in the list.
  // The other values slide to their new places while one is dragged (first, last, invert, play).
  const optionLefts = useRef<Map<string, number>>(new Map());
  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, number>();
    document.querySelectorAll<HTMLElement>(".var-memory-option").forEach((element) => {
      const key = `${element.closest(".var-memory-group")?.getAttribute("aria-label")}|${element.dataset.optionValue}`;
      next.set(key, element.offsetLeft);
      const before = optionLefts.current.get(key);
      if (reduce || before === undefined || before === element.offsetLeft || "dragging" in element.dataset) return;
      element.animate([{ transform: `translateX(${before - element.offsetLeft}px)` }, { transform: "none" }], { duration: 180, easing: "cubic-bezier(.22,1,.36,1)" });
    });
    optionLefts.current = next;
  });

  function startOptionDrag(event: React.PointerEvent<HTMLButtonElement>, name: string, value: string) {
    const element = event.currentTarget.closest<HTMLElement>(".var-memory-option");
    if (event.button !== 0 || !element) return;
    dragOption.current = { name, value, startX: event.clientX, startLeft: element.offsetLeft, moved: false, grab: event.clientX - element.getBoundingClientRect().left, element };
    event.currentTarget.setPointerCapture(event.pointerId);
    // Reordering moves the value in the page, which can drop the pointer capture; the window still hears the move and the release.
    const move = (pointerEvent: PointerEvent) => moveOptionDrag(pointerEvent.clientX);
    const release = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", release); window.removeEventListener("pointercancel", release); endOptionDrag(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
  }
  function moveOptionDrag(clientX: number) {
    const drag = dragOption.current;
    if (!drag) return;
    if (!drag.moved && Math.abs(clientX - drag.startX) < 6) return;
    if (!drag.moved) { drag.element.dataset.dragging = ""; drag.element.style.transition = "none"; }
    drag.moved = true;
    // Hit-test where the pointer is, on layout positions (not painted ones), so values that are still sliding do not confuse the swap.
    const shift = clientX - drag.startX - (drag.element.offsetLeft - drag.startLeft);
    const centre = drag.element.offsetLeft + shift + drag.grab;
    const over = Array.from(drag.element.parentElement?.querySelectorAll<HTMLElement>(".var-memory-option") || []).find((element) => element !== drag.element && centre >= element.offsetLeft && centre <= element.offsetLeft + element.offsetWidth);
    if (over) {
    const outcome = moveOption(valueMemory, pinnedValues, drag.name, drag.value, over.dataset.optionValue || "");
    if (outcome.memory !== valueMemory || outcome.pins !== pinnedValues) { setValueMemory(outcome.memory); setPinnedValues(outcome.pins); }
    }
    // the held value follows the pointer, even after the others have slid into new places
    drag.element.style.transform = `translateX(${shift}px)`;
  }
  function endOptionDrag() {
    const held = dragOption.current;
    if (held?.moved) {
      const element = held.element;
      delete element.dataset.dragging;
      element.style.transition = "transform .18s cubic-bezier(.22,1,.36,1)";
      element.style.transform = "";
      window.setTimeout(() => { element.style.transition = ""; }, 200);
    }
    dragOption.current = null;
  }

  return { startOptionDrag };
}
