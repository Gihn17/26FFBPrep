// ESPN Fantasy Football client — League History backfill (server/db.js's
// history_teams/history_matchups tables) and live Game Day scores, both for
// ESPN-hosted leagues (Koi now; Jordan once its league ID is on file).
//
// Two endpoints, both verified directly against the live API (not assumed
// from docs), used for different eras — ESPN's 2018 platform migration
// split "current-ish" and "old" seasons across genuinely different URLs,
// not just different years on the same shape:
//   - 2018+:  .../seasons/{year}/segments/0/leagues/{leagueId}?view=...
//     Works with ZERO auth for recent seasons of a public league (2024+ for
//     Koi); older years in this range (2018-2023 for Koi) 401 even on a
//     public league — ESPN gates those behind espn_s2/SWID regardless of
//     current privacy setting. This is the endpoint that stays current
//     season to season, so 2018+ always uses it, even once leagueHistory
//     is also confirmed to serve some of those years.
//   - Pre-2018: .../leagueHistory/{leagueId}?seasonId={year}?view=... —
//     ALWAYS needs espn_s2/SWID (confirmed: still 404s with valid cookies
//     if the season doesn't exist, but 401s without cookies even for
//     seasons that do). Response is an array wrapping one season object
//     (`[season]`, not `season`) — unwrapped in fetchSeason below. For Koi,
//     confirmed working back to 2011; 2010 and earlier 404 even with
//     cookies, so that's the real floor for this league.
import { db, getOrCreateUser } from "./db.js";

const ESPN_HOST = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";

db.exec(`
CREATE TABLE IF NOT EXISTS history_teams (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id     TEXT NOT NULL REFERENCES leagues(id),
  season        INTEGER NOT NULL,
  espn_team_id  INTEGER NOT NULL,   -- per-season team slot id (can be reassigned year to year)
  team_name     TEXT,
  owner_guid    TEXT,               -- ESPN's primaryOwner GUID — stable across seasons/renames,
                                      -- the real join key for all-time (cross-season) stats
  owner_name    TEXT,
  final_rank    INTEGER,            -- ESPN's rankCalculatedFinal — 1 = champion, max = last place.
                                      -- Reflects the full playoff/consolation bracket outcome, not
                                      -- just regular-season record (verified: a 6-8 team finished
                                      -- last in 2025 — this is real standings, not win total).
                                      -- Null for an in-progress season (nothing finalized yet).
  logo          TEXT,               -- ESPN's team.logo — a hotlinked image URL the manager set
                                      -- (imgur/giphy/ESPN's own vector packs/etc, not hosted by us).
                                      -- Per-season: a manager's logo can change year to year, same
                                      -- as team_name. Some are dead links now (tinypic.com is gone
                                      -- entirely) — the frontend must fall back gracefully, never
                                      -- assume this resolves.
  UNIQUE(league_id, season, espn_team_id)
);

CREATE TABLE IF NOT EXISTS history_matchups (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id     TEXT NOT NULL REFERENCES leagues(id),
  season        INTEGER NOT NULL,
  week          INTEGER NOT NULL,
  playoff_tier  TEXT,               -- 'NONE' | 'WINNERS_BRACKET' | 'LOSERS_CONSOLATION_LADDER' | ...
  home_team_id  INTEGER NOT NULL,   -- espn_team_id, scoped to (league_id, season)
  away_team_id  INTEGER,            -- null for a bye
  home_score    REAL,
  away_score    REAL,
  winner        TEXT,               -- 'HOME' | 'AWAY' | 'TIE' | 'UNDECIDED'
  UNIQUE(league_id, season, week, home_team_id, away_team_id)
);
`);

// Migration: CREATE TABLE IF NOT EXISTS above doesn't add columns to a
// history_teams table that already existed before final_rank was
// introduced — add it here if missing, safe to run on every boot.
const historyTeamsCols = db.prepare("PRAGMA table_info(history_teams)").all().map((c) => c.name);
if (!historyTeamsCols.includes("final_rank")) {
  db.exec("ALTER TABLE history_teams ADD COLUMN final_rank INTEGER");
}
if (!historyTeamsCols.includes("logo")) {
  db.exec("ALTER TABLE history_teams ADD COLUMN logo TEXT");
}

