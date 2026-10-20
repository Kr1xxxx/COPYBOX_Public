import assert from 'node:assert/strict';
import test from 'node:test';
import { pageHarness, seed } from './helpers/page-harness.mjs';

test('failed startup never overwrites the existing vault or device key', async () => {
  const h = await pageHarness(); await seed(h);
  const original = h.storage.get('vault'), key = h.storage.get('key');
  h.c.decryptVault = async () => { throw new Error('injected decode failure'); };
  await h.c.openVault();
  assert.equal(h.storage.get('key'), key);
  assert.equal(h.storage.get('vault'), original);
  assert.equal(h.c.opened, undefined);
  assert.ok(h.c.startupError);
});

test('opening an existing healthy vault does not rewrite it', async () => {
  const h = await pageHarness(); await seed(h);
  const original = h.storage.get('vault'); h.rejectNextWrite();
  await h.c.openVault();
  assert.equal(h.storage.get('vault'), original);
  assert.equal(h.c.opened.items.length, 1);
  assert.equal(h.writes.length, 0);
});

test('background addition survives an overlapping editor save', async () => {
  const h = await pageHarness(); await seed(h);
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const encrypt = h.c.encryptVault; let first = true;
  h.c.encryptVault = async (...args) => { if (first) { first = false; entered(); await gate; } return encrypt(...args); };
  h.c.command({ requestId: 'add', command: { action: 'add', title: 'Background', content: 'synthetic', folder: '询盘接待' } });
  await started;
  h.c.editing = h.c.itemsRef.current[0];
  const save = h.c.saveItem({ ...h.c.editing, label: 'UI edit' });
  release(); await save; await h.c.automationQueueRef.current; await h.c.persistQueueRef.current;
  const final = await h.c.decryptVault(JSON.parse(h.storage.get('vault')), h.c.deviceKey);
  assert.equal(h.responses[0].response.ok, true);
  assert.equal(final.items.length, 2);
  assert.ok(final.items.some(item => item.label === 'Background'));
  assert.ok(final.items.some(item => item.label === 'UI edit'));
});

test('save-and-copy uses the same expiring desktop clipboard path', async () => {
  const h = await pageHarness();
  Object.assign(h.c, { busy: false, label: 'Title', secret: 'synthetic', kind: 'secret', structured: false, segmentedSecret: false, referenceNote: '', color: '#fff', item: null, folder: '', folders: [], copyOnSubmitRef: { current: true }, setBusy: () => {}, setSaveError: () => {}, onSave: async () => {}, onCopy: text => h.c.copyTextWithExpiry(text) });
  await h.c.submit({ preventDefault() {} });
  assert.deepEqual(h.copyCalls, ['synthetic']);
});

test('missing device key blocks loading without modifying ciphertext', async () => {
  const h = await pageHarness(); await seed(h);
  const original = h.storage.get('vault'); h.storage.delete('key');
  await assert.rejects(h.c.openVault(), /key is missing/);
  assert.equal(h.storage.get('vault'), original);
  assert.equal(h.storage.has('key'), false);
});

test('a failed editor write is not committed and does not poison the next command', async () => {
  const h = await pageHarness(); await seed(h);
  const original = h.storage.get('vault'); h.c.editing = h.c.itemsRef.current[0];
  h.rejectNextWrite();
  await assert.rejects(h.c.saveItem({ ...h.c.editing, label: 'Failed edit' }), /write failure/);
  assert.equal(h.c.itemsRef.current[0].label, 'Original');
  assert.equal(h.storage.get('vault'), original);
  h.c.command({ requestId: 'next', command: { action: 'add', title: 'Next', content: 'synthetic', folder: '询盘接待' } });
  await h.c.persistQueueRef.current;
  const final = await h.c.decryptVault(JSON.parse(h.storage.get('vault')), h.c.deviceKey);
  assert.equal(h.responses[0].response.ok, true);
  assert.equal(final.items.length, 2);
  assert.ok(final.items.some(item => item.label === 'Original'));
});

test('queued commands read the editor result and allocate distinct snippet numbers', async () => {
  const h = await pageHarness(); await seed(h);
  h.c.editing = h.c.itemsRef.current[0];
  const edit = h.c.saveItem({ ...h.c.editing, label: 'Edited first' });
  for (const name of ['A', 'B']) h.c.command({ requestId: name, command: { action: 'add', title: name, content: 'synthetic', folder: '询盘接待' } });
  await edit; await h.c.persistQueueRef.current;
  const final = await h.c.decryptVault(JSON.parse(h.storage.get('vault')), h.c.deviceKey);
  assert.equal(final.items.length, 3);
  assert.equal(new Set(final.items.map(item => item.snippetNumber)).size, 3);
  assert.ok(final.items.some(item => item.label === 'Edited first'));
  assert.equal(h.responses.length, 2);
});

test('no vault but a copy from a cut-off import: asks first instead of quietly starting empty (D-096)', async () => {
  const h = await pageHarness();
  h.c.hasStashedBackup = async () => true;
  await h.c.openVault();
  assert.equal(h.storage.has('vault'), false);
  assert.equal(h.c.opened, undefined);
  assert.equal(typeof h.c.leftoverStart, 'function');
  // 「先不恢复」 starts empty as before.
  await h.c.leftoverStart()();
  assert.ok(h.storage.has('vault'));
  assert.equal(h.c.opened.items.length, 0);
});

test('no vault and nothing stashed: starts empty straight away', async () => {
  const h = await pageHarness();
  await h.c.openVault();
  assert.ok(h.storage.has('vault'));
  assert.equal(h.c.leftoverStart, undefined);
});
