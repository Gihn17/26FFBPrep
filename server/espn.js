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
import { getSetting, setSetting } from "./settings.js";

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
  division_id   INTEGER,             -- ESPN's team.divisionId, scoped to this season
  division_name TEXT,                -- from settings.scheduleSettings.divisions — resolved and
                                      -- stored per-season same as everything else here, since
                                      -- division names/composition can change year to year
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
if (!historyTeamsCols.includes("division_id")) {
  db.exec("ALTER TABLE history_teams ADD COLUMN division_id INTEGER");
  db.exec("ALTER TABLE history_teams ADD COLUMN division_name TEXT");
}

// Migration: espn-cookies used to live in the shared user_kv store, gated
// only by requirePermission("draft") on /api/storage — meaning any
// 'limited' account with plain draft access (not just admin) could GET it
// directly. Move whatever's already stored there into app_settings
// (requireAdmin-only, see server/settings.js) once, then delete the old
// copy so it stops being readable through the old door. Safe to run every
// boot — no-op once there's nothing left in the old location.
(function migrateEspnCookies() {
  if (getSetting("espn-cookies")) return;
  try {
    const will = getOrCreateUser("Will");
    const row = db.prepare("SELECT value FROM user_kv WHERE user_id = ? AND key = ?").get(will.id, "espn-cookies");
    if (!row) return;
    setSetting("espn-cookies", row.value);
    db.prepare("DELETE FROM user_kv WHERE user_id = ? AND key = ?").run(will.id, "espn-cookies");
    console.log("Migrated espn-cookies from /api/storage to admin-only settings.");
  } catch (e) {
    console.error("espn-cookies migration failed:", e.message);
  }
})();

/** Set once via the Settings tab (admin-only, server/settings.js), read
 *  here directly from the DB rather than round-tripping through HTTP.
 *  Absent/incomplete cookies just means "public data only" — never an error. */
function getEspnCookies() {
  try {
    const raw = getSetting("espn-cookies");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
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
    const url = `${ESPN_HOST}/seasons/${year}/segments/0/leagues/${leagueId}?view=mTeam&view=mMatchupScore&view=mSettings`;
    const res = await fetch(url, { headers });
    if (res.status === 401 || res.status === 404) return { status: res.status, data: null };
    if (!res.ok) throw new Error(`ESPN API returned HTTP ${res.status} for season ${year}`);
    return { status: 200, data: await res.json() };
  }

  const url = `${ESPN_HOST}/leagueHistory/${leagueId}?seasonId=${year}&view=mTeam&view=mMatchupScore&view=mSettings`;
  const res = await fetch(url, { headers });
  if (res.status === 401 || res.status === 404) return { status: res.status, data: null };
  if (!res.ok) throw new Error(`ESPN API returned HTTP ${res.status} for season ${year}`);
  const arr = await res.json();
  return { status: 200, data: Array.isArray(arr) ? arr[0] : arr };
}

