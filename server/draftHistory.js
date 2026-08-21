// Historical positional draft-cost trends — "what does the 3rd RB
// usually go for" and outlier detection during prep/a live auction.
// Own table, self-contained pattern (matches server/leaguehome.js/gm.js),
// populated from server/espn.js's getSeasonDraftWithPositions() via an
// admin-triggered refresh (server/index.js's /api/gm/draft-history/*
// routes) — never fetched live per query, same reasoning as fp_pool/
// waiver-wire (ESPN calls are real work, don't repeat them per question).
import { db } from "./db.js";

db.exec(`
CREATE TABLE IF NOT EXISTS gm_draft_history_picks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id       TEXT NOT NULL REFERENCES leagues(id),
  season          INTEGER NOT NULL,
  espn_player_id  INTEGER NOT NULL,
  name            TEXT NOT NULL,
  position        TEXT,          -- null when ESPN's lookup couldn't resolve one (rare)
  team            TEXT,
  price           INTEGER NOT NULL,
  keeper          INTEGER NOT NULL DEFAULT 0,
  round           INTEGER,
  overall_pick    INTEGER,
  UNIQUE(league_id, season, espn_player_id)
);
CREATE INDEX IF NOT EXISTS idx_draft_history_pos ON gm_draft_history_picks(league_id, position, season);
`);

export function replaceSeasonDraftHistory(leagueId, season, picks) {
  const txn = db.transaction(() => {
    db.prepare("DELETE FROM gm_draft_history_picks WHERE league_id = ? AND season = ?").run(leagueId, season);
    const insert = db.prepare(`
      INSERT INTO gm_draft_history_picks (league_id, season, espn_player_id, name, position, team, price, keeper, round, overall_pick)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of picks) {
      if (!p.name) continue; // couldn't resolve a name/position — skip rather than store a blank
      insert.run(leagueId, season, p.espnPlayerId, p.name, p.position, p.team, p.price, p.keeper ? 1 : 0, p.round, p.overallPick);
    }
  });
  txn();
}

export function getDraftHistorySeasons(leagueId) {
  return db.prepare(
    "SELECT DISTINCT season FROM gm_draft_history_picks WHERE league_id = ? ORDER BY season DESC"
  ).all(leagueId).map(r => r.season);
}

/** Per-position, per-season picks ranked by price descending (rank 1 =
 *  most expensive at that position that season) — the "Nth highest
 *  [position] cost" question directly. Returns both the raw per-season
 *  ranked lists (for real examples/transparency) and an aggregated
 *  summary per rank (mean/median/min/max across seasons) up to
 *  `maxRank`, since a single number without a range invites treating
 *  noise as signal. */
export function getPositionalTrends(leagueId, position, maxRank = 10) {
  const rows = db.prepare(
    "SELECT season, name, team, price, keeper, overall_pick FROM gm_draft_history_picks WHERE league_id = ? AND position = ? ORDER BY season DESC, price DESC"
  ).all(leagueId, position);

  const bySeason = {};
  for (const r of rows) (bySeason[r.season] = bySeason[r.season] || []).push(r);

  const rankedBySeasons = {};
  for (const [season, picks] of Object.entries(bySeason)) {
    rankedBySeasons[season] = picks.map((p, i) => ({ rank: i + 1, ...p }));
  }

  const summary = [];
  for (let rank = 1; rank <= maxRank; rank++) {
    const atRank = Object.values(rankedBySeasons)
      .map(picks => picks.find(p => p.rank === rank))
      .filter(Boolean);
    if (!atRank.length) continue;
    const prices = atRank.map(p => p.price).sort((a, b) => a - b);
    const mean = Math.round((prices.reduce((s, v) => s + v, 0) / prices.length) * 10) / 10;
    const mid = Math.floor(prices.length / 2);
    const median = prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);
    summary.push({
      rank, seasonsWithData: atRank.length,
      mean, median, min: prices[0], max: prices[prices.length - 1],
      examples: atRank.map(p => `${p.name} $${p.price} (${p.season})`),
    });
  }

  return { position, seasonsIncluded: Object.keys(bySeason).map(Number).sort(), byRank: summary, rawBySeasons: rankedBySeasons };
}