/** Cookies live in the same shared user_kv store as everything else (see
 *  server/index.js's storage router) — set once via the Settings tab, read
 *  here directly from the DB rather than round-tripping through HTTP.
 *  Absent/incomplete cookies just means "public data only" — never an error. */
function getEspnCookies() {
  try {
    const will = getOrCreateUser("Will");
    const row = db.prepare("SELECT value FROM user_kv WHERE user_id = ? AND key = ?").get(will.id, "espn-cookies");
    if (!row) return null;
    const parsed = JSON.parse(row.value);
    return (parsed.espn_s2 && parsed.swid) ? parsed : null;
  } catch (e) {
    return null;
  }
}

/** Single season fetch. Returns {status, data} rather than throwing on
 *  401/404 — those are expected, normal outcomes here (season needs cookies
 *  we don't have, or predates the league/platform), not failures.
 *  Routes to the right endpoint by year — see the header comment above for
 *  why these aren't interchangeable. */
async function fetchSeason(leagueId, year) {
  const cookies = getEspnCookies();
  const headers = {};
  if (cookies) headers.Cookie = `espn_s2=${cookies.espn_s2}; SWID=${cookies.swid}`;

  if (year >= 2018) {
    const url = `${ESPN_HOST}/seasons/${year}/segments/0/leagues/${leagueId}?view=mTeam&view=mMatchupScore`;
    const res = await fetch(url, { headers });
    if (res.status === 401 || res.status === 404) return { status: res.status, data: null };
    if (!res.ok) throw new Error(`ESPN API returned HTTP ${res.status} for season ${year}`);
    return { status: 200, data: await res.json() };
  }

  const url = `${ESPN_HOST}/leagueHistory/${leagueId}?seasonId=${year}&view=mTeam&view=mMatchupScore`;
  const res = await fetch(url, { headers });
  if (res.status === 401 || res.status === 404) return { status: res.status, data: null };
  if (!res.ok) throw new Error(`ESPN API returned HTTP ${res.status} for season ${year}`);
  const arr = await res.json();
  return { status: 200, data: Array.isArray(arr) ? arr[0] : arr };
}

function upsertSeason(leagueId, year, data) {
  const memberName = new Map((data.members || []).map(m => [m.id, [m.firstName, m.lastName].filter(Boolean).join(" ") || m.displayName]));
  const upsertTeam = db.prepare(`
    INSERT INTO history_teams (league_id, season, espn_team_id, team_name, owner_guid, owner_name, final_rank, logo)
    VALUES (@league_id, @season, @espn_team_id, @team_name, @owner_guid, @owner_name, @final_rank, @logo)
    ON CONFLICT(league_id, season, espn_team_id) DO UPDATE SET
      team_name=excluded.team_name, owner_guid=excluded.owner_guid, owner_name=excluded.owner_name, final_rank=excluded.final_rank, logo=excluded.logo
  `);
  const upsertMatchup = db.prepare(`
    INSERT INTO history_matchups (league_id, season, week, playoff_tier, home_team_id, away_team_id, home_score, away_score, winner)
    VALUES (@league_id, @season, @week, @playoff_tier, @home_team_id, @away_team_id, @home_score, @away_score, @winner)
    ON CONFLICT(league_id, season, week, home_team_id, away_team_id) DO UPDATE SET
      home_score=excluded.home_score, away_score=excluded.away_score, winner=excluded.winner, playoff_tier=excluded.playoff_tier
  `);
  const txn = db.transaction(() => {
    for (const t of data.teams || []) {
      const ownerGuid = t.primaryOwner || (t.owners && t.owners[0]) || null;
      upsertTeam.run({
        league_id: leagueId, season: year, espn_team_id: t.id,
        team_name: t.name || null, owner_guid: ownerGuid,
        owner_name: ownerGuid ? (memberName.get(ownerGuid) || null) : null,
        // 0 means "not computed yet" (an in-progress season before results
        // exist) — treated the same as no value, not a real 0th place.
        final_rank: t.rankCalculatedFinal || null,
        logo: t.logo || null,
      });
    }
    for (const m of data.schedule || []) {
      if (!m.home) continue; // shouldn't happen, but don't let a malformed entry crash the whole import
      upsertMatchup.run({
        league_id: leagueId, season: year, week: m.matchupPeriodId,
        playoff_tier: m.playoffTierType || "NONE",
        home_team_id: m.home.teamId,
        away_team_id: m.away ? m.away.teamId : null,
        home_score: m.home.totalPoints ?? null,
        away_score: m.away ? (m.away.totalPoints ?? null) : null,
        winner: m.winner || "UNDECIDED",
      });
    }
  });
  txn();
}

