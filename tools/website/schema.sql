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

-- One live code per email (or "admin <email>" for /admin): SHA-256 of "<key>:<code>", 10 minutes, dead after 5 tries.
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

-- Sessions ended because the account signed in on a 4th computer (at most 3, D-069): SHA-256 of the old token and
-- when it would have expired, so that computer hears why (401 device_limit) instead of a plain 请重新登录.
CREATE TABLE IF NOT EXISTS ended_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER
);

-- Hourly counters, e.g. "ip:<address>" (20 code requests), "email:<address>" (5 codes), "verify-ip:<address>" (30 sign-in
-- tries); bumped and read in one statement (D-094).
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

-- The encrypted blob itself when no R2 bucket is bound (key vaults/<user id>.json, at most 1.9 MB).
CREATE TABLE IF NOT EXISTS vault_blobs (
  key TEXT PRIMARY KEY,
  data BLOB NOT NULL
);

-- Last cloud copy that was over the cap (D-097): its size, when, and when ADMIN_EMAILS were last mailed about it.
CREATE TABLE IF NOT EXISTS vault_oversize (
  user_id TEXT PRIMARY KEY,
  bytes INTEGER,
  reported_at INTEGER,
  mailed_at INTEGER
);

-- Owner page /admin (admin.mjs, D-065): SHA-256 of the admin cookie token, which ADMIN_EMAILS address, 12 hours.
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Activation codes (D-086): SHA-256 of the code, its first four characters as a hint for the owner's list, and the
-- email that redeemed it (one code, one email, no expiry; NULL until used).
CREATE TABLE IF NOT EXISTS activation_codes (
  code_hash TEXT PRIMARY KEY,
  hint TEXT,
  created_at INTEGER,
  email TEXT,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS activation_codes_email ON activation_codes (email);
