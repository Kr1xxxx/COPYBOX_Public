// Keeps the vault's device key on this computer, encrypted with the operating system
// (DPAPI on Windows) instead of next to the vault in the page's storage. Copying the
// data folder to another computer or another Windows account then no longer opens the vault.
//
// The record is { key, previous? }: `previous` only exists while the vault is being
// re-encrypted with a new key, so a crash half way never loses the old key.
function validate(record) {
  const ok = (value) => typeof value === "string" && value.length > 0 && value.length <= 200;
  if (!record || typeof record !== "object" || !ok(record.key) || (record.previous !== undefined && !ok(record.previous))) {
    throw new Error("设备钥匙格式不正确");
  }
  return record.previous === undefined ? { key: record.key } : { key: record.key, previous: record.previous };
}

// Only Windows for now: an unsigned Mac app may lose access to its Keychain item after an update.
function createDeviceKeyStore({ filePath, fs, safeStorage, platform = process.platform }) {
  function available() {
    return platform === "win32" && safeStorage.isEncryptionAvailable();
  }

  // Returns null only when nothing has been saved yet. A file that exists but cannot be read
  // throws, so the page never mistakes "unreadable" for "new" and starts an empty vault.
  function get() {
    if (!fs.existsSync(filePath)) return null;
    const stored = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (stored.version !== 1 || typeof stored.data !== "string") throw new Error("设备钥匙文件无法识别");
    return validate(JSON.parse(safeStorage.decryptString(Buffer.from(stored.data, "base64"))));
  }

  function set(record) {
    const clean = validate(record);
    if (!available()) throw new Error("这台电脑的系统不支持安全保存钥匙");
    const data = safeStorage.encryptString(JSON.stringify(clean)).toString("base64");
    // Write beside the target and rename, so a crash never leaves a half-written key file.
    const temporary = `${filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, data }), { mode: 0o600 });
    fs.renameSync(temporary, filePath);
    if (JSON.stringify(get()) !== JSON.stringify(clean)) throw new Error("设备钥匙保存后读不回来");
    return true;
  }

  return { available, get, set };
}

module.exports = { createDeviceKeyStore };
