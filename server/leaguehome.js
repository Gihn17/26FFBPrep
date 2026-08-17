// League History's "Home" page — a featured YouTube link + a shared
// message board ("League Social"). Own small tables, same self-contained
// pattern as server/espn.js and server/adp.js. Admin-only for now (Will's
// call — this page isn't finished yet, so it's hidden from restricted
// 'history' accounts until it is; see requireAdmin on its routes in
// server/index.js, not just the nav tab being hidden client-side).
import { db } from "./db.js";

db.exec(`
CREATE TABLE IF NOT EXISTS history_home_settings (
  league_id     TEXT PRIMARY KEY REFERENCES leagues(id),
  youtube_url   TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS history_chat (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id     TEXT NOT NULL REFERENCES leagues(id),
  author        TEXT NOT NULL,        -- the real logged-in username, not free text
  message       TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_history_chat_league ON history_chat(league_id, created_at);
`);

export function getHomeSettings(leagueId) {
  const row = db.prepare("SELECT youtube_url FROM history_home_settings WHERE league_id = ?").get(leagueId);
  return { youtubeUrl: row?.youtube_url || null };
}

export function setHomeSettings(leagueId, { youtubeUrl }) {
  db.prepare(`
    INSERT INTO history_home_settings (league_id, youtube_url) VALUES (?, ?)
    ON CONFLICT(league_id) DO UPDATE SET youtube_url = excluded.youtube_url, updated_at = datetime('now')
  `).run(leagueId, youtubeUrl || null);
  return getHomeSettings(leagueId);
}

export function listChatMessages(leagueId) {
  return db.prepare("SELECT id, author, message, created_at FROM history_chat WHERE league_id = ? ORDER BY created_at ASC")
    .all(leagueId);
}

export function addChatMessage(leagueId, author, message) {
  message = String(message || "").trim();
  if (!message) throw new Error("message required");
  if (message.length > 2000) throw new Error("message too long (2000 characters max)");
  const info = db.prepare("INSERT INTO history_chat (league_id, author, message) VALUES (?, ?, ?)").run(leagueId, author, message);
  return db.prepare("SELECT id, author, message, created_at FROM history_chat WHERE id = ?").get(info.lastInsertRowid);
}

export function deleteChatMessage(leagueId, id) {
  const result = db.prepare("DELETE FROM history_chat WHERE league_id = ? AND id = ?").run(leagueId, id);
  if (result.changes === 0) throw new Error("message not found");
}
