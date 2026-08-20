// Per-league configuration.
//
// This is the fix for the real bug found in App.jsx: `teams`, `rosterSpots`,
// and `replacement` currently live as single top-level state values shared
// across all three leagues (defaulting to teams=10, rosterSpots=16 — stale
// for both Koi and Final Fantasy, which are 12 teams / 15 spots). That
// makes it structurally impossible to represent three leagues with
// different team counts at once.
//
// Values below are seeded from what's been confirmed directly against
// each platform's own API (ESPN mSettings for Koi, Sleeper league config
// for Final Fantasy). Jordan is stubbed — same shape, pending its ESPN
// league ID pull.
//
// Replacement levels follow the rule validated against Koi's real roster
// data: they should sum to (teams * roster_spots) when the intent is
// "replacement = last player who'd be rostered at all." Koi's levels sum
// to 180 exactly, confirming that reading. Final Fantasy's current
// 15/47/55/15/12/12 sums to 156, short of its own 180 — flagged below,
// not silently corrected, since only Will can confirm whether that gap
// is intentional or a leftover from before the roster size was locked in.

import { db } from "./db.js";

export const LEAGUE_DEFAULTS = {
  koi: {
    id: "koi",
    display_name: "Koi",
    draft_type: "auction",
    source_platform: "espn",
    source_league_id: "722037",
    source_team_id: "11",
    teams: 12,
    roster_spots: 15, // 1 QB, 2 RB, 1 RB/WR flex, 2 WR, 1 TE, 1 D/ST, 1 K, 6 BN
    auction_budget: 200,
    keeper_enabled: true,
    keeper_max: 3,
    keeper_rule: "espn_dollar", // cost = max(paid, draft_price) + $10/yr kept, no cap on years
    replacement: {
      qb: 15, rb: 60, wr: 66, te: 15, k: 12, def: 12, // sums to 180 = teams * roster_spots ✓
    },
  },

  final: {
    id: "final",
    display_name: "Final Fantasy",
    draft_type: "snake",
    source_platform: "sleeper",
    source_league_id: "1380768612914073600",
    source_team_id: "5", // Will's roster_id
    teams: 12,
    roster_spots: 15, // QB, 2 RB, 2 WR, TE, FLEX(RB/WR/TE), K, DEF, 6 BN
    auction_budget: null,
    keeper_enabled: true,
    keeper_max: 3,
    keeper_rule: "sleeper_round", // cost = round - (years_kept + 1); ineligible once it would hit round 1
    replacement: {
      // FLAGGED: current values sum to 156, not 180 (teams * roster_spots).
      // Koi's levels validated exactly against the "sums to rostered
      // players" rule; these look short by the same logic. Left as
      // originally given rather than silently rescaled — confirm with
      // Will whether this was deliberate (e.g. discounting bench-only
      // players at some positions) before changing it.
      qb: 15, rb: 47, wr: 55, te: 15, k: 12, def: 12, // sums to 156, expected ~180
    },
  },

  sinbin: {
    id: "sinbin",
    display_name: "Sin Bin Dynasty",
    // League History only — this league isn't a Draft Prep board (that's
    // BOARD_TABS/ALL_TABS in src/App.jsx, untouched by this entry), so
    // draft_type/roster_spots/replacement below are unused placeholders,
    // not real config — kept non-null purely because seedLeagues() reads
    // cfg.replacement.* directly without an optional-chain guard.
    draft_type: "snake",
    source_platform: "sleeper",
    source_league_id: "1318295412985049088",
    source_team_id: "1", // Will's roster_id
    teams: 12,
    roster_spots: null,
    auction_budget: null,
    keeper_enabled: false,
    keeper_max: null,
    keeper_rule: null,
    replacement: { qb: 0, rb: 0, wr: 0, te: 0, k: 0, def: 0 },
  },

  jordan: {
    id: "jordan",
    display_name: "Jordan's",
    draft_type: "snake",
    source_platform: "espn",
    source_league_id: null, // TODO: fill in once pulled — same process as Koi
    source_team_id: null,
    teams: 10,
    roster_spots: null, // TODO: confirm via ESPN mSettings, same as Koi's pull
    auction_budget: null,
    keeper_enabled: false, // only Koi and Final Fantasy confirmed to have keepers
    keeper_max: null,
    keeper_rule: null,
    replacement: {
      // As given by Will. Sums to 142 over 10 teams = 14.2/team, non-integer —
      // worth rechecking once roster_spots is confirmed via ESPN, same as
      // the Final Fantasy flag above. Not auto-corrected.
      qb: 13, rb: 47, wr: 49, te: 13, k: 10, def: 10,
    },
  },
};

