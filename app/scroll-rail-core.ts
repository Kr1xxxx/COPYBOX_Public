// Pure math for the thin scroll indicator on the right of the 话术 / 账号 lists (app/list-scroll-rail.tsx).

export type ScrollMetrics = { scrollTop: number; scrollHeight: number; clientHeight: number };
export type RailThumb = { visible: boolean; size: number; offset: number };

export const RAIL_MIN_THUMB = 24;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// How far the list can scroll; under 1px counts as "fits" (rounding in the browser).
export function scrollOverflow({ scrollHeight, clientHeight }: ScrollMetrics) {
  const overflow = scrollHeight - clientHeight;
  return overflow > 1 ? overflow : 0;
}

// Thumb length = the visible share of the list (at least `minThumb`), position = how far down the list is scrolled.
export function railThumb(metrics: ScrollMetrics, trackLength: number, minThumb = RAIL_MIN_THUMB): RailThumb {
  const overflow = scrollOverflow(metrics);
  if (!overflow || trackLength <= 0 || metrics.scrollHeight <= 0) return { visible: false, size: 0, offset: 0 };
  const size = clamp(Math.round(trackLength * (metrics.clientHeight / metrics.scrollHeight)), Math.min(minThumb, trackLength), trackLength);
  const progress = clamp(metrics.scrollTop / overflow, 0, 1);
  return { visible: true, size, offset: Math.round((trackLength - size) * progress * 10) / 10 };
}

// Dragging the thumb by `delta` px along the track: the scrollTop that keeps the thumb under the pointer.
export function scrollTopForThumbDrag(startScrollTop: number, delta: number, metrics: ScrollMetrics, trackLength: number, minThumb = RAIL_MIN_THUMB) {
  const overflow = scrollOverflow(metrics);
  const { size } = railThumb(metrics, trackLength, minThumb);
  const room = trackLength - size;
  if (!overflow || room <= 0) return clamp(startScrollTop, 0, overflow);
  return clamp(startScrollTop + delta * (overflow / room), 0, overflow);
}

// Clicking the empty track above or below the thumb moves one page (90% of the visible height) toward the click.
export function scrollTopForTrackClick(clickOffset: number, metrics: ScrollMetrics, trackLength: number, minThumb = RAIL_MIN_THUMB) {
  const overflow = scrollOverflow(metrics);
  const { size, offset } = railThumb(metrics, trackLength, minThumb);
  if (!overflow) return 0;
  const page = Math.max(1, Math.round(metrics.clientHeight * 0.9));
  if (clickOffset < offset) return clamp(metrics.scrollTop - page, 0, overflow);
  if (clickOffset > offset + size) return clamp(metrics.scrollTop + page, 0, overflow);
  return metrics.scrollTop;
}
