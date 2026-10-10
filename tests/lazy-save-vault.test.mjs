import assert from 'node:assert/strict';
import test from 'node:test';
import { createLazyWriter } from '../app/lazy-writer.ts';
import { pageHarness, seed } from './helpers/page-harness.mjs';

async function lazyHarness() {
  const h = await pageHarness();
  const data = await seed(h);
  h.c.sharedSeenRef.current = ['company-1', 'company-2'];
  h.c.lazyWriterRef.current = createLazyWriter({ write: () => h.c.enqueueVaultTask(() => h.c.storeVault(h.c.readVault())) });
  const stored = async () => h.c.decryptVault(JSON.parse(h.storage.get('vault')), h.c.deviceKey);
  // like callers that build a fresh object and do not carry sharedSeen along
  const pin = (current) => ({ items: current.items.map((item) => ({ ...item, pinned: true })), folders: current.folders, nextSnippetNumber: current.nextSnippetNumber });
  return { h, data, stored, pin };
}

test('a lazy change is not written until it is flushed, and is then written once', async () => {
  const { h, stored, pin } = await lazyHarness();
  await h.c.persistLazy(pin);
  assert.equal(h.writes.length, 0);
  assert.equal(h.c.itemsRef.current[0].pinned, true, 'memory already has the change');
  await h.c.lazyWriterRef.current.flush();
  await h.c.lazyWriterRef.current.flush();
  assert.equal(h.writes.length, 1);
  assert.equal((await stored()).items[0].pinned, true);
});

test('the record of company snippets already received (sharedSeen) survives a lazy change', async () => {
  const { h, stored, pin } = await lazyHarness();
  await h.c.persistLazy(pin);
  await h.c.lazyWriterRef.current.flush();
  assert.deepEqual((await stored()).sharedSeen, ['company-1', 'company-2']);
});

test('an immediate save after a lazy change keeps both, and leaves nothing waiting', async () => {
  const { h, stored, pin } = await lazyHarness();
  await h.c.persistLazy(pin);
  await h.c.persist((current) => ({ ...current, nextSnippetNumber: current.nextSnippetNumber + 1 }));
  const saved = await stored();
  assert.equal(saved.items[0].pinned, true);
  assert.deepEqual(saved.sharedSeen, ['company-1', 'company-2']);
  assert.equal(h.c.lazyWriterRef.current.hasPending(), false);
  const writesBefore = h.writes.length;
  await h.c.lazyWriterRef.current.flush();
  assert.equal(h.writes.length, writesBefore, 'nothing is written twice');
});
