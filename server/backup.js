// Dumps the whole SQLite DB to readable JSON on stdout — used by
// scripts/backup-and-push.sh to snapshot the live app's data into git
// (see backups/latest.json). Run inside the container (`docker exec
// ffb-draft-prep node server/backup.js`) so DATA_DIR resolves to the real
// /app/data volume via the same db.js connection server/index.js uses.
//
// Dumps every table generically rather than hand-picking columns, so this
// doesn't need updates as the schema grows (players/projections/keepers
// are empty today, pending the UDK import, but this will pick them up
// automatically once that lands).
import { db } from "./db.js";

const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
).all().map((r) => r.name);

const userNameById = new Map(
  db.prepare("SELECT id, name FROM users").all().map((u) => [u.id, u.name])
);

// No top-level "exported at" timestamp here on purpose — it would change
// on every run regardless of whether the data did, defeating
// backup-and-push.sh's "only commit if something actually changed" check.
// Git's own commit timestamp already answers "when"; per-row updated_at
// columns below are real data (only change when that row does).
const dump = { tables: {} };

for (const t of tables) {
  const rows = db.prepare(`SELECT * FROM ${t}`).all();
  dump.tables[t] = t === "user_kv"
    // value is itself a JSON string (App.jsx's saved-state blob) — parse it
    // so the git diff is readable instead of one giant escaped string.
    // Falls back to the raw string if it's ever malformed.
    ? rows.map((r) => {
        let value = r.value;
        try { value = JSON.parse(r.value); } catch (e) { /* leave as raw string */ }
        return { ...r, user: userNameById.get(r.user_id) || r.user_id, value };
      })
    : rows;
}

console.log(JSON.stringify(dump, null, 2));
