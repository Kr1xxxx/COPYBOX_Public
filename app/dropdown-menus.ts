// Behaviour shared by the list's pop-up menus (全部产品 filter, a row's ⋯ menu, bulk 移动到, folder menu). Moved out of page.tsx as it was.
import { useEffect } from "react";

type Closers = { all: () => void; rowAndBulk: () => void; product: () => void };

// Close on a click or touch anywhere outside, and on Esc. Clicking inside the filter only closes the row and bulk menus,
// inside a row's menu wrapper only the filter; the folder menu has its own scrim and toggle.
export function useDropdownDismiss(open: boolean, closers: Closers) {
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".folder-menu, .folder-more")) return;
      if (target?.closest(".product-filter-wrap")) { closers.rowAndBulk(); return; }
      if (target?.closest(".menu-wrap")) { closers.product(); return; }
      closers.all();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") closers.all(); };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", escape); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the closers only call state setters, which never change
  }, [open]);
}

// A row's ⋯ menu opens downward, but flips above the button when it would run past the bottom of the window.
export function useRowMenuPlacement(rowMenuId: string) {
  useEffect(() => {
    if (!rowMenuId) return;
    const frame = requestAnimationFrame(() => {
      const menu = document.querySelector<HTMLElement>(".row-menu");
      const anchor = menu?.parentElement?.querySelector<HTMLElement>(".icon-button");
      if (!menu || !anchor) return;
      const height = menu.offsetHeight;
      const room = window.innerHeight - anchor.getBoundingClientRect().bottom - 12;
      const above = anchor.getBoundingClientRect().top - 12;
      const up = height > room && above > room;
      menu.style.top = up ? "auto" : "";
      menu.style.bottom = up ? "34px" : "";
      menu.style.transformOrigin = up ? "bottom right" : "";
      menu.style.maxHeight = `${Math.max(120, Math.floor(up ? above : room))}px`;
      menu.style.overflowY = "auto";
    });
    return () => cancelAnimationFrame(frame);
  }, [rowMenuId]);
}
