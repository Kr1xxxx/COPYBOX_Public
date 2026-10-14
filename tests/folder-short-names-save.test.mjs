// D-048: the short names set for own folders go through every vault save path and the encrypted backup unharmed.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as core from '../app/clipbox-core.ts';
import { createLazyWriter } from '../app/lazy-writer.ts';
import { pageHarness, seed } from './helpers/page-harness.mjs';

async function harness() {
  const h = await pageHarness();
  await seed(h);
  h.c.lazyWriterRef.current = createLazyWriter({ write: () => h.c.enqueueVaultTask(() => h.c.storeVault(h.c.readVault())) });
  await h.c.persist((current) => ({ ...current, folders: core.addFolder(current.folders, 'snippet', '客户跟单').folders }));
  await h.c.persist((current) => core.setFolderShortName(current, 'snippet', '客户跟单', '跟单').data);
  const stored = async () => h.c.decryptVault(JSON.parse(h.storage.get('vault')), h.c.deviceKey);
  return { h, stored };
}

test('a short name is written to the encrypted vault and read back on the next start', async () => {
  const { h, stored } = await harness();
  assert.deepEqual(h.c.folderShortNamesRef.current, { snippet: { 客户跟单: '跟单' } });
  assert.deepEqual((await stored()).folderShortNames, { snippet: { 客户跟单: '跟单' } });
  assert.ok(!h.storage.get('vault').includes('跟单'), 'stored encrypted, not as plain text');
});

test('immediate and delayed saves of other changes keep the short names', async () => {
  const { h, stored } = await harness();
  await h.c.persist((current) => ({ ...current, nextSnippetNumber: current.nextSnippetNumber + 1 }));
  await h.c.persistLazy((current) => ({ ...current, items: current.items.map((item) => ({ ...item, pinned: true })) }));
  await h.c.lazyWriterRef.current.flush();
  const saved = await stored();
  assert.equal(saved.items[0].pinned, true);
  assert.deepEqual(saved.folderShortNames, { snippet: { 客户跟单: '跟单' } });
});

test('clearing the last short name removes the field from the saved vault', async () => {
  const { h, stored } = await harness();
  await h.c.persist((current) => core.setFolderShortName(current, 'snippet', '客户跟单', null).data);
  assert.equal(h.c.folderShortNamesRef.current, undefined);
  assert.equal('folderShortNames' in (await stored()), false);
});

test('an encrypted 话术 backup keeps the short names, and an old backup without them restores', async () => {
  const { h } = await harness();
  const backup = JSON.parse(JSON.stringify(await h.c.encryptVault(core.vaultDataForBackupScope(h.c.readVault(), 'snippet'), 'backup-password-1')));
  const opened = await h.c.decryptVault(backup, 'backup-password-1');
  assert.deepEqual(opened.folderShortNames, { snippet: { 客户跟单: '跟单' } });
  const empty = core.normalizeVaultData({ items: [], folders: { secret: [], snippet: [] } });
  assert.deepEqual(core.mergeImportedVaultData(empty, opened, 'replace', () => 'id', 'snippet').data.folderShortNames, { snippet: { 客户跟单: '跟单' } });

  const oldData = core.synchronizeVaultData([], { secret: [], snippet: ['旧目录'] }, 1);
  const oldBackup = JSON.parse(JSON.stringify(await h.c.encryptVault(oldData, 'backup-password-1')));
  const oldOpened = await h.c.decryptVault(oldBackup, 'backup-password-1');
  assert.equal('folderShortNames' in oldOpened, false);
  const merged = core.mergeImportedVaultData(h.c.readVault(), oldOpened, 'merge', () => 'id', 'snippet').data;
  assert.ok(merged.folders.snippet.includes('旧目录'));
  assert.deepEqual(merged.folderShortNames, { snippet: { 客户跟单: '跟单' } }, 'the short names here stay');
});

test('an external (command line) change keeps the short names', async () => {
  const { h, stored } = await harness();
  h.c.command({ requestId: 'r1', command: { action: 'add', title: '新话术', content: 'synthetic content', folder: '询盘接待' } });
  await h.c.automationQueueRef.current; await h.c.persistQueueRef.current;
  assert.equal(h.responses.at(-1).response.ok, true, JSON.stringify(h.responses.at(-1)));
  const saved = await stored();
  assert.equal(saved.items.length, 2);
  assert.deepEqual(saved.folderShortNames, { snippet: { 客户跟单: '跟单' } });
});
