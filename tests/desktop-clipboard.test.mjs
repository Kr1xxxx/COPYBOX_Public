import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

test('desktop copy writes the text and never clears the clipboard later', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { createClipboardWriter } = require('../desktop/clipboard.cjs');
  let text = '';
  const write = createClipboardWriter({ writeText: value => { text = value; }, readText: () => text });
  write('synthetic');
  t.mock.timers.tick(600_000);
  assert.equal(text, 'synthetic');
  assert.throws(() => write(null), /text/i);
});

test('clipboard IPC accepts only the app main frame at the expected origin', () => {
  const { isTrustedClipboardRequest } = require('../desktop/clipboard.cjs');
  const frame = { url: 'http://127.0.0.1:47831/' };
  const sender = { mainFrame: frame };
  const window = { isDestroyed: () => false, webContents: sender };
  assert.equal(isTrustedClipboardRequest({ sender, senderFrame: frame }, window, 'http://127.0.0.1:47831'), true);
  assert.equal(isTrustedClipboardRequest({ sender: {}, senderFrame: frame }, window, 'http://127.0.0.1:47831'), false);
  assert.equal(isTrustedClipboardRequest({ sender, senderFrame: { ...frame } }, window, 'http://127.0.0.1:47831'), false);
  frame.url = 'https://example.com/';
  assert.equal(isTrustedClipboardRequest({ sender, senderFrame: frame }, window, 'http://127.0.0.1:47831'), false);
  assert.equal(isTrustedClipboardRequest({ sender, senderFrame: null }, window, 'http://127.0.0.1:47831'), false);
});

function fakeImageClipboard({ empty = false } = {}) {
  const calls = { created: [], written: [] };
  const nativeImage = {
    createFromBuffer: buffer => {
      calls.created.push(buffer);
      return { isEmpty: () => empty, tag: 'image' };
    },
  };
  const clipboard = { writeImage: image => { calls.written.push(image); } };
  return { calls, nativeImage, clipboard };
}

test('image copy writes the image built from Uint8Array or ArrayBuffer bytes', () => {
  const { createImageClipboardWriter } = require('../desktop/clipboard.cjs');
  const { calls, nativeImage, clipboard } = fakeImageClipboard();
  const write = createImageClipboardWriter(clipboard, nativeImage);
  write(new Uint8Array([1, 2, 3]));
  write(new Uint8Array([4, 5]).buffer);
  assert.equal(calls.written.length, 2);
  assert.equal(calls.written[0].tag, 'image');
  assert.deepEqual([...calls.created[0]], [1, 2, 3]);
  assert.deepEqual([...calls.created[1]], [4, 5]);
});

test('image copy rejects non-bytes, empty, oversized and non-image input', () => {
  const { createImageClipboardWriter, IMAGE_CLIPBOARD_MAX_BYTES } = require('../desktop/clipboard.cjs');
  assert.equal(IMAGE_CLIPBOARD_MAX_BYTES, 40 * 1024 * 1024);
  const { calls, nativeImage, clipboard } = fakeImageClipboard();
  const write = createImageClipboardWriter(clipboard, nativeImage);
  assert.throws(() => write('text'), TypeError);
  assert.throws(() => write(null), TypeError);
  assert.throws(() => write([1, 2, 3]), TypeError);
  assert.throws(() => write(new Uint8Array(0)), /empty/i);
  assert.throws(() => write(new ArrayBuffer(0)), /empty/i);
  assert.throws(() => write(new Uint8Array(IMAGE_CLIPBOARD_MAX_BYTES + 1)), /large/i);
  assert.equal(calls.written.length, 0);
  const empty = fakeImageClipboard({ empty: true });
  const writeEmpty = createImageClipboardWriter(empty.clipboard, empty.nativeImage);
  assert.throws(() => writeEmpty(new Uint8Array([1])), /Not an image/);
  assert.equal(empty.calls.written.length, 0);
});

test('image copy never clears the clipboard later', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { createImageClipboardWriter } = require('../desktop/clipboard.cjs');
  const { calls, nativeImage, clipboard } = fakeImageClipboard();
  clipboard.clear = () => { throw new Error('must not clear'); };
  clipboard.writeText = () => { throw new Error('must not overwrite'); };
  createImageClipboardWriter(clipboard, nativeImage)(new Uint8Array([1]));
  t.mock.timers.tick(600_000);
  assert.equal(calls.written.length, 1);
});

test('main registers clipbox:copy-image behind the trust check and preload exposes copyImage', async () => {
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../desktop/main.cjs', import.meta.url), 'utf8');
  const preload = readFileSync(new URL('../desktop/preload.cjs', import.meta.url), 'utf8');
  assert.match(main, /ipcMain\.handle\("clipbox:copy-image",[^]*?isTrustedClipboardRequest\(event, mainWindow, appOrigin\)[^]*?writeImageClipboard\(bytes\)/);
  assert.match(main, /createImageClipboardWriter\(clipboard, nativeImage\)/);
  assert.match(preload, /copyImage:\s*\(png\)\s*=>\s*ipcRenderer\.invoke\("clipbox:copy-image", png\)/);
});
