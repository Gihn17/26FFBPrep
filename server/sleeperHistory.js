// Sleeper League History client — writes into the SAME history_teams/
// history_matchups tables server/espn.js owns (see that file's schema).
// Confirmed live before building this that reusing those tables is
// correct, not a hack: espn_team_id is really just an opaque per-season
// team-slot id (Sleeper's roster_id drops in fine), and owner_guid is
// really just "the stable cross-season identity" (Sleeper's owner_id —
// verified identical across all 4 of Final Fantasy's seasons for the same
// person, same role ESPN's primaryOwner GUID plays). Column names stay
// ESPN-flavored on purpose — renaming would be a real migration for zero
// functional gain.
//
// Two structural differences from ESPN's client, both verified live:
//   - Sleeper has no single "give me the whole season" call — one call per
//     WEEK (verified: /matchups/{week} works identically for a regular-
//     season week and a playoff week, on a season back to 2023).
//   - Sleeper has no pre-computed "final rank" field (ESPN's
//     rankCalculatedFinal) — it gives winners_bracket/losers_bracket
//     instead, and final rank has to be derived. See deriveFinalRanks().
import { db } from "./db.js";

const SLEEPER_BASE = "https://api.sleeper.app/v1";

async function sGet(path) {
  const res = await fetch(`${SLEEPER_BASE}${path}`);
  if (!res.ok) throw new Error(`Sleeper API returned HTTP ${res.status} for ${path}`);
  return res.json();
}

/** Walks previous_league_id back to the oldest season Sleeper still links
 *  to (verified live: Final Fantasy terminates cleanly at 2023, Sin Bin
 *  Dynasty at 2024 — previous_league_id becomes null/0, not a failed
 *  fetch). Returns [{season, sleeperLeagueId}, ...], oldest first. */
async function fetchChain(sleeperLeagueId) {
  const chain = [];
  let id = sleeperLeagueId;
  while (id) {
    const league = await sGet(`/league/${id}`);
    chain.push({ season: Number(league.season), sleeperLeagueId: id, league });
    id = league.previous_league_id && league.previous_league_id !== "0" ? league.previous_league_id : null;
  }
  return chain.reverse(); // oldest first, matches ESPN's ascending-year loop
}

/** Winner of a bracket match placed at `p` gets rank p, loser gets p+1 —
 *  verified against real 2023 bracket data (matches only carry a `p` field
 *  on placement matches, e.g. a 6-team playoff produces exactly 3 such
 *  matches: p:1/3/5, covering ranks 1-6). The losers bracket uses the same
 *  scheme for the non-playoff teams, offset by playoffTeams (e.g. 6
 *  playoff teams -> losers bracket's own p:1 match decides 7th/8th). An
 *  empty bracket (season not finished, or not started) just yields no
 *  ranks — final_rank stays null, same "in progress" convention ESPN's
 *  side already uses. */
function deriveFinalRanks(winnersBracket, losersBracket, playoffTeams) {
  const ranks = {};
  const apply = (bracket, offset) => {
    for (const m of bracket || []) {
      if (m.p == null || m.w == null) continue;
      const loser = m.t1 === m.w ? m.t2 : m.t1;
      ranks[m.w] = offset + m.p;
      if (loser != null) ranks[loser] = offset + m.p + 1;
    }
  };
  apply(winnersBracket, 0);
  apply(losersBracket, playoffTeams);
  return ranks;
}

/** Both scores exactly 0 means "not really played" — same convention
 *  src/pages/history/SeasonPage.jsx already uses for ESPN, applied here so
 *  an in-progress season (e.g. Sin Bin Dynasty's 2026) only gets weeks
 *  actually played, not a run of fake 0-0 future games. */
function reallyPlayed(a, b) {
  return !(a === 0 && b === 0);
}

async function fetchSeasonMatchups(sleeperLeagueId) {
  const weeks = {};
  for (let week = 1; week <= 18; week++) {
    const entries = await sGet(`/league/${sleeperLeagueId}/matchups/${week}`);
    if (Array.isArray(entries) && entries.length) weeks[week] = entries;
  }
  return weeks;
}

function logoUrl(user) {
  if (user.metadata?.avatar) return user.metadata.avatar; // custom upload, already a full URL
  if (user.avatar) return `https://sleepercdn.com/avatars/thumbs/${user.avatar}`; // verified live — a real, working image URL
  return null;
}

