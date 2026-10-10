// Asks the page to save anything it is still holding back (see app/lazy-writer.ts) and waits for its answer,
// but never longer than `timeoutMs`, so a stuck page cannot keep Clipbox from quitting.
function createFlushRequester({ canRequest, send, timeoutMs = 1500, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let waiting = [];

  return {
    request() {
      if (!canRequest()) return Promise.resolve(false);
      return new Promise((resolve) => {
        const entry = { resolve };
        entry.timer = setTimer(() => {
          waiting = waiting.filter((other) => other !== entry);
          resolve(false);
        }, timeoutMs);
        waiting.push(entry);
        try {
          send();
        } catch {
          this.done();
        }
      });
    },
    done() {
      const entries = waiting;
      waiting = [];
      for (const entry of entries) {
        clearTimer(entry.timer);
        entry.resolve(true);
      }
    },
  };
}

module.exports = { createFlushRequester };
