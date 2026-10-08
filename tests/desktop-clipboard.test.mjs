import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

test('desktop copy expires after 60 seconds, without a renderer or focused window', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { createClipboardWriter } = require('../desktop/clipboard.cjs');
  let text = '';
  const write = createClipboardWriter({ writeText: value => { text = value; }, readText: () => text });
  write('synthetic');
  t.mock.timers.tick(59_999); assert.equal(text, 'synthetic');
  t.mock.timers.tick(1); assert.equal(text, '');
});

test('a new copy gets its own expiry and never erases another app’s text', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { createClipboardWriter } = require('../desktop/clipboard.cjs');
  let text = '';
  const write = createClipboardWriter({ writeText: value => { text = value; }, readText: () => text });
  write('first'); t.mock.timers.tick(30_000); write('second');
  t.mock.timers.tick(30_000); assert.equal(text, 'second');
  text = 'external clipboard'; t.mock.timers.tick(30_000); assert.equal(text, 'external clipboard');
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
