export type PointerDragState = {
  sourceId: string;
  overId: string;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
} | null;

export type PointerDragAction =
  | { type: "start"; id: string; pointerId: number; x: number; y: number }
  | { type: "move"; pointerId: number; x: number; y: number; overId: string }
  | { type: "cancel" };

const ACTIVATION_DISTANCE = 5;

export function pointerDragReducer(state: PointerDragState, action: PointerDragAction): PointerDragState {
  if (action.type === "cancel") return null;
  if (action.type === "start") {
    return {
      sourceId: action.id,
      overId: action.id,
      pointerId: action.pointerId,
      startX: action.x,
      startY: action.y,
      active: false,
    };
  }
  if (!state || action.pointerId !== state.pointerId) return state;

  const distance = Math.hypot(action.x - state.startX, action.y - state.startY);
  const active = state.active || distance >= ACTIVATION_DISTANCE;
  const overId = active && action.overId ? action.overId : state.overId;
  if (active === state.active && overId === state.overId) return state;
  return { ...state, active, overId };
}
