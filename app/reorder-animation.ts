export type SortPosition = { left: number; top: number };

export type FlipTransition = { id: string; transform: string };

export function buildFlipTransitions(
  before: Map<string, SortPosition>,
  after: Map<string, SortPosition>,
): FlipTransition[] {
  const transitions: FlipTransition[] = [];
  for (const [id, next] of after) {
    const previous = before.get(id);
    if (!previous) continue;
    const x = previous.left - next.left;
    const y = previous.top - next.top;
    if (x === 0 && y === 0) continue;
    transitions.push({ id, transform: `translate3d(${x}px, ${y}px, 0)` });
  }
  return transitions;
}
