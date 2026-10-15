-- D1 schema of the account and sync API (api.mjs, D-063). Database copyboxx-users, binding DB.
-- Apply once: npx --yes wrangler@4.150.0 d1 execute copyboxx-users --remote --file tools/website/schema.sql
-- Times are milliseconds since 1970 (Date.now()). Emails are stored lower-cased and trimmed.
-- Codes and session tokens are never stored, only their SHA-256 (hex).

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at INTEGER,
  last_sync_at INTEGER
);

-- One live code per email: SHA-256 of "<email>:<code>", 10 minutes, dead after 5 wrong tries.
CREATE TABLE IF NOT EXISTS login_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT,
  expires_at INTEGER,
  attempts INTEGER
);

-- SHA-256 of the bearer token, 90 days; device is the optional name the app sends ("Windows 电脑", ≤ 40 characters).
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT,
  expires_at INTEGER,
  device TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

-- Hourly counters: "ip:<address>" (20 code requests) and "email:<address>" (5 codes).
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER,
  count INTEGER
);

-- Version of the blob in R2 (vaults/<user id>.json); 0 / no row means nothing uploaded yet.
CREATE TABLE IF NOT EXISTS vault_meta (
  user_id TEXT PRIMARY KEY,
  version INTEGER,
  updated_at INTEGER
);
