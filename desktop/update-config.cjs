// Where the app looks for the newest version: a small JSON file {"version","notes","url"}.
// Empty means the reminder is off. CLIPBOX_UPDATE_URL overrides it (for testing).
const DEFAULT_UPDATE_URL = "";

module.exports = { UPDATE_URL: process.env.CLIPBOX_UPDATE_URL || DEFAULT_UPDATE_URL };
