// App-wide, admin-only settings — third-party API keys and anything else
// that should never be readable by a merely draft-permitted account. This
// is deliberately NOT the same storage path as the existing user_kv/
// /api/storage mechanism (espn-cookies lives there): that whole namespace
// is gated only by requirePermission("draft") in server/index.js, so any
// 'limited' account with plain draft access (jordan/mike both have this
// today) can currently GET a stored ESPN cookie value directly. A paid
// API key deserves a real boundary, not that one — this module's routes
// are requireAdmin, and the raw value is never sent back to a client once
// saved (only a boolean "is it set" status), unlike espn-cookies' current
// round-trip of the actual value just to compute that same boolean.
import { db } from "./db.js";

db.exec(`
CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

export function getSetting(key) {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

export function hasSetting(key) {
  return getSetting(key) != null;
}

export function setSetting(key, value) {
  db.prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(key, value);
}

export function deleteSetting(key) {
  db.prepare("DELETE FROM app_settings WHERE key = ?").run(key);
}