function upsertSleeperSeason(leagueId, season, { rosters, users, winnersBracket, losersBracket, playoffTeams, matchupsByWeek, playoffWeekStart }) {
  const userById = new Map(users.map(u => [u.user_id, u]));
  const finalRanks = deriveFinalRanks(winnersBracket, losersBracket, playoffTeams);
  // A roster that ever appears in the winners bracket made the playoffs —
  // every one of their playoff-week games is WINNERS_BRACKET; everyone
  // else's playoff-week games are the consolation ladder. Verified this
  // membership-based read is enough (no per-round bracket walk needed):
  // teams don't move between the two brackets once assigned.
  const playoffRosterIds = new Set();
  for (const m of winnersBracket || []) { if (m.t1 != null) playoffRosterIds.add(m.t1); if (m.t2 != null) playoffRosterIds.add(m.t2); }

  const upsertTeam = db.prepare(`
    INSERT INTO history_teams (league_id, season, espn_team_id, team_name, owner_guid, owner_name, final_rank, logo, division_id, division_name)
    VALUES (@league_id, @season, @espn_team_id, @team_name, @owner_guid, @owner_name, @final_rank, @logo, NULL, NULL)
    ON CONFLICT(league_id, season, espn_team_id) DO UPDATE SET
      team_name=excluded.team_name, owner_guid=excluded.owner_guid, owner_name=excluded.owner_name,
      final_rank=excluded.final_rank, logo=excluded.logo
  `);
  const upsertMatchup = db.prepare(`
    INSERT INTO history_matchups (league_id, season, week, playoff_tier, home_team_id, away_team_id, home_score, away_score, winner)
    VALUES (@league_id, @season, @week, @playoff_tier, @home_team_id, @away_team_id, @home_score, @away_score, @winner)
    ON CONFLICT(league_id, season, week, home_team_id, away_team_id) DO UPDATE SET
      home_score=excluded.home_score, away_score=excluded.away_score, winner=excluded.winner, playoff_tier=excluded.playoff_tier
  `);

  const txn = db.transaction(() => {
    for (const r of rosters) {
      const user = userById.get(r.owner_id);
      upsertTeam.run({
        league_id: leagueId, season, espn_team_id: r.roster_id,
        team_name: user?.metadata?.team_name || user?.display_name || `Team ${r.roster_id}`,
        owner_guid: r.owner_id ? String(r.owner_id) : null,
        owner_name: user?.display_name || null,
        final_rank: finalRanks[r.roster_id] ?? null,
        logo: user ? logoUrl(user) : null,
      });
    }
    for (const [weekStr, entries] of Object.entries(matchupsByWeek)) {
      const week = Number(weekStr);
      const byMatchup = new Map();
      for (const e of entries) {
        if (!byMatchup.has(e.matchup_id)) byMatchup.set(e.matchup_id, []);
        byMatchup.get(e.matchup_id).push(e);
      }
      for (const pair of byMatchup.values()) {
        // Lower roster_id = "home", arbitrary but deterministic (needed so
        // re-running a refresh upserts the same row instead of creating a
        // mirror-image duplicate under the UNIQUE constraint).
        pair.sort((a, b) => a.roster_id - b.roster_id);
        const [home, away] = pair;
        if (!reallyPlayed(home.points || 0, away ? (away.points || 0) : 0)) continue;
        let tier = "NONE";
        if (week >= playoffWeekStart) {
          const homeIn = playoffRosterIds.has(home.roster_id);
          const awayIn = away ? playoffRosterIds.has(away.roster_id) : homeIn;
          tier = homeIn && awayIn ? "WINNERS_BRACKET" : (!homeIn && !awayIn ? "LOSERS_CONSOLATION_LADDER" : "NONE");
        }
        const homeScore = home.points ?? null, awayScore = away ? (away.points ?? null) : null;
        upsertMatchup.run({
          league_id: leagueId, season, week, playoff_tier: tier,
          home_team_id: home.roster_id, away_team_id: away ? away.roster_id : null,
          home_score: homeScore, away_score: awayScore,
          winner: away == null ? "UNDECIDED" : homeScore === awayScore ? "TIE" : (homeScore > awayScore ? "HOME" : "AWAY"),
        });
      }
    }
  });
  txn();
}

/** Walks the whole chain (no year range needed — the chain is self-
 *  terminating, unlike ESPN where a floor year has to be guessed/known).
 *  Same {imported, skipped} return shape as server/espn.js's
 *  refreshLeagueHistory so the existing Refresh History UI in
 *  src/pages/history/Layout.jsx works unchanged for either platform. */
export async function refreshSleeperHistory(leagueId, sleeperLeagueId) {
  const imported = [];
  const skipped = [];
  let chain;
  try {
    chain = await fetchChain(sleeperLeagueId);
  } catch (e) {
    return { imported, skipped: [{ year: "?", reason: e.message }] };
  }
  for (const { season, sleeperLeagueId: sid, league } of chain) {
    try {
      const [rosters, users, winnersBracket, losersBracket] = await Promise.all([
        sGet(`/league/${sid}/rosters`),
        sGet(`/league/${sid}/users`),
        sGet(`/league/${sid}/winners_bracket`).catch(() => []),
        sGet(`/league/${sid}/losers_bracket`).catch(() => []),
      ]);
      const matchupsByWeek = await fetchSeasonMatchups(sid);
      upsertSleeperSeason(leagueId, season, {
        rosters, users, winnersBracket, losersBracket,
        playoffTeams: league.settings?.playoff_teams || 0,
        playoffWeekStart: league.settings?.playoff_week_start || 99,
        matchupsByWeek,
      });
      imported.push(season);
    } catch (e) {
      skipped.push({ year: season, reason: e.message });
    }
  }
  return { imported, skipped };
}
