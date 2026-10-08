"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { pointerDragReducer, type PointerDragState } from "./pointer-reorder";

type PointerReorderOptions = {
  enabled: boolean;
  scope: string;
  onDrop: (sourceId: string, targetId: string) => void | Promise<void>;
};

type DragSession = {
  state: Exclude<PointerDragState, null>;
  handle: HTMLElement;
  dragged: HTMLElement | null;
  originalPointerEvents: string;
  removeListeners: () => void;
};

export function usePointerReorder({ enabled, scope, onDrop }: PointerReorderOptions) {
  const [draggingId, setDraggingId] = useState("");
  const [overId, setOverId] = useState("");
  const sessionRef = useRef<DragSession | null>(null);
  const enabledRef = useRef(enabled);
  const onDropRef = useRef(onDrop);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    onDropRef.current = onDrop;
  }, [onDrop]);

  const clearSession = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return null;
    session.removeListeners();
    if (session.handle.hasPointerCapture(session.state.pointerId)) {
      session.handle.releasePointerCapture(session.state.pointerId);
    }
    if (session.dragged) {
      session.dragged.style.removeProperty("transform");
      session.dragged.style.pointerEvents = session.originalPointerEvents;
    }
    sessionRef.current = null;
    return session;
  }, []);

  const finish = useCallback((shouldDrop: boolean, updateVisualState = true) => {
    const session = clearSession();
    if (!session) return;
    if (updateVisualState) {
      setDraggingId("");
      setOverId("");
    }
    if (shouldDrop && session.state.active && session.state.sourceId !== session.state.overId) {
      void onDropRef.current(session.state.sourceId, session.state.overId);
    }
  }, [clearSession]);

  const cancelPointerDrag = useCallback(() => finish(false), [finish]);

  const beginPointerDrag = useCallback((event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (!enabledRef.current || event.button !== 0 || sessionRef.current) return;
    const handle = event.currentTarget;
    const dragged = handle.closest<HTMLElement>(`[data-sort-scope="${CSS.escape(scope)}"]`);
    const initial = pointerDragReducer(null, {
      type: "start",
      id,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    });
    if (!initial) return;

    handle.setPointerCapture(event.pointerId);
    setDraggingId(id);
    setOverId(id);

    const move = (pointerEvent: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || pointerEvent.pointerId !== session.state.pointerId) return;
      if (session.dragged) session.dragged.style.pointerEvents = "none";
      const target = document
        .elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)
        ?.closest<HTMLElement>(`[data-sort-scope="${CSS.escape(scope)}"]`);
      const targetId = target?.dataset.sortId || "";
      const next = pointerDragReducer(session.state, {
        type: "move",
        pointerId: pointerEvent.pointerId,
        x: pointerEvent.clientX,
        y: pointerEvent.clientY,
        overId: targetId,
      });
      if (!next) return;
      if (!next.active && session.dragged) session.dragged.style.pointerEvents = session.originalPointerEvents;
      if (next.active) {
        pointerEvent.preventDefault();
        if (session.dragged) {
          session.dragged.style.pointerEvents = "none";
          session.dragged.style.transform = `translate3d(0, ${pointerEvent.clientY - next.startY}px, 0)`;
        }
      }
      if (next.active !== session.state.active || next.overId !== session.state.overId) {
        setOverId(next.overId);
      }
      session.state = next;
    };
    const up = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId === sessionRef.current?.state.pointerId) finish(true);
    };
    const cancel = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId === sessionRef.current?.state.pointerId) finish(false);
    };
    const keydown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") finish(false);
    };
    const removeListeners = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", keydown);
    };
    sessionRef.current = {
      state: initial,
      handle,
      dragged,
      originalPointerEvents: dragged?.style.pointerEvents || "",
      removeListeners,
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", keydown);
  }, [finish, scope]);

  useEffect(() => {
    if (enabled) return;
    clearSession();
    const frame = window.requestAnimationFrame(() => {
      setDraggingId("");
      setOverId("");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [clearSession, enabled]);

  useEffect(() => () => finish(false, false), [finish]);

  return { draggingId, overId, beginPointerDrag, cancelPointerDrag };
}
