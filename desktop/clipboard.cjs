function createClipboardWriter(clipboard) {
  let timer;
  return (text) => {
    if (typeof text !== "string") throw new TypeError("Clipboard text must be a string");
    clipboard.writeText(text);
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      if (clipboard.readText() === text) clipboard.writeText("");
    }, 60_000);
    timer.unref?.();
  };
}

function isTrustedClipboardRequest(event, window, origin) {
  if (!window || window.isDestroyed() || event.sender !== window.webContents
    || !event.senderFrame || event.senderFrame !== event.sender.mainFrame) return false;
  try { return new URL(event.senderFrame.url).origin === origin; } catch { return false; }
}

module.exports = { createClipboardWriter, isTrustedClipboardRequest };
