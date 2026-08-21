// GM Tab — in-season state for the fantasy-gm agent system
// (/home/gihn/fantasy-gm), surfaced on this app's own homepage via a
// Will-only tile (see src/pages/Landing.jsx and src/pages/GmTab.jsx).
// Own small tables, same self-contained pattern as server/leaguehome.js.
// Admin-gated on every route in server/index.js (requireAdmin, not
// requirePermission) — same reasoning as the FantasyPros-key/ESPN-cookie
// settings routes: single-owner, sensitive-adjacent data.
//
// player_id throughout is fp_pool.id (the canonical player id since the
// FantasyPros migration), NOT players.id — the `players` table is
// unpopulated for Koi (verified live), so an FK reference to it would be
// misleading; deliberately left as a plain INTEGER, no REFERENCES clause.
//
// Written exclusively through the functions here, called only from
// server/index.js's /api/gm/* routes — both the GM Tab's own React page
// and fantasy-gm's agents (via scripts/gm_api_client.py) go through that
// same HTTP surface, never a second process touching this DB file
// directly (see fantasy-gm's plan file for why).
import { db } from "./db.js";

db.exec(`
CREATE TABLE IF NOT EXISTS gm_keeper_notes (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id             TEXT NOT NULL REFERENCES leagues(id),
  player_id             INTEGER NOT NULL,
  season                INTEGER NOT NULL,
  leaning               TEXT,               -- 'keep' | 'cut' | 'undecided'
  rationale             TEXT,
  years_kept            INTEGER,            -- not tracked anywhere else; supplied by hand
  original_draft_price  INTEGER,            -- pre-escalation price, if known
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(league_id, player_id, season)
);

CREATE TABLE IF NOT EXISTS gm_waiver_wire (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id       TEXT NOT NULL REFERENCES leagues(id),
  player_id       INTEGER,        -- fp_pool.id once matched, null if unmatched
  espn_player_id  TEXT,
  name            TEXT NOT NULL,
  position        TEXT,
  team            TEXT,
  note            TEXT,
  as_of           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gm_trade_proposals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id       TEXT NOT NULL REFERENCES leagues(id),
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft|sent|countered|accepted|rejected
  give_player_ids TEXT NOT NULL,  -- JSON array of fp_pool ids
  get_player_ids  TEXT NOT NULL,  -- JSON array of fp_pool ids
  counterparty    TEXT,
  analysis        TEXT,
  history         TEXT,           -- JSON array of {ts, note}
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Append-only, mirrors draft_events's event-sourcing pattern in db.js —
-- state derived from this, never mutated in place.
CREATE TABLE IF NOT EXISTS gm_transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id     TEXT NOT NULL REFERENCES leagues(id),
  event_type    TEXT NOT NULL,   -- 'waiver_recommendation' | 'trade_recommendation' | ...
  player_id     INTEGER,         -- fp_pool.id, nullable
  detail        TEXT,            -- plain-language recommendation/outcome text
  status        TEXT,            -- 'recommended' | 'confirmed_executed' | 'declined' | null
  related_id    INTEGER,         -- links a confirmation row back to its recommendation row
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gm_transactions_league ON gm_transactions(league_id, created_at);
`);

// --- Keeper notes ---

export function listKeeperNotes(leagueId, season) {
  return db.prepare(
    "SELECT * FROM gm_keeper_notes WHERE league_id = ? AND season = ? ORDER BY updated_at DESC"
  ).all(leagueId, season);
}

export function upsertKeeperNote(leagueId, playerId, season, { leaning, rationale, yearsKept, originalDraftPrice }) {
  db.prepare(`
    INSERT INTO gm_keeper_notes (league_id, player_id, season, leaning, rationale, years_kept, original_draft_price)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(league_id, player_id, season) DO UPDATE SET
      leaning = excluded.leaning, rationale = excluded.rationale,
      years_kept = excluded.years_kept, original_draft_price = excluded.original_draft_price,
      updated_at = datetime('now')
  `).run(leagueId, playerId, season, leaning ?? null, rationale ?? null, yearsKept ?? null, originalDraftPrice ?? null);
  return db.prepare(
    "SELECT * FROM gm_keeper_notes WHERE league_id = ? AND player_id = ? AND season = ?"
  ).get(leagueId, playerId, season);
}

export function deleteKeeperNote(leagueId, playerId, season) {
  db.prepare("DELETE FROM gm_keeper_notes WHERE league_id = ? AND player_id = ? AND season = ?")
    .run(leagueId, playerId, season);
}

// --- Waiver wire ---
// Replaced wholesale on each refresh (a snapshot of "what's available
// right now"), not incrementally upserted — the free-agent pool changes
// as a whole, not per-row.

export function listWaiverWire(leagueId) {
  return db.prepare("SELECT * FROM gm_waiver_wire WHERE league_id = ? ORDER BY position, name").all(leagueId);
}

export function replaceWaiverWire(leagueId, entries) {
  const txn = db.transaction(() => {
    db.prepare("DELETE FROM gm_waiver_wire WHERE league_id = ?").run(leagueId);
    const insert = db.prepare(`
      INSERT INTO gm_waiver_wire (league_id, player_id, espn_player_id, name, position, team, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const e of entries) {
      insert.run(leagueId, e.playerId ?? null, e.espnPlayerId ?? null, e.name, e.position ?? null, e.team ?? null, e.note ?? null);
    }
  });
  txn();
  return listWaiverWire(leagueId);
}

// --- Trade proposals ---

export function listTradeProposals(leagueId) {
  return db.prepare("SELECT * FROM gm_trade_proposals WHERE league_id = ? ORDER BY updated_at DESC").all(leagueId);
}

export function createTradeProposal(leagueId, { giveIds, getIds, counterparty, analysis }) {
  const info = db.prepare(`
    INSERT INTO gm_trade_proposals (league_id, give_player_ids, get_player_ids, counterparty, analysis, history)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(leagueId, JSON.stringify(giveIds || []), JSON.stringify(getIds || []), counterparty ?? null, analysis ?? null, JSON.stringify([]));
  return db.prepare("SELECT * FROM gm_trade_proposals WHERE id = ?").get(info.lastInsertRowid);
}

export function updateTradeProposal(id, { status, analysis, historyEntry }) {
  const existing = db.prepare("SELECT * FROM gm_trade_proposals WHERE id = ?").get(id);
  if (!existing) return null;
  const history = JSON.parse(existing.history || "[]");
  if (historyEntry) history.push({ ts: new Date().toISOString(), note: historyEntry });
  db.prepare(`
    UPDATE gm_trade_proposals SET
      status = COALESCE(?, status), analysis = COALESCE(?, analysis),
      history = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(status ?? null, analysis ?? null, JSON.stringify(history), id);
  return db.prepare("SELECT * FROM gm_trade_proposals WHERE id = ?").get(id);
}

// --- Transactions (append-only) ---

export function listTransactions(leagueId, limit = 100) {
  return db.prepare(
    "SELECT * FROM gm_transactions WHERE league_id = ? ORDER BY created_at DESC LIMIT ?"
  ).all(leagueId, limit);
}

export function appendTransaction(leagueId, { eventType, playerId, detail, status, relatedId }) {
  const info = db.prepare(`
    INSERT INTO gm_transactions (league_id, event_type, player_id, detail, status, related_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(leagueId, eventType, playerId ?? null, detail ?? null, status ?? null, relatedId ?? null);
  return db.prepare("SELECT * FROM gm_transactions WHERE id = ?").get(info.lastInsertRowid);
}
