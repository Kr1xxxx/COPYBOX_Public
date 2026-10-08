function createClipboardWriter(clipboard) {
  let timer;
  return (text, seconds = 60) => {
    if (typeof text !== "string") throw new TypeError("Clipboard text must be a string");
    clipboard.writeText(text);
    clearTimeout(timer);
    timer = undefined;
    const delay = [0, 30, 60, 300].includes(seconds) ? seconds : 60;
    if (delay === 0) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (clipboard.readText() !== text) return;
      if (typeof clipboard.clear === "function") clipboard.clear();
      else clipboard.writeText("");
    }, delay * 1000);
    timer.unref?.();
  };
}

function isTrustedClipboardRequest(event, window, origin) {
  if (!window || window.isDestroyed() || event.sender !== window.webContents
    || !event.senderFrame || event.senderFrame !== event.sender.mainFrame) return false;
  try { return new URL(event.senderFrame.url).origin === origin; } catch { return false; }
}

module.exports = { createClipboardWriter, isTrustedClipboardRequest };
