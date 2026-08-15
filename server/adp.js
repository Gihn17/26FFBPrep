// Live player pool (name/position/team/bye/ADP) from Fantasy Football
// Calculator's free, unauthenticated ADP API — replaces the old hardcoded
// RAW array in App.jsx, which had to be hand-retyped every preseason and
// went stale the moment a player got traded or a rookie's ADP moved.
//
// FFC's own player_id becomes this app's canonical player id. That's
// deliberate: the old scheme assigned ids sequentially by array position
// (uid++ through a hardcoded list), which only worked because that list
// never changed at runtime. Live ADP shifts daily — if ids were reassigned
// by rank order on every refresh, every stored draft pick/note/imported
// projection (all keyed by player id) would silently point at a different
// player the next day. FFC's id is stable per player regardless of how
// their rank moves, so it's safe to use directly as our id.
import { db } from "./db.js";

const FFC_BASE = "https://fantasyfootballcalculator.com/api/v1/adp";
// One canonical pool feeds all three leagues — they already share a single
// player pool, each applying its own scoring weights on top (see
// scorePoints in App.jsx). ppr/12-team over half-ppr specifically for
// coverage depth: verified directly against FFC's live data that half-ppr
// has a meaningfully shallower sample (fewer real drafts use it), missing
// real streaming-relevant players (e.g. Dalton Schultz, Justice Hill) that
// ppr/12 does carry. Since ADP only drives pool membership/ordering now
// (each league applies its own scoring on top of imported stats, not on
// ADP), coverage depth matters more here than exact format match.
const FORMAT = "ppr";
const TEAMS = 12;

db.exec(`
CREATE TABLE IF NOT EXISTS adp_pool (
  id         INTEGER PRIMARY KEY,   -- Fantasy Football Calculator's player_id
  name       TEXT NOT NULL,
  position   TEXT NOT NULL,         -- QB/RB/WR/TE/K/DEF (FFC's "PK" mapped to "K")
  team       TEXT,
  bye        INTEGER,
  adp        REAL NOT NULL,
  adp_rank   INTEGER NOT NULL,      -- 1-based rank within position, computed at refresh time
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

let lastRefreshAt = null;
let lastRefreshError = null;

/** Pulls the current pool from FFC and upserts it into adp_pool. Players no
 *  longer present in the fetch (retired, fully off the ADP radar) are
 *  removed so the table doesn't accumulate stale entries forever — safe
 *  because FFC's ids are stable, so this never touches anyone still active. */
export async function refreshAdpPool() {
  const year = new Date().getFullYear();
  const url = `${FFC_BASE}/${FORMAT}?teams=${TEAMS}&year=${year}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FFC API returned HTTP ${res.status}`);
  const data = await res.json();
  const players = Array.isArray(data.players) ? data.players : [];
  if (!players.length) throw new Error("FFC API returned zero players — refusing to wipe the cached pool");

  const byPos = {};
  for (const p of players) {
    const pos = p.position === "PK" ? "K" : p.position;
    (byPos[pos] = byPos[pos] || []).push({ ...p, position: pos });
  }
  for (const pos of Object.keys(byPos)) byPos[pos].sort((a, b) => a.adp - b.adp);

  const upsert = db.prepare(`
    INSERT INTO adp_pool (id, name, position, team, bye, adp, adp_rank, updated_at)
    VALUES (@id, @name, @position, @team, @bye, @adp, @adp_rank, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, position=excluded.position, team=excluded.team,
      bye=excluded.bye, adp=excluded.adp, adp_rank=excluded.adp_rank, updated_at=excluded.updated_at
  `);
  const seenIds = [];
  const txn = db.transaction(() => {
    for (const pos of Object.keys(byPos)) {
      byPos[pos].forEach((p, i) => {
        seenIds.push(p.player_id);
        upsert.run({
          id: p.player_id, name: p.name, position: pos, team: p.team || null,
          bye: p.bye ?? null, adp: p.adp, adp_rank: i + 1,
        });
      });
    }
    const placeholders = seenIds.map(() => "?").join(",");
    db.prepare(`DELETE FROM adp_pool WHERE id NOT IN (${placeholders})`).run(...seenIds);
  });
  txn();

  lastRefreshAt = new Date().toISOString();
  lastRefreshError = null;
  return seenIds.length;
}

export function getAdpPool() {
  return db.prepare("SELECT id, name, position, team, bye, adp, adp_rank FROM adp_pool ORDER BY position, adp_rank").all();
}

export function getAdpStatus() {
  const count = db.prepare("SELECT COUNT(*) as c FROM adp_pool").get().c;
  return { count, format: FORMAT, teams: TEAMS, lastRefreshAt, lastRefreshError };
}

/** Refresh on boot, then every 24h. Failures are logged but never crash the
 *  server or clear the table — the last successfully cached pool (persisted
 *  in the SQLite volume) keeps serving until the next successful refresh. */
export function startAdpScheduler() {
  const run = () => {
    refreshAdpPool()
      .then((n) => console.log(`ADP pool refreshed from Fantasy Football Calculator: ${n} players`))
      .catch((e) => {
        lastRefreshError = e.message;
        console.error("ADP refresh failed (keeping last cached pool):", e.message);
      });
  };
  run();
  setInterval(run, 24 * 60 * 60 * 1000);
}
