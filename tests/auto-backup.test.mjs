import assert from "node:assert/strict";
import test from "node:test";
import { AUTO_BACKUP_KEEP, autoBackupName, backupDateLabel, backupDue, backupsToDelete, backupText, desktopStore, isAutoBackupName, readAutoBackupEnabled, readBackupText, runAutoBackup, webStore, writeAutoBackupEnabled } from "../app/auto-backup.ts";

const memory = () => { const map = new Map(); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) }; };
const payload = { localStorage: { "clipbox.x": "1" }, indexedDB: {} };
const day = (d) => new Date(2026, 9, d, 12, 0, 0);

test("the file name is today's date on this computer, and only that shape counts", () => {
  assert.equal(autoBackupName(day(5)), "copyboxx-auto-2026-10-05.json");
  assert.ok(isAutoBackupName("copyboxx-auto-2026-10-05.json"));
  // Days saved before the rename still count (D-102).
  assert.ok(isAutoBackupName("clipbox-auto-2026-10-05.json"));
  for (const bad of ["", "copybox-auto-2026-10-05.json", "copyboxx-auto-2026-10-05.json.tmp", "clipbox-auto-2026-10-05.json.tmp", "../clipbox-auto-2026-10-05.json", "notes.txt", "clipbox-auto-2026-1-5.json"]) assert.ok(!isAutoBackupName(bad), bad);
  assert.equal(backupDateLabel("clipbox-auto-2026-10-05.json"), "10月5日");
  assert.equal(backupDateLabel("copyboxx-auto-2026-10-06.json"), "10月6日");
});

test("a backup is due only when today's file is missing", () => {
  assert.ok(backupDue([], day(5)));
  assert.ok(backupDue(["clipbox-auto-2026-10-04.json"], day(5)));
  assert.ok(!backupDue(["copyboxx-auto-2026-10-05.json"], day(5)));
});

test("only the newest seven are kept and other files are never listed for deletion", () => {
  const names = Array.from({ length: 10 }, (_, i) => autoBackupName(day(i + 1)));
  const gone = backupsToDelete([...names, "notes.txt"]);
  assert.deepEqual(gone, [autoBackupName(day(3)), autoBackupName(day(2)), autoBackupName(day(1))].slice(0, gone.length));
  assert.equal(gone.length, 10 - AUTO_BACKUP_KEEP);
  assert.ok(!gone.includes("notes.txt"));
  assert.deepEqual(backupsToDelete(names.slice(0, 5)), []);
  // Old clipbox- days are older than every copyboxx- day and go first.
  const mixed = [...names.slice(0, 5).map((name) => name.replace("copyboxx-", "clipbox-")), ...names.slice(5)];
  assert.deepEqual(backupsToDelete(mixed), ["clipbox-auto-2026-10-03.json", "clipbox-auto-2026-10-02.json", "clipbox-auto-2026-10-01.json"]);
});

test("the switch is on until someone turns it off", () => {
  const storage = memory();
  assert.equal(readAutoBackupEnabled(storage), true);
  writeAutoBackupEnabled(false, storage);
  assert.equal(readAutoBackupEnabled(storage), false);
  writeAutoBackupEnabled(true, storage);
  assert.equal(readAutoBackupEnabled(storage), true);
});

test("runAutoBackup saves once a day, never when switched off, and never throws", async () => {
  const store = webStore(memory());
  const collect = async () => payload;
  assert.equal(await runAutoBackup(store, false, day(5), collect), "skipped");
  assert.equal((await store.list()).length, 0);
  assert.equal(await runAutoBackup(store, true, day(5), collect), "saved");
  assert.equal(await runAutoBackup(store, true, day(5), collect), "skipped");
  for (let d = 6; d <= 14; d += 1) await runAutoBackup(store, true, day(d), collect);
  const names = (await store.list()).map((file) => file.name);
  assert.equal(names.length, AUTO_BACKUP_KEEP);
  assert.equal(names[0], autoBackupName(day(14)));
  assert.equal(await runAutoBackup(store, true, day(15), async () => { throw new Error("disk"); }), "failed");
});

test("a saved backup reads back to the same payload, and anything else is refused", async () => {
  assert.deepEqual(readBackupText(backupText(payload, 1)), payload);
  assert.throws(() => readBackupText("not json"), /不是 Copyboxx 的备份文件/);
  assert.throws(() => readBackupText(JSON.stringify({ format: "other", version: 1, payload })), /不是 Copyboxx 的备份文件/);
  assert.throws(() => readBackupText(JSON.stringify({ format: "clipbox-auto-backup", version: 1, payload: { localStorage: { "bad": "1" }, indexedDB: {} } })), /文件内容不对/);
});

test("the desktop store passes bytes to the shell and filters foreign names", async () => {
  const saved = [];
  const store = desktopStore({
    backupSave: async (name, bytes) => { saved.push([name, new TextDecoder().decode(bytes)]); },
    backupList: async () => [{ name: "clipbox-auto-2026-10-05.json", size: 3 }, { name: "other.txt", size: 1 }],
    backupRead: async () => new TextEncoder().encode("hello"),
  });
  await store.save("clipbox-auto-2026-10-05.json", "abc");
  assert.deepEqual(saved, [["clipbox-auto-2026-10-05.json", "abc"]]);
  assert.deepEqual((await store.list()).map((f) => f.name), ["clipbox-auto-2026-10-05.json"]);
  assert.equal(await store.read("clipbox-auto-2026-10-05.json"), "hello");
  assert.equal(desktopStore({}), null);
});