/** Loops seasons, upserting whatever's reachable. Never aborts the whole
 *  run because one season needs auth we don't have or predates the league —
 *  those are recorded in `skipped`, not thrown.
 *
 *  leagueId: our internal id ('koi'/'jordan') — what history_teams/
 *  history_matchups are keyed by, matching the leagues table's FK shape.
 *  espnLeagueId: ESPN's own numeric league id, used only for the API URL —
 *  these are NOT the same value and must not be conflated. */
export async function refreshLeagueHistory(leagueId, espnLeagueId, startYear, endYear) {
  const imported = [];
  const skipped = [];
  for (let year = startYear; year <= endYear; year++) {
    try {
      const { status, data } = await fetchSeason(espnLeagueId, year);
      if (status === 401) { skipped.push({ year, reason: "needs ESPN auth cookies (set them in Settings)" }); continue; }
      if (status === 404) { skipped.push({ year, reason: "not found (pre-2018 platform migration, or league didn't exist yet)" }); continue; }
      upsertSeason(leagueId, year, data);
      imported.push(year);
    } catch (e) {
      skipped.push({ year, reason: e.message });
    }
  }
  return { imported, skipped };
}

export function getLeagueHistory(leagueId) {
  const teams = db.prepare("SELECT * FROM history_teams WHERE league_id = ? ORDER BY season, espn_team_id").all(leagueId);
  const matchups = db.prepare("SELECT * FROM history_matchups WHERE league_id = ? ORDER BY season, week").all(leagueId);
  return { teams, matchups };
}

/** Current season's matchups for a given week (default: whatever ESPN says
 *  the league's current scoring period is) — used by the Game Day tracker.
 *  totalPointsLive (when present) reflects in-progress game stats; falls
 *  back to totalPoints when a week's games are settled or haven't started.
 *  espnLeagueId: ESPN's numeric league id (this function doesn't touch the
 *  DB, so there's no internal id involved here, unlike refreshLeagueHistory). */
export async function getWeekMatchups(espnLeagueId, week) {
  const year = new Date().getFullYear();
  const { status, data } = await fetchSeason(espnLeagueId, year);
  if (status !== 200) return { status, matchups: [] };
  const targetWeek = week || data.scoringPeriodId;
  const teamById = new Map((data.teams || []).map(t => [t.id, t.name]));
  const matchups = (data.schedule || [])
    .filter(m => m.matchupPeriodId === targetWeek)
    .map(m => ({
      week: targetWeek,
      home: m.home ? {
        teamId: m.home.teamId, teamName: teamById.get(m.home.teamId) || `Team ${m.home.teamId}`,
        points: m.home.totalPointsLive ?? m.home.totalPoints ?? 0,
      } : null,
      away: m.away ? {
        teamId: m.away.teamId, teamName: teamById.get(m.away.teamId) || `Team ${m.away.teamId}`,
        points: m.away.totalPointsLive ?? m.away.totalPoints ?? 0,
      } : null,
      winner: m.winner || "UNDECIDED",
    }));
  return { status: 200, week: targetWeek, matchups };
}
