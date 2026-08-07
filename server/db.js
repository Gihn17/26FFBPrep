// SQLite setup for the FFB draft-prep app.
//
// This sits ALONGSIDE the existing storage.json KV store in index.js —
// it doesn't replace it yet. The KV store keeps working for whatever
// App.jsx already saves through window.storage. This file adds real
// tables for the things a JSON blob can't serve well: per-user research,
// an append-only draft/keeper event log, and imported projection data.
//
// Wiring this into index.js and namespacing the KV store by user_id is
// a follow-up step, done deliberately in Claude Code with the diff
// visible, not auto-applied here.

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, "ffb.sqlite");
export const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL"); // safe for the single-writer/multi-reader case here

db.exec(`
-- ============================================================
-- Users — separate saved research per person (Will / wife).
-- Not real auth. This is a LAN app; a name is enough.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Leagues — one row per league (koi / final / jordan), holding
-- the config we've nailed down: source platform, team count,
-- roster shape, replacement levels, draft type.
-- teams/rosterSpots/replacement live HERE per-league now,
-- fixing the bug where App.jsx currently has these as one
-- global value shared across all three leagues.
-- ============================================================
CREATE TABLE IF NOT EXISTS leagues (
  id                  TEXT PRIMARY KEY,        -- 'koi' | 'final' | 'jordan'
  display_name        TEXT NOT NULL,
  draft_type          TEXT NOT NULL,            -- 'auction' | 'snake'
  source_platform      TEXT NOT NULL,            -- 'sleeper' | 'espn' | 'manual'
  source_league_id    TEXT,                     -- sleeper league_id or espn leagueId
  source_team_id       TEXT,                     -- Will's team/roster id in that league
  teams               INTEGER NOT NULL,
  roster_spots        INTEGER,                   -- total slots per team, incl. bench;
                                                    -- nullable — Jordan's is unconfirmed
                                                    -- until its ESPN mSettings is pulled
  auction_budget       INTEGER,                  -- null for snake leagues
  keeper_enabled       INTEGER NOT NULL DEFAULT 0,
  keeper_max           INTEGER,                  -- e.g. 3 for Koi and Final Fantasy
  keeper_rule          TEXT,                     -- 'espn_dollar' | 'sleeper_round' | null
  replacement_qb       INTEGER,
  replacement_rb       INTEGER,
  replacement_wr       INTEGER,
  replacement_te       INTEGER,
  replacement_k        INTEGER,
  replacement_def      INTEGER,
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Players — canonical row per player, joined across sources by
-- the DynastyProcess ID crosswalk where possible. Name-match is
-- the fallback for anyone unmatched (rookies, D/ST, etc).
-- ============================================================
CREATE TABLE IF NOT EXISTS players (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name      TEXT NOT NULL,
  position       TEXT NOT NULL,       -- QB/RB/WR/TE/K/DEF
  nfl_team       TEXT,
  bye_week       INTEGER,
  sleeper_id     TEXT,
  espn_id        TEXT,
  yahoo_id       TEXT,
  fantasypros_id TEXT,
  gsis_id        TEXT,
  match_method   TEXT,                -- 'id_crosswalk' | 'name_match' | 'manual'
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_players_name ON players(full_name);
CREATE INDEX IF NOT EXISTS idx_players_sleeper ON players(sleeper_id);
CREATE INDEX IF NOT EXISTS idx_players_espn ON players(espn_id);

-- ============================================================
-- Projections — raw STAT LINES, never pre-computed points.
-- Scoring is applied per-league at query time (scoring.js),
-- so one imported stat line serves all three leagues correctly
-- even though their scoring rules differ.
-- source: 'udk' now; room for 'ecr' / 'adp' / 'ffc' later.
-- ============================================================
CREATE TABLE IF NOT EXISTS projections (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id     INTEGER NOT NULL REFERENCES players(id),
  season        INTEGER NOT NULL,
  source        TEXT NOT NULL,        -- 'udk' | 'sleeper' | 'espn' | 'manual'
  pass_yd       REAL DEFAULT 0,
  pass_td       REAL DEFAULT 0,
  pass_int      REAL DEFAULT 0,
  rush_att      REAL DEFAULT 0,
  rush_yd       REAL DEFAULT 0,
  rush_td       REAL DEFAULT 0,
  rec           REAL DEFAULT 0,
  rec_yd        REAL DEFAULT 0,
  rec_td        REAL DEFAULT 0,
  fum_lost      REAL DEFAULT 0,
  games         REAL DEFAULT 17,      -- used for per-game bonus estimation later
  imported_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(player_id, season, source)
);

-- ============================================================
-- Keepers — one row per player per league per season, holding
-- the computed (or overridden) cost. This is what the keeper
-- calculator reads and writes.
-- ============================================================
CREATE TABLE IF NOT EXISTS keepers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id       TEXT NOT NULL REFERENCES leagues(id),
  player_id       INTEGER NOT NULL REFERENCES players(id),
  season          INTEGER NOT NULL,
  manager_name    TEXT,               -- Sleeper display_name or ESPN owner name
  original_round  INTEGER,            -- Final Fantasy: draft round the player was first taken
  original_cost   INTEGER,            -- Koi: original $ paid
  years_kept      INTEGER DEFAULT 0,  -- consecutive prior keeps going into this season
  computed_cost   TEXT,               -- e.g. '5th round' or '$44' — output of keepers.js
  eligible        INTEGER DEFAULT 1,  -- 0 if e.g. FF round would hit 1st (ineligible)
  is_waiver_add   INTEGER DEFAULT 0,
  decision        TEXT,               -- 'keep' | 'cut' | null (undecided)
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(league_id, player_id, season)
);

-- ============================================================
-- Draft events — append-only log. Draft state is DERIVED from
-- this, never mutated in place. Gives undo/redo, crash recovery,
-- and a post-draft replay for free.
-- ============================================================
CREATE TABLE IF NOT EXISTS draft_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id     TEXT NOT NULL REFERENCES leagues(id),
  season        INTEGER NOT NULL,
  seq           INTEGER NOT NULL,      -- order within this league+season's draft
  event_type    TEXT NOT NULL,         -- 'pick' | 'undo' | 'price_update'
  player_id     INTEGER REFERENCES players(id),
  manager_name  TEXT,
  price         INTEGER,               -- auction $ paid; null for snake
  round         INTEGER,
  pick_no       INTEGER,
  source        TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'sync'
  proposed      INTEGER NOT NULL DEFAULT 0,       -- 1 if from a sync adapter, unconfirmed
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_draft_events_league ON draft_events(league_id, season, seq);

-- ============================================================
-- Per-user KV store — same shape as the existing storage.json,
-- but namespaced by user so Will and his wife get separate
-- saved research (rankings, notes, tags) without touching
-- shared league config or projections.
-- ============================================================
CREATE TABLE IF NOT EXISTS user_kv (
  user_id     INTEGER NOT NULL REFERENCES users(id),
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, key)
);
`);

// Seed a default user so single-player usage works with zero setup.
const defaultUser = db.prepare("SELECT id FROM users WHERE name = ?").get("Will");
if (!defaultUser) {
  db.prepare("INSERT INTO users (name) VALUES (?)").run("Will");
}

/** Looks up a user by name, creating it if it doesn't exist yet.
 *  No real auth — a name is enough (see users table comment above). */
export function getOrCreateUser(name) {
  name = String(name || "").trim();
  if (!name) throw new Error("user name required");
  let row = db.prepare("SELECT id, name FROM users WHERE name = ?").get(name);
  if (!row) {
    db.prepare("INSERT INTO users (name) VALUES (?)").run(name);
    row = db.prepare("SELECT id, name FROM users WHERE name = ?").get(name);
  }
  return row;
}

export function listUsers() {
  return db.prepare("SELECT id, name FROM users ORDER BY id").all();
}

export default db;
