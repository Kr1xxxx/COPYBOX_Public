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