function upsertSeason(leagueId, year, data) {
  const memberName = new Map((data.members || []).map(m => [m.id, [m.firstName, m.lastName].filter(Boolean).join(" ") || m.displayName]));
  const divisionName = new Map((data.settings?.scheduleSettings?.divisions || []).map(d => [d.id, d.name]));
  const upsertTeam = db.prepare(`
    INSERT INTO history_teams (league_id, season, espn_team_id, team_name, owner_guid, owner_name, final_rank, logo, division_id, division_name)
    VALUES (@league_id, @season, @espn_team_id, @team_name, @owner_guid, @owner_name, @final_rank, @logo, @division_id, @division_name)
    ON CONFLICT(league_id, season, espn_team_id) DO UPDATE SET
      team_name=excluded.team_name, owner_guid=excluded.owner_guid, owner_name=excluded.owner_name, final_rank=excluded.final_rank,
      logo=excluded.logo, division_id=excluded.division_id, division_name=excluded.division_name
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
        division_id: t.divisionId ?? null,
        division_name: t.divisionId != null ? (divisionName.get(t.divisionId) || null) : null,
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
 *  DB, so there's no internal id involved here, unlike refreshLeagueHistory).
 *  year: optional override, defaults to the real current year — exists so a
 *  past, fully-settled week (e.g. last season's week 17) can be pulled
 *  through the exact same pipeline to test parsing/rendering, since a
 *  genuinely live in-progress week is only available while games are being
 *  played. Gated to admin in the UI (see GameDay.jsx) — not a real feature. */
export async function getWeekMatchups(espnLeagueId, week, year) {
  const targetYear = year || new Date().getFullYear();
  const { status, data } = await fetchSeason(espnLeagueId, targetYear);
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

// ESPN's defaultPositionId scheme — standard across the platform, not
// league-specific. Confirmed live against Koi's real roster (RB=2, K=5
// matched real players; DEF=16 is ESPN's well-documented convention,
// not independently re-verified here since no DEF appeared in the
// free-agent sample pulled).
const POSITION_ID_MAP = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF" };

/** Current roster for one team — genuinely new, nothing in this file
 *  fetched mRoster before (verified live: added for the fantasy-gm GM
 *  Tab's roster lookup, spike-tested against Koi's real team 11 first).
 *  Returns null fields gracefully rather than throwing on an unexpected
 *  shape — ESPN's roster JSON is deep and not worth hard-failing on a
 *  missing sub-field. */
export async function getRoster(espnLeagueId, teamId, year) {
  const targetYear = year || new Date().getFullYear();
  const cookies = getEspnCookies();
  const headers = {};
  if (cookies) headers.Cookie = `espn_s2=${cookies.espn_s2}; SWID=${cookies.swid}`;

  const url = `${ESPN_HOST}/seasons/${targetYear}/segments/0/leagues/${espnLeagueId}?view=mRoster&view=mTeam`;
  const res = await fetch(url, { headers });
  if (res.status === 401 || res.status === 404) return { status: res.status, roster: [] };
  if (!res.ok) throw new Error(`ESPN API returned HTTP ${res.status} fetching roster`);
  const data = await res.json();
  const team = (data.teams || []).find(t => String(t.id) === String(teamId));
  if (!team || !team.roster) return { status: 200, roster: [] };

  const roster = team.roster.entries.map(entry => {
    const p = entry.playerPoolEntry?.player || {};
    return {
      espnPlayerId: p.id ?? null,
      name: p.fullName ?? null,
      position: POSITION_ID_MAP[p.defaultPositionId] ?? null,
      acquisitionType: entry.acquisitionType ?? null,   // DRAFT | TRADE | ADD | ...
      injuryStatus: entry.injuryStatus ?? null,
      // ESPN's own built-in keeper-value fields — a real find worth
      // surfacing, NOT yet confirmed to correspond to this league's
      // actual espn_dollar custom keeper rule (koiKeeperCost in
      // server/keepers.js) rather than ESPN's generic default keeper
      // feature. Pass through as informational only until cross-checked
      // against a real keeper decision.
      espnKeeperValue: entry.playerPoolEntry?.keeperValue ?? null,
      espnKeeperValueFuture: entry.playerPoolEntry?.keeperValueFuture ?? null,
    };
  });
  return { status: 200, roster };
}

/** Available free agents / waiver-wire players. Spike-tested live against
 *  Koi — the view exists and works, but ESPN 400s without a `sort` field
 *  in the filter (undocumented, discovered by testing, not in any spec).
 *  Sorted by percent-owned descending — the most rosterable/relevant
 *  free agents first, not an arbitrary API-default order. */
export async function getFreeAgents(espnLeagueId, year, limit = 50) {
  const targetYear = year || new Date().getFullYear();
  const cookies = getEspnCookies();
  const headers = {};
  if (cookies) headers.Cookie = `espn_s2=${cookies.espn_s2}; SWID=${cookies.swid}`;
  const filter = {
    players: {
      filterStatus: { value: ["FREEAGENT", "WAIVERS"] },
      sortPercOwned: { sortAsc: false, sortPriority: 1 },
      limit,
    },
  };
  headers["x-fantasy-filter"] = JSON.stringify(filter);

  const url = `${ESPN_HOST}/seasons/${targetYear}/segments/0/leagues/${espnLeagueId}?view=kona_player_info`;
  const res = await fetch(url, { headers });
  if (res.status === 401 || res.status === 404) return { status: res.status, players: [] };
  if (!res.ok) throw new Error(`ESPN API returned HTTP ${res.status} fetching free agents`);
  const data = await res.json();
  const players = (data.players || []).map(entry => ({
    espnPlayerId: entry.player?.id ?? null,
    name: entry.player?.fullName ?? null,
    position: POSITION_ID_MAP[entry.player?.defaultPositionId] ?? null,
    percentOwned: entry.player?.ownership?.percentOwned ?? null,
    status: entry.status ?? null,
  }));
  return { status: 200, players };
}

/** One season's completed draft results (mDraftDetail) — every pick,
 *  real price, team, keeper flag, round/pick number. Spike-tested live:
 *  a completed season returns drafted:true and 180 real picks; the
 *  current not-yet-drafted season returns drafted:false with placeholder
 *  picks (playerId -1). The one thing this view can NEVER see is a
 *  mid-season waiver transaction — verified by testing (no ESPN view
 *  found that exposes historical transaction/waiver prices) — so a price
 *  jump between one draft-day price and the next that isn't explained by
 *  the flat +$10/yr keeper rule usually means a waiver move happened in
 *  between that this data is blind to. */
// A completed season's draft is immutable — never refetch one within
// this process's lifetime. Also collapses redundant fetches when
// multiple tool calls in one chat turn hit the same season concurrently
// (e.g. asking about 3 keepers each walking back through the same
// recent years). Only caches completed drafts; the current in-progress
// season is never memoized since it can change.
const draftDetailCache = new Map(); // `${espnLeagueId}:${year}` -> detail | Promise<detail>

async function fetchDraftDetail(espnLeagueId, year) {
  const cacheKey = `${espnLeagueId}:${year}`;
  if (draftDetailCache.has(cacheKey)) return draftDetailCache.get(cacheKey);

  const promise = (async () => {
    const cookies = getEspnCookies();
    const headers = {};
    if (cookies) headers.Cookie = `espn_s2=${cookies.espn_s2}; SWID=${cookies.swid}`;
    const url = `${ESPN_HOST}/seasons/${year}/segments/0/leagues/${espnLeagueId}?view=mDraftDetail&view=mTeam`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    const teamNameById = new Map((data.teams || []).map(t => [t.id, t.name || `${t.location || ""} ${t.nickname || ""}`.trim()]));
    return { drafted: !!data.draftDetail?.drafted, picks: data.draftDetail?.picks || [], teamNameById };
  })();
  draftDetailCache.set(cacheKey, promise);

  const result = await promise;
  if (!result || !result.drafted) draftDetailCache.delete(cacheKey); // don't cache a miss/in-progress season
  return result;
}

/** Walks one player's real draft-day price back through past completed
 *  seasons — up to `maxYears` back, stopping early once enough history
 *  is gathered. Returns the most recent price as `previousYearPrice`
 *  (the only number koiKeeperCost actually needs — see server/keepers.js
 *  for why this is a flat, non-compounding rule) plus the full trail for
 *  transparency, and flags a jump that isn't explained by +$10/yr as a
 *  likely (invisible-to-this-data) waiver move rather than silently
 *  trusting the number. */
export async function getDraftPriceHistory(espnLeagueId, espnPlayerId, maxYears = 6) {
  const startYear = new Date().getFullYear();
  const years = Array.from({ length: maxYears }, (_, i) => startYear - i);
  // All candidate seasons fetched concurrently rather than one at a time
  // with an early-exit — verified live this was the real cause of a
  // 2-minute chat response (3 keepers x sequential multi-year walks).
  // The draftDetailCache above also means this costs nothing extra when
  // another tool call in the same turn already fetched the same season.
  const details = await Promise.all(years.map(year => fetchDraftDetail(espnLeagueId, year)));

  const trail = [];
  for (let i = 0; i < years.length; i++) {
    const year = years[i], detail = details[i];
    if (!detail || !detail.drafted) continue; // this season hasn't happened/finished yet
    const pick = detail.picks.find(p => p.playerId === espnPlayerId);
    if (!pick) continue; // not in this draft at all — likely wasn't rostered yet
    trail.push({
      year, team: detail.teamNameById.get(pick.teamId) || `Team ${pick.teamId}`,
      price: pick.bidAmount, keeper: pick.keeper, round: pick.roundId, pickInRound: pick.roundPickNumber,
    });
    if (trail.length >= 4) break; // enough to see the pattern without walking the whole league history
  }

  let flag = null;
  if (trail.length >= 2) {
    const [mostRecent, prior] = trail;
    const expected = prior.price + 10;
    if (mostRecent.keeper && mostRecent.price !== expected) {
      flag = `Jump from $${prior.price} (${prior.year}) to $${mostRecent.price} (${mostRecent.year}) doesn't match the flat +$10/yr rule (expected $${expected}) — likely a waiver move happened in between that draft data can't see. Confirm with Will before trusting this price.`;
    }
  }

  return {
    previousYearPrice: trail[0]?.price ?? null,
    previousYearWasKeeper: trail[0]?.keeper ?? null,
    trail,
    flag,
  };
}

/** One completed season's full draft, every pick joined to a real
 *  name/position. mDraftDetail alone has no position field per pick, and
 *  the obvious join (that season's end-of-year rosters) misses anyone
 *  cut/dropped/IR'd before the season ended — verified live: 53 of 180
 *  picks in a real season, including real stars (Tyreek Hill, Mahomes,
 *  Alvin Kamara) who'd been injured and dropped. The fix: batch every
 *  unique playerId from the draft through kona_player_info's filterIds,
 *  which finds a player regardless of current roster status — verified
 *  live, 168/168 matched in one call, no per-player fetches needed. */
export async function getSeasonDraftWithPositions(espnLeagueId, year) {
  const detail = await fetchDraftDetail(espnLeagueId, year);
  if (!detail || !detail.drafted) return { drafted: false, picks: [] };

  const cookies = getEspnCookies();
  const headers = {};
  if (cookies) headers.Cookie = `espn_s2=${cookies.espn_s2}; SWID=${cookies.swid}`;

  const ids = [...new Set(detail.picks.filter(p => p.playerId > 0).map(p => p.playerId))];
  const filter = { players: { filterIds: { value: ids } } };
  const url = `${ESPN_HOST}/seasons/${year}/segments/0/leagues/${espnLeagueId}?view=kona_player_info`;
  const res = await fetch(url, { headers: { ...headers, "x-fantasy-filter": JSON.stringify(filter) } });
  if (!res.ok) throw new Error(`ESPN API returned HTTP ${res.status} looking up ${ids.length} draft-pick players for ${year}`);
  const playerData = await res.json();
  const idToPlayer = new Map((playerData.players || []).map(entry => [entry.player.id, entry.player]));

  const picks = detail.picks
    .filter(p => p.playerId > 0)
    .map(p => {
      const player = idToPlayer.get(p.playerId);
      return {
        espnPlayerId: p.playerId,
        name: player?.fullName ?? null,
        position: player ? (POSITION_ID_MAP[player.defaultPositionId] ?? null) : null,
        team: detail.teamNameById.get(p.teamId) || `Team ${p.teamId}`,
        price: p.bidAmount,
        keeper: p.keeper,
        round: p.roundId,
        overallPick: p.overallPickNumber,
      };
    });
  return { drafted: true, picks };
}
