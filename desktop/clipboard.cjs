function createClipboardWriter(clipboard) {
  return (text) => {
    if (typeof text !== "string") throw new TypeError("Clipboard text must be a string");
    clipboard.writeText(text);
  };
}

const IMAGE_CLIPBOARD_MAX_BYTES = 40 * 1024 * 1024;

function createImageClipboardWriter(clipboard, nativeImage) {
  return (bytes) => {
    let view;
    if (bytes instanceof Uint8Array) view = bytes;
    else if (bytes instanceof ArrayBuffer) view = new Uint8Array(bytes);
    else throw new TypeError("Clipboard image must be bytes");
    if (view.byteLength === 0) throw new Error("Clipboard image is empty");
    if (view.byteLength > IMAGE_CLIPBOARD_MAX_BYTES) throw new Error("Clipboard image is too large");
    const image = nativeImage.createFromBuffer(Buffer.from(view));
    if (image.isEmpty()) throw new Error("Not an image");
    clipboard.writeImage(image);
  };
}

function isTrustedClipboardRequest(event, window, origin) {
  if (!window || window.isDestroyed() || event.sender !== window.webContents
    || !event.senderFrame || event.senderFrame !== event.sender.mainFrame) return false;
  try { return new URL(event.senderFrame.url).origin === origin; } catch { return false; }
}

module.exports = { createClipboardWriter, createImageClipboardWriter, IMAGE_CLIPBOARD_MAX_BYTES, isTrustedClipboardRequest };
