import assert from "node:assert/strict";
import test from "node:test";
import { railThumb, scrollOverflow, scrollTopForThumbDrag, scrollTopForTrackClick } from "../app/scroll-rail-core.ts";

const list = (scrollTop) => ({ scrollTop, scrollHeight: 2000, clientHeight: 500 });

test("a list that fits has no thumb", () => {
  assert.equal(scrollOverflow({ scrollTop: 0, scrollHeight: 500, clientHeight: 500 }), 0);
  assert.equal(scrollOverflow({ scrollTop: 0, scrollHeight: 500.6, clientHeight: 500 }), 0); // browser rounding
  assert.deepEqual(railThumb({ scrollTop: 0, scrollHeight: 500, clientHeight: 500 }, 480), { visible: false, size: 0, offset: 0 });
  assert.equal(railThumb(list(0), 0).visible, false);
});

test("thumb length is the visible share, its place is the scroll progress", () => {
  assert.deepEqual(railThumb(list(0), 400), { visible: true, size: 100, offset: 0 });
  assert.deepEqual(railThumb(list(750), 400), { visible: true, size: 100, offset: 150 });
  assert.deepEqual(railThumb(list(1500), 400), { visible: true, size: 100, offset: 300 });
  assert.deepEqual(railThumb(list(9999), 400), { visible: true, size: 100, offset: 300 }); // overscroll clamps
  assert.deepEqual(railThumb(list(-20), 400), { visible: true, size: 100, offset: 0 });
});

test("a very long list keeps a thumb that can still be grabbed", () => {
  const long = { scrollTop: 0, scrollHeight: 100000, clientHeight: 500 };
  assert.equal(railThumb(long, 400).size, 24);
  assert.equal(railThumb(long, 10).size, 10); // never longer than the track
  assert.equal(railThumb({ ...long, scrollTop: long.scrollHeight - long.clientHeight }, 400).offset, 376);
});

test("dragging the thumb maps track pixels to list pixels", () => {
  // Track 400, thumb 100: 300px of track cover 1500px of list → 5px per px.
  assert.equal(scrollTopForThumbDrag(0, 60, list(0), 400), 300);
  assert.equal(scrollTopForThumbDrag(750, -30, list(750), 400), 600);
  assert.equal(scrollTopForThumbDrag(0, 1000, list(0), 400), 1500);
  assert.equal(scrollTopForThumbDrag(100, -1000, list(100), 400), 0);
});

test("clicking the track pages toward the click", () => {
  assert.equal(scrollTopForTrackClick(380, list(0), 400), 450); // below the thumb: one page (90% of 500) down
  assert.equal(scrollTopForTrackClick(10, list(750), 400), 300); // above: one page up
  assert.equal(scrollTopForTrackClick(180, list(750), 400), 750); // on the thumb: stays
  assert.equal(scrollTopForTrackClick(390, list(1400), 400), 1500); // clamps at the end
  assert.equal(scrollTopForTrackClick(5, list(100), 400), 0);
});
