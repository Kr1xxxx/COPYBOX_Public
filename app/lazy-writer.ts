// Delays a write until the person has stopped changing things for a moment, so quick bursts (copying a few
// snippets in a row, dragging a card) cost one save instead of many. Everything that must not be lost calls
// `flush()` first: quitting, hiding the window, sleep, reload. `write` saves the CURRENT state, so a later
// immediate save naturally covers earlier lazy changes and `cancel()` drops the now-redundant timer.

export type LazyWriter = {
  /** Something changed in memory but is not saved yet; (re)starts the countdown. */
  markDirty: () => void;
  /** Saves right now if anything is waiting, and resolves when it is on disk (or failed). */
  flush: () => Promise<void>;
  /** An immediate save already covered everything: forget the pending one. */
  cancel: () => void;
  hasPending: () => boolean;
};

export function createLazyWriter({ delayMs = 1000, write, onError, setTimer = (callback, ms) => setTimeout(callback, ms), clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) }: {
  delayMs?: number;
  write: () => Promise<void>;
  onError?: (error: unknown) => void;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}): LazyWriter {
  let dirty = false;
  let timer: unknown;
  let running: Promise<void> | undefined;

  function stopTimer() {
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
  }

  function run(): Promise<void> {
    stopTimer();
    if (!dirty) return running ?? Promise.resolve();
    dirty = false;
    const attempt = (running ?? Promise.resolve()).then(write).catch((error) => {
      dirty = true; // keep it for the next flush or save
      onError?.(error);
    });
    const tracked = attempt.finally(() => { if (running === tracked) running = undefined; });
    running = tracked;
    return tracked;
  }

  return {
    markDirty() {
      dirty = true;
      stopTimer();
      timer = setTimer(() => { void run(); }, delayMs);
    },
    flush: run,
    cancel() {
      dirty = false;
      stopTimer();
    },
    hasPending: () => dirty || running !== undefined,
  };
}