/** Insert/refresh the seeded defaults into the leagues table.
 *  Safe to call repeatedly — upserts by id, never duplicates. */
export function seedLeagues() {
  const upsert = db.prepare(`
    INSERT INTO leagues (
      id, display_name, draft_type, source_platform, source_league_id, source_team_id,
      teams, roster_spots, auction_budget, keeper_enabled, keeper_max, keeper_rule,
      replacement_qb, replacement_rb, replacement_wr, replacement_te, replacement_k, replacement_def
    ) VALUES (
      @id, @display_name, @draft_type, @source_platform, @source_league_id, @source_team_id,
      @teams, @roster_spots, @auction_budget, @keeper_enabled, @keeper_max, @keeper_rule,
      @replacement_qb, @replacement_rb, @replacement_wr, @replacement_te, @replacement_k, @replacement_def
    )
    ON CONFLICT(id) DO UPDATE SET
      display_name=excluded.display_name, draft_type=excluded.draft_type,
      source_platform=excluded.source_platform, source_league_id=excluded.source_league_id,
      source_team_id=excluded.source_team_id, teams=excluded.teams,
      roster_spots=excluded.roster_spots, auction_budget=excluded.auction_budget,
      keeper_enabled=excluded.keeper_enabled, keeper_max=excluded.keeper_max,
      keeper_rule=excluded.keeper_rule,
      replacement_qb=excluded.replacement_qb, replacement_rb=excluded.replacement_rb,
      replacement_wr=excluded.replacement_wr, replacement_te=excluded.replacement_te,
      replacement_k=excluded.replacement_k, replacement_def=excluded.replacement_def,
      updated_at=datetime('now')
  `);

  for (const cfg of Object.values(LEAGUE_DEFAULTS)) {
    upsert.run({
      id: cfg.id,
      display_name: cfg.display_name,
      draft_type: cfg.draft_type,
      source_platform: cfg.source_platform,
      source_league_id: cfg.source_league_id,
      source_team_id: cfg.source_team_id,
      teams: cfg.teams,
      roster_spots: cfg.roster_spots,
      auction_budget: cfg.auction_budget,
      keeper_enabled: cfg.keeper_enabled ? 1 : 0,
      keeper_max: cfg.keeper_max,
      keeper_rule: cfg.keeper_rule,
      replacement_qb: cfg.replacement.qb,
      replacement_rb: cfg.replacement.rb,
      replacement_wr: cfg.replacement.wr,
      replacement_te: cfg.replacement.te,
      replacement_k: cfg.replacement.k,
      replacement_def: cfg.replacement.def,
    });
  }
}

export function getLeague(leagueId) {
  const row = db.prepare("SELECT * FROM leagues WHERE id = ?").get(leagueId);
  if (!row) return null;
  return {
    ...row,
    replacement: {
      qb: row.replacement_qb, rb: row.replacement_rb, wr: row.replacement_wr,
      te: row.replacement_te, k: row.replacement_k, def: row.replacement_def,
    },
  };
}

export function getAllLeagues() {
  return db.prepare("SELECT id FROM leagues").all().map((r) => getLeague(r.id));
}
