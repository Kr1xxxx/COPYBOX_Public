function createClipboardWriter(clipboard) {
  return (text) => {
    if (typeof text !== "string") throw new TypeError("Clipboard text must be a string");
    clipboard.writeText(text);
  };
}

function isTrustedClipboardRequest(event, window, origin) {
  if (!window || window.isDestroyed() || event.sender !== window.webContents
    || !event.senderFrame || event.senderFrame !== event.sender.mainFrame) return false;
  try { return new URL(event.senderFrame.url).origin === origin; } catch { return false; }
}

module.exports = { createClipboardWriter, isTrustedClipboardRequest };
