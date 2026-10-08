"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import { buildFlipTransitions, type SortPosition } from "./reorder-animation";

const SORT_DURATION_MS = 220;
const SORT_EASING = "cubic-bezier(0.77, 0, 0.175, 1)";

type SortSnapshot = { scope: string; positions: Map<string, SortPosition> };

function sortableElements(scope: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-sort-scope="${CSS.escape(scope)}"]`));
}

function capturePositions(scope: string) {
  return new Map(sortableElements(scope).flatMap((element) => {
    const id = element.dataset.sortId;
    if (!id) return [];
    const rect = element.getBoundingClientRect();
    return [[id, { left: rect.left, top: rect.top }] as const];
  }));
}

export function useSortFlipAnimation() {
  const pendingRef = useRef<SortSnapshot | null>(null);
  const animationByElementRef = useRef(new WeakMap<HTMLElement, Animation>());
  const activeAnimationsRef = useRef(new Set<Animation>());

  const cancelActiveAnimations = useCallback(() => {
    for (const animation of activeAnimationsRef.current) animation.cancel();
    activeAnimationsRef.current.clear();
  }, []);

  const prepareSortAnimation = useCallback((scope: string) => {
    const positions = capturePositions(scope);
    cancelActiveAnimations();
    pendingRef.current = { scope, positions };
  }, [cancelActiveAnimations]);

  useLayoutEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const elements = new Map(sortableElements(pending.scope).flatMap((element) => {
      const id = element.dataset.sortId;
      return id ? [[id, element] as const] : [];
    }));
    const after = capturePositions(pending.scope);
    for (const transition of buildFlipTransitions(pending.positions, after)) {
      const element = elements.get(transition.id);
      if (!element) continue;
      animationByElementRef.current.get(element)?.cancel();
      const animation = element.animate(
        [
          { transform: transition.transform, composite: "add" },
          { transform: "translate3d(0, 0, 0)", composite: "add" },
        ],
        { duration: SORT_DURATION_MS, easing: SORT_EASING },
      );
      animationByElementRef.current.set(element, animation);
      activeAnimationsRef.current.add(animation);
      void animation.finished.catch(() => undefined).finally(() => {
        activeAnimationsRef.current.delete(animation);
        if (animationByElementRef.current.get(element) === animation) animationByElementRef.current.delete(element);
      });
    }
  });

  useLayoutEffect(() => () => cancelActiveAnimations(), [cancelActiveAnimations]);

  return { prepareSortAnimation };
}
