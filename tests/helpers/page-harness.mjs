import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import * as core from '../../app/clipbox-core.ts';
import * as order from '../../app/clipbox-order.ts';
import * as automation from '../../app/clipbox-automation.ts';
import * as apikeyAutomation from '../../app/apikey-automation.ts';
import * as keyCache from '../../app/key-cache.ts';
import * as writeGate from '../../app/write-gate.ts';
import * as deviceKeyStore from '../../app/device-key-store.ts';
import * as secretSettings from '../../app/secret-settings.ts';

export async function pageHarness() {
  // page.tsx is being split into component files; the editor (saveItem, submit) now lives in item-editor.tsx.
  const sources = ['page.tsx', 'item-editor.tsx'].map(name => {
    const text = fs.readFileSync(new URL(`../../app/${name}`, import.meta.url), 'utf8');
    return { name, text, ast: ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX) };
  });
  let ast;
  const functions = new Map(), hooks = new Map();
  let automationEffect;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(ast));
    if (ts.isVariableDeclaration(node) && node.initializer) hooks.set(node.name.getText(ast), node.initializer.getText(ast));
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes('const remove = window.clipboxDesktop.onAutomationCommand')) automationEffect = node.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  for (const source of sources) { ast = source.ast; visit(ast); }
  let edition = {};
  const editionPath = new URL('../../app/clipbox-edition.ts', import.meta.url);
  if (fs.existsSync(editionPath)) edition = await import(editionPath.href);
  const storage = new Map(), writes = [], responses = [], copyCalls = [];
  let rejectWrite = false;
  const caps = { platform: 'darwin', globalShortcut: '⌥ Space', supportsSecrets: true, supportsExport: true, supportsAutomation: true, edition: 'full' };
  const c = {
    ...core, ...order, ...automation, ...apikeyAutomation, ...edition, ...keyCache, ...writeGate, ...deviceKeyStore, ...secretSettings, storageWarnedRef: { current: false }, crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, btoa, atob, Date, JSON,
    ITERATIONS: 310_000, STORAGE_KEY: 'vault', DEVICE_KEY: 'key', LEGACY_STORAGE_KEY: 'legacy',
    localStorage: { getItem: key => storage.get(key) ?? null, removeItem: key => storage.delete(key), setItem: (key, value) => {
      if (key === 'vault' && rejectWrite) { rejectWrite = false; throw new Error('injected write failure'); }
      writes.push(key); storage.set(key, value);
    } },
    cancelled: false, loading: false, setLoading: () => {}, setStartupError: message => { c.startupError = message; },
    setCapabilities: () => {}, setActiveKind: () => {}, finishOpening: data => { c.opened = data; },
    useCallback: fn => fn, setItems: () => {}, setFolders: () => {}, setFolderColors: () => {}, folderColorsRef: { current: undefined }, setFolderShortNames: () => {}, folderShortNamesRef: { current: undefined }, setToast: () => {}, showToast: () => {}, setSelected: () => {}, closeEditor: () => {},
    itemsRef: { current: [] }, foldersRef: { current: core.EMPTY_FOLDER_REGISTRY }, nextSnippetNumberRef: { current: 1 }, sharedSeenRef: { current: undefined },
    persistQueueRef: { current: Promise.resolve() }, lazyWriterRef: { current: null }, automationQueueRef: { current: Promise.resolve() },
    deviceKey: 'synthetic-device-key', capabilitiesRef: { current: caps }, capabilities: caps,
    timestampNow: () => 2, URLSearchParams,
    window: { location: { protocol: 'http:', search: '' }, setTimeout: () => 1, clipboxDesktop: {
      capabilities: caps, automationReady: () => {}, onAutomationCommand: fn => { c.command = fn; return () => {}; },
      respondAutomationCommand: (id, response) => responses.push({ id, response }), didCopy: () => {},
      copyText: async text => { copyCalls.push(text); },
    } },
    setTimeout: () => 1, clearTimeout: () => {}, navigator: { clipboard: { writeText: async () => {} } },
  };
  vm.createContext(c);
  const run = text => vm.runInContext(ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, c);
  for (const name of ['bytesToBase64', 'base64ToBytes', 'createDeviceKey', 'deriveKey', 'encryptVault', 'decryptVault', 'readLocalEncryptedVault', 'openVault', 'saveItem', 'submit']) run(functions.get(name));
  for (const name of ['readVault', 'enqueueVaultTask', 'storeVault', 'commitVaultToMemory', 'writeVault', 'persist', 'persistLazy']) if (hooks.has(name)) run(`globalThis.${name} = ${hooks.get(name)}`);
  const clipboard = new URL('../../app/clipboard.ts', import.meta.url);
  if (fs.existsSync(clipboard)) run(fs.readFileSync(clipboard, 'utf8').replace(/^export /gm, ''));
  run(`(${automationEffect})()`);
  return { c, storage, writes, responses, copyCalls, rejectNextWrite: () => { rejectWrite = true; } };
}

export const sampleItem = (id = 'original') => ({ id, label: 'Original', secret: 'synthetic text', kind: 'snippet', folder: '询盘接待', color: '#fff', createdAt: 1, updatedAt: 1 });
export async function seed(h) {
  const data = core.synchronizeVaultData([sampleItem()], core.EMPTY_FOLDER_REGISTRY, 1);
  const envelope = await h.c.encryptVault(data, h.c.deviceKey);
  h.storage.set('key', h.c.deviceKey); h.storage.set('vault', JSON.stringify(envelope));
  h.c.itemsRef.current = data.items; h.c.foldersRef.current = data.folders; h.c.nextSnippetNumberRef.current = data.nextSnippetNumber;
  return data;
}
