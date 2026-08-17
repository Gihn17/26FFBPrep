// Pure data-shaping helpers shared across every League History sub-page
// (Season, H2H, Champs, Teams). All operate on the raw {teams, matchups}
// payload from GET /api/history/:league — nothing here calls the network.

/** Manual corrections for cases where ESPN's owner_guid doesn't match who
 *  actually managed that team that season — e.g. an ESPN account later
 *  reused by a different real person. This isn't something the API can
 *  tell us; Will confirmed it by hand. Season-scoped views (Season Records,
 *  the Champs season-by-season table) show the corrected name; owner_guid
 *  is cleared for the record, so every aggregation function's existing
 *  "skip records with no owner_guid" check naturally excludes it from
 *  career stats, the Teams/Champs leaderboards, and H2H — no separate
 *  exclusion list to keep in sync with those. */
const OWNERSHIP_CORRECTIONS = [
  // 2011 Koi "Team FUMS" (espn_team_id 10) is linked to Dan Bennett's
  // account, but Will Dose actually ran that team that season.
  { league: "koi", season: 2011, espnTeamId: 10, correctedName: "Will Dose" },
];

/** Apply OWNERSHIP_CORRECTIONS to a raw teams array. Called once, right
 *  after loading, so every page/computation downstream sees the corrected
 *  data without needing to know the correction exists. */
export function applyOwnershipCorrections(league, teams) {
  return teams.map(t => {
    const fix = OWNERSHIP_CORRECTIONS.find(c => c.league === league && c.season === t.season && c.espnTeamId === t.espn_team_id);
    if (!fix) return t;
    return { ...t, owner_name: fix.correctedName, owner_guid: null };
  });
}

/** Per-league display-name shortening, applied at load time (same pattern
 *  as applyOwnershipCorrections, and chained right after it) so every
 *  downstream computation and page just sees the short name already —
 *  nothing has to know this override exists. Default: first name only.
 *  Explicit overrides for cases the default doesn't fit (Forrest Duba
 *  reads as just "Duba", not "Forrest," per Will's call). ESPN's data has
 *  an inconsistent double space in "Forrest  Duba" some seasons — matched
 *  here by normalizing whitespace first rather than listing both variants. */
const DISPLAY_NAME_OVERRIDES = {
  koi: { "Forrest Duba": "Duba" },
};

function firstNameOf(fullName) {
  return fullName.trim().split(/\s+/)[0];
}

export function applyDisplayNames(league, teams) {
  const overrides = DISPLAY_NAME_OVERRIDES[league] || {};
  return teams.map(t => {
    if (!t.owner_name) return t;
    const normalized = t.owner_name.trim().replace(/\s+/g, " ");
    const shortName = overrides[normalized] || firstNameOf(normalized);
    return { ...t, owner_name: shortName };
  });
}

export function teamKey(season, espnTeamId) { return `${season}|${espnTeamId}`; }

export function buildTeamIndex(teams) {
  const idx = new Map();
  for (const t of teams) idx.set(teamKey(t.season, t.espn_team_id), t);
  return idx;
}

/** ESPN pre-populates a season's full schedule with 0-0 placeholder scores
 *  before those weeks are actually played (confirmed: 84 such rows, all in
 *  the current in-progress season). A real fantasy matchup essentially
 *  never ends 0-0, so treat that as "not yet played," not a legitimate
 *  result — otherwise it shows up as a fake "lowest score ever" and pads
 *  every record with games that haven't happened. */
export function isPlayed(m) {
  return m.home_score != null && m.away_score != null && !(m.home_score === 0 && m.away_score === 0);
}

/** Unique owners across all seasons — for the two H2H dropdowns and the
 *  Teams page's career leaderboard. */
export function computeOwnerOptions(teams) {
  const seen = new Map();
  for (const t of teams) if (t.owner_guid && !seen.has(t.owner_guid)) seen.set(t.owner_guid, t.owner_name || t.owner_guid);
  return [...seen.entries()].map(([guid, name]) => ({ guid, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** One logo per franchise (owner), not one per season — a manager's ESPN
 *  logo can change (or lapse) year to year, and old ones are more likely
 *  to be dead links (confirmed: tinypic.com, host of several pre-2018
 *  logos, is gone entirely). Rather than show a different, more fragile
 *  logo depending on which season happens to be on screen, every avatar
 *  everywhere — including historical/season-scoped views — uses this same
 *  single "most recent known logo" per owner. Falls back through earlier
 *  seasons if the latest one on file has no logo set, rather than trusting
 *  the literal latest season's value even when it's null. */
export function computeCurrentLogos(teams) {
  const latest = new Map(); // ownerGuid -> { season, logo }
  for (const t of teams) {
    if (!t.owner_guid || !t.logo) continue;
    const cur = latest.get(t.owner_guid);
    if (!cur || t.season >= cur.season) latest.set(t.owner_guid, { season: t.season, logo: t.logo });
  }
  return new Map([...latest.entries()].map(([guid, v]) => [guid, v.logo]));
}

/** Per-season W/L/T, points for/against, and each team's own high/low week —
 *  scoped to one season, keyed by the season's own team slot (a team's
 *  identity within a season, not yet resolved across seasons). Sorted by
 *  ESPN's final rank when the season is complete (reflects the full
 *  playoff/consolation bracket, not just regular-season record — confirmed
 *  a 6-8 team finished dead last one year), falling back to win/points
 *  ordering for the in-progress season where final_rank is null for
 *  everyone (nothing's been decided yet). */
export function computeSeasonRecords(teams, matchups) {
  const acc = new Map();
  for (const t of teams) {
    acc.set(teamKey(t.season, t.espn_team_id), {
      season: t.season, teamName: t.team_name, ownerName: t.owner_name, ownerGuid: t.owner_guid,
      finalRank: t.final_rank || null, divisionId: t.division_id ?? null, divisionName: t.division_name || null,
      wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, games: 0, high: null, low: null,
    });
  }
  for (const m of matchups) {
    if (m.away_team_id == null || !isPlayed(m)) continue; // bye or not yet played
    const home = acc.get(teamKey(m.season, m.home_team_id));
    const away = acc.get(teamKey(m.season, m.away_team_id));
    if (!home || !away) continue;
    for (const [rec, forScore, againstScore] of [[home, m.home_score, m.away_score], [away, m.away_score, m.home_score]]) {
      rec.pointsFor += forScore; rec.pointsAgainst += againstScore; rec.games++;
      if (rec.high == null || forScore > rec.high) rec.high = forScore;
      if (rec.low == null || forScore < rec.low) rec.low = forScore;
    }
    if (m.winner === "HOME") { home.wins++; away.losses++; }
    else if (m.winner === "AWAY") { away.wins++; home.losses++; }
    else if (m.winner === "TIE") { home.ties++; away.ties++; }
  }
  const bySeason = {};
  for (const rec of acc.values()) (bySeason[rec.season] = bySeason[rec.season] || []).push(rec);
  for (const season of Object.keys(bySeason)) {
    bySeason[season].sort((a, b) => {
      if (a.finalRank != null && b.finalRank != null) return a.finalRank - b.finalRank;
      return b.wins - a.wins || b.pointsFor - a.pointsFor;
    });
  }
  return bySeason;
}

/** Groups one season's already-sorted standings rows (from
 *  computeSeasonRecords) by division, preserving each division's internal
 *  rank order. Divisions themselves are sorted by their best (lowest)
 *  finalRank so the division currently in the lead sorts first. Teams with
 *  no division on file (older data, or a season fetched before divisions
 *  were tracked) land in a single "No Division" bucket rather than being
 *  dropped. */
export function groupByDivision(rows) {
  const groups = new Map(); // divisionId (or "none") -> { name, rows }
  for (const r of rows) {
    const key = r.divisionId != null ? String(r.divisionId) : "none";
    if (!groups.has(key)) groups.set(key, { name: r.divisionName || "No Division", rows: [] });
    groups.get(key).rows.push(r);
  }
  return [...groups.values()].sort((a, b) => {
    const bestA = Math.min(...a.rows.map(r => r.finalRank ?? Infinity));
    const bestB = Math.min(...b.rows.map(r => r.finalRank ?? Infinity));
    return bestA - bestB;
  });
}

/** Every individual matchup between two specific owners — by GUID, not team
 *  slot, so it's correct across seasons even if a team's name/id changed.
 *  Deliberately NOT aggregated: one row per game, most recent first, so a
 *  season with two head-to-head meetings (division rematch) shows as two
 *  rows instead of getting folded into one combined total. */
export function computeH2HGames(teamIdx, matchups, guidA, guidB) {
  if (!guidA || !guidB || guidA === guidB) return [];
  const games = [];
  for (const m of matchups) {
    if (m.away_team_id == null || !isPlayed(m)) continue;
    const home = teamIdx.get(teamKey(m.season, m.home_team_id));
    const away = teamIdx.get(teamKey(m.season, m.away_team_id));
    if (!home?.owner_guid || !away?.owner_guid) continue;
    const guids = [home.owner_guid, away.owner_guid];
    if (!guids.includes(guidA) || !guids.includes(guidB)) continue;
    const aIsHome = home.owner_guid === guidA;
    games.push({
      season: m.season, week: m.week, playoffTier: m.playoff_tier,
      teamNameA: aIsHome ? home.team_name : away.team_name,
      teamNameB: aIsHome ? away.team_name : home.team_name,
      scoreA: aIsHome ? m.home_score : m.away_score,
      scoreB: aIsHome ? m.away_score : m.home_score,
    });
  }
  return games.sort((x, y) => y.season - x.season || y.week - x.week);
}

/** The most recent (season, week) with at least one played game — what the
 *  Head-to-Head page's "Current" quick button jumps to. Falls back to the
 *  most recent season's Week 1 if nothing's been played yet (preseason),
 *  so the picker always lands somewhere real rather than a blank state. */
export function computeLatestPlayedWeek(teams, matchups) {
  let best = null;
  for (const m of matchups) {
    if (!isPlayed(m) || m.away_team_id == null) continue;
    if (!best || m.season > best.season || (m.season === best.season && m.week > best.week)) best = { season: m.season, week: m.week };
  }
  if (best) return best;
  const seasons = teams.map(t => t.season);
  return seasons.length ? { season: Math.max(...seasons), week: 1 } : null;
}

/** Every played matchup in one (season, week) slate, each enriched with
 *  both teams' own record-and-streak through that week and the all-time
 *  head-to-head history between the two opponents as of that game — the
 *  Head-to-Head page's "browse a week" view. Reuses computeH2HGames per
 *  matchup (cheap — a handful of games per week) rather than a bespoke
 *  aggregation, so the two views can never disagree about what a given
 *  pair's history looks like. */
export function computeWeekSlate(teamIdx, matchups, season, week) {
  const logs = computeGameLogs(matchups);
  const tally = (log) => {
    let wins = 0, losses = 0, ties = 0, streakType = null, streakLen = 0;
    for (const g of log) {
      if (g.result === "W") wins++; else if (g.result === "L") losses++; else ties++;
      if (g.result === streakType) streakLen++; else { streakType = g.result; streakLen = 1; }
    }
    return { wins, losses, ties, streakType, streakLen };
  };

  const games = matchups.filter(m => m.season === season && m.week === week && m.away_team_id != null && isPlayed(m));
  return games.map(m => {
    const home = teamIdx.get(teamKey(season, m.home_team_id));
    const away = teamIdx.get(teamKey(season, m.away_team_id));
    const homeRecord = tally((logs.get(teamKey(season, m.home_team_id)) || []).filter(g => g.week <= week));
    const awayRecord = tally((logs.get(teamKey(season, m.away_team_id)) || []).filter(g => g.week <= week));

    let h2h = null;
    if (home?.owner_guid && away?.owner_guid && home.owner_guid !== away.owner_guid) {
      const allGames = [...computeH2HGames(teamIdx, matchups, home.owner_guid, away.owner_guid)].reverse(); // oldest -> newest, A=home, B=away
      const idx = allGames.findIndex(g => g.season === season && g.week === week);
      const prefix = idx >= 0 ? allGames.slice(0, idx + 1) : allGames;
      let winsHome = 0, winsAway = 0, ties = 0, streakSide = null, streakLen = 0;
      for (const g of prefix) {
        if (g.scoreA > g.scoreB) { winsHome++; streakLen = streakSide === "home" ? streakLen + 1 : 1; streakSide = "home"; }
        else if (g.scoreB > g.scoreA) { winsAway++; streakLen = streakSide === "away" ? streakLen + 1 : 1; streakSide = "away"; }
        else { ties++; streakSide = null; streakLen = 0; }
      }
      h2h = { winsHome, winsAway, ties, totalGames: prefix.length, streakSide, streakLen, allGames };
    }

    return {
      season, week, playoffTier: m.playoff_tier,
      homeTeam: home, awayTeam: away, homeScore: m.home_score, awayScore: m.away_score, winner: m.winner,
      homeRecord, awayRecord, h2h,
    };
  });
}

/** Every individual team-week score, flat — high/low is then just "sort and
 *  slice" over whichever seasons are in scope (all-time, one season, or a
 *  custom range), rather than three separately-computed shapes. */
export function computeScoreEntries(teamIdx, matchups) {
  const entries = [];
  for (const m of matchups) {
    if (!isPlayed(m)) continue;
    entries.push({ season: m.season, week: m.week, key: teamKey(m.season, m.home_team_id), score: m.home_score });
    if (m.away_team_id != null) entries.push({ season: m.season, week: m.week, key: teamKey(m.season, m.away_team_id), score: m.away_score });
  }
  return entries.map(e => ({ ...e, team: teamIdx.get(e.key) })).filter(e => e.team);
}

/** Career totals per owner (GUID) across every season — the Teams page's
 *  all-time leaderboard, and the source for the Champs page's "titles won"
 *  count. */
export function computeCareerStats(teams, seasonRecords) {
  const byOwner = new Map();
  for (const t of teams) {
    if (!t.owner_guid) continue;
    if (!byOwner.has(t.owner_guid)) {
      byOwner.set(t.owner_guid, {
        ownerGuid: t.owner_guid, ownerName: t.owner_name,
        seasons: 0, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0,
        championships: 0, lastPlaceFinishes: 0, bestRank: null, worstRank: null,
      });
    }
  }
  for (const season of Object.keys(seasonRecords)) {
    const rows = seasonRecords[season];
    const maxRank = Math.max(...rows.map(r => r.finalRank || 0));
    for (const r of rows) {
      const rec = byOwner.get(r.ownerGuid);
      if (!rec) continue;
      rec.seasons++;
      rec.wins += r.wins; rec.losses += r.losses; rec.ties += r.ties;
      rec.pointsFor += r.pointsFor; rec.pointsAgainst += r.pointsAgainst;
      if (r.finalRank === 1) rec.championships++;
      if (r.finalRank != null && r.finalRank === maxRank && maxRank > 0) rec.lastPlaceFinishes++;
      if (r.finalRank != null) {
        if (rec.bestRank == null || r.finalRank < rec.bestRank) rec.bestRank = r.finalRank;
        if (rec.worstRank == null || r.finalRank > rec.worstRank) rec.worstRank = r.finalRank;
      }
    }
  }
  return [...byOwner.values()].sort((a, b) => b.championships - a.championships || b.wins - a.wins);
}

// ============================================================
// Stats page — Matchups (blowouts / narrow wins, loss-with-most-points /
// win-with-fewest), Scores (single-game and season-PPG extremes), and
// Streaks (longest win/loss runs, within a season or chained across
// seasons by owner). All scoped to whatever `activeYears` the caller's
// season filter currently has selected.
// ============================================================

/** Every played matchup's winning margin, sorted both directions —
 *  "Cakewalk" (biggest blowouts) and "Nailbiter" (closest games,
 *  including ties at margin 0). */
export function computeBlowouts(teamIdx, matchups, activeYears) {
  const games = [];
  for (const m of matchups) {
    if (m.away_team_id == null || !isPlayed(m) || !activeYears.includes(m.season) || m.winner === "TIE") continue;
    const home = teamIdx.get(teamKey(m.season, m.home_team_id));
    const away = teamIdx.get(teamKey(m.season, m.away_team_id));
    if (!home || !away) continue;
    const homeWon = m.winner === "HOME";
    const winner = homeWon ? home : away, loser = homeWon ? away : home;
    const winnerScore = homeWon ? m.home_score : m.away_score;
    const loserScore = homeWon ? m.away_score : m.home_score;
    games.push({
      season: m.season, week: m.week,
      winnerName: winner.owner_name || winner.team_name, loserName: loser.owner_name || loser.team_name,
      winnerGuid: winner.owner_guid, winnerTeamName: winner.team_name,
      loserGuid: loser.owner_guid, loserTeamName: loser.team_name,
      winnerScore, loserScore, margin: winnerScore - loserScore,
    });
  }
  return {
    biggest: [...games].sort((a, b) => b.margin - a.margin),
    closest: [...games].sort((a, b) => a.margin - b.margin),
  };
}

/** The losing team's score in every game they still lost ("Heartbreak" —
 *  scored well and still lost), and the winning team's score in every game
 *  they still won ("Criminal" — barely showed up and still won). */
export function computeLossWinExtremes(teamIdx, matchups, activeYears) {
  const games = [];
  for (const m of matchups) {
    if (m.away_team_id == null || !isPlayed(m) || !activeYears.includes(m.season) || m.winner === "TIE") continue;
    const home = teamIdx.get(teamKey(m.season, m.home_team_id));
    const away = teamIdx.get(teamKey(m.season, m.away_team_id));
    if (!home || !away) continue;
    const homeWon = m.winner === "HOME";
    const winner = homeWon ? home : away, loser = homeWon ? away : home;
    const winnerScore = homeWon ? m.home_score : m.away_score;
    const loserScore = homeWon ? m.away_score : m.home_score;
    games.push({
      season: m.season, week: m.week,
      winnerName: winner.owner_name || winner.team_name, loserName: loser.owner_name || loser.team_name,
      winnerGuid: winner.owner_guid, winnerTeamName: winner.team_name,
      loserGuid: loser.owner_guid, loserTeamName: loser.team_name,
      winnerScore, loserScore,
    });
  }
  return {
    heartbreak: [...games].sort((a, b) => b.loserScore - a.loserScore),
    criminal: [...games].sort((a, b) => a.winnerScore - b.winnerScore),
  };
}

/** Season-long points-per-game, both directions — "Powerhouse" (highest
 *  scoring seasons) and "Gauntlet" (lowest). Uses seasonRecords (already
 *  has pointsFor/games per team-season) rather than re-deriving from raw
 *  matchups. */
export function computeSeasonPPG(seasonRecords, activeYears) {
  const rows = [];
  for (const season of activeYears) {
    for (const r of (seasonRecords[season] || [])) {
      if (!r.games) continue;
      rows.push({ season: r.season, name: r.ownerName || r.teamName, ownerGuid: r.ownerGuid, teamName: r.teamName, ppg: r.pointsFor / r.games, games: r.games });
    }
  }
  return {
    highest: [...rows].sort((a, b) => b.ppg - a.ppg),
    lowest: [...rows].sort((a, b) => a.ppg - b.ppg),
  };
}

/** Walks an already-chronologically-sorted list of {result: 'W'|'L'|'T'}
 *  games and finds the longest win run and longest loss run. A tie breaks
 *  both kinds of streak (it's neither a win nor a loss) without itself
 *  starting a new counted streak. */
function longestStreaksFromGames(games) {
  let bestWin = 0, bestWinRange = null, bestLoss = 0, bestLossRange = null;
  let curType = null, curLen = 0, curStartIdx = 0;
  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    curLen = (g.result === curType) ? curLen + 1 : 1;
    if (g.result !== curType) { curType = g.result; curStartIdx = i; }
    if (curType === "W" && curLen > bestWin) { bestWin = curLen; bestWinRange = { start: games[curStartIdx], end: g }; }
    if (curType === "L" && curLen > bestLoss) { bestLoss = curLen; bestLossRange = { start: games[curStartIdx], end: g }; }
  }
  return { bestWin, bestWinRange, bestLoss, bestLossRange };
}

/** Games grouped by (season, team slot) — streaks that reset at the start
 *  of every season. Ownership-corrected records (see
 *  OWNERSHIP_CORRECTIONS — no owner_guid) still show up here, same as
 *  Season Records, since this is season-scoped and doesn't need cross-
 *  season identity. */
function gamesByTeamSeason(teamIdx, matchups, activeYears) {
  const groups = new Map();
  for (const m of matchups) {
    if (m.away_team_id == null || !isPlayed(m) || !activeYears.includes(m.season)) continue;
    const home = teamIdx.get(teamKey(m.season, m.home_team_id));
    const away = teamIdx.get(teamKey(m.season, m.away_team_id));
    if (!home || !away) continue;
    const homeResult = m.winner === "HOME" ? "W" : m.winner === "AWAY" ? "L" : "T";
    const awayResult = m.winner === "AWAY" ? "W" : m.winner === "HOME" ? "L" : "T";
    const hKey = teamKey(m.season, m.home_team_id), aKey = teamKey(m.season, m.away_team_id);
    if (!groups.has(hKey)) groups.set(hKey, { name: home.owner_name || home.team_name, ownerGuid: home.owner_guid, teamName: home.team_name, season: m.season, games: [] });
    if (!groups.has(aKey)) groups.set(aKey, { name: away.owner_name || away.team_name, ownerGuid: away.owner_guid, teamName: away.team_name, season: m.season, games: [] });
    groups.get(hKey).games.push({ week: m.week, result: homeResult });
    groups.get(aKey).games.push({ week: m.week, result: awayResult });
  }
  for (const g of groups.values()) g.games.sort((a, b) => a.week - b.week);
  return groups;
}

/** Games grouped by owner GUID, chained across every season in scope in
 *  chronological order — streaks that can span a season boundary (last 3
 *  wins of one year + first 5 of the next = an 8-game overall streak).
 *  Ownership-corrected records are excluded (no owner_guid), same as every
 *  other cross-season aggregation in this file. */
function gamesByOwner(teamIdx, matchups, activeYears) {
  const groups = new Map();
  for (const m of matchups) {
    if (m.away_team_id == null || !isPlayed(m) || !activeYears.includes(m.season)) continue;
    const home = teamIdx.get(teamKey(m.season, m.home_team_id));
    const away = teamIdx.get(teamKey(m.season, m.away_team_id));
    if (!home?.owner_guid || !away?.owner_guid) continue;
    const homeResult = m.winner === "HOME" ? "W" : m.winner === "AWAY" ? "L" : "T";
    const awayResult = m.winner === "AWAY" ? "W" : m.winner === "HOME" ? "L" : "T";
    if (!groups.has(home.owner_guid)) groups.set(home.owner_guid, { name: home.owner_name, ownerGuid: home.owner_guid, teamName: home.team_name, games: [] });
    if (!groups.has(away.owner_guid)) groups.set(away.owner_guid, { name: away.owner_name, ownerGuid: away.owner_guid, teamName: away.team_name, games: [] });
    groups.get(home.owner_guid).games.push({ season: m.season, week: m.week, result: homeResult });
    groups.get(away.owner_guid).games.push({ season: m.season, week: m.week, result: awayResult });
  }
  for (const g of groups.values()) g.games.sort((a, b) => a.season - b.season || a.week - b.week);
  return groups;
}

/** mode: "season" (resets every year) | "overall" (chained across years by
 *  owner). Returns the longest win streak and longest loss streak per
 *  team/owner, each with the season/week range it happened over. */
export function computeStreaks(teamIdx, matchups, activeYears, mode) {
  const groups = mode === "overall" ? gamesByOwner(teamIdx, matchups, activeYears) : gamesByTeamSeason(teamIdx, matchups, activeYears);
  const winStreaks = [], lossStreaks = [];
  for (const g of groups.values()) {
    const { bestWin, bestWinRange, bestLoss, bestLossRange } = longestStreaksFromGames(g.games);
    if (bestWin > 0) winStreaks.push({
      name: g.name, ownerGuid: g.ownerGuid, teamName: g.teamName, len: bestWin,
      startSeason: bestWinRange.start.season ?? g.season, endSeason: bestWinRange.end.season ?? g.season,
      startWeek: bestWinRange.start.week, endWeek: bestWinRange.end.week,
    });
    if (bestLoss > 0) lossStreaks.push({
      name: g.name, ownerGuid: g.ownerGuid, teamName: g.teamName, len: bestLoss,
      startSeason: bestLossRange.start.season ?? g.season, endSeason: bestLossRange.end.season ?? g.season,
      startWeek: bestLossRange.start.week, endWeek: bestLossRange.end.week,
    });
  }
  return {
    winStreaks: winStreaks.sort((a, b) => b.len - a.len),
    lossStreaks: lossStreaks.sort((a, b) => b.len - a.len),
  };
}

// ============================================================
// Champs page — all-time championships/runner-ups ranking and playoff
// participation, on top of the per-season champion/runner-up already in
// seasonRecords.
// ============================================================

/** All-time championships + runner-up counts per owner — the "Dynasty
 *  Rankings" list. Separate from computeCareerStats since that only
 *  tracks championships, not runner-ups. */
export function computeDynastyRankings(teams, seasonRecords) {
  const byOwner = new Map();
  for (const t of teams) {
    if (!t.owner_guid) continue;
    if (!byOwner.has(t.owner_guid)) byOwner.set(t.owner_guid, { ownerGuid: t.owner_guid, ownerName: t.owner_name, championships: 0, runnerUps: 0 });
  }
  for (const season of Object.keys(seasonRecords)) {
    for (const r of seasonRecords[season]) {
      const rec = byOwner.get(r.ownerGuid);
      if (!rec) continue;
      if (r.finalRank === 1) rec.championships++;
      if (r.finalRank === 2) rec.runnerUps++;
    }
  }
  return [...byOwner.values()].sort((a, b) => b.championships - a.championships || b.runnerUps - a.runnerUps);
}

/** Playoff appearances (distinct seasons with at least one real playoff
 *  game) and playoff wins, per owner — counting ONLY the winners bracket.
 *  The consolation ladders (WINNERS_CONSOLATION_LADDER,
 *  LOSERS_CONSOLATION_LADDER) are placement games for teams that already
 *  missed the actual playoffs, not "making the playoffs" themselves. */
export function computePlayoffLegends(teamIdx, matchups) {
  const apps = new Map(); // ownerGuid -> Set(season)
  const wins = new Map(); // ownerGuid -> count
  const names = new Map();
  for (const m of matchups) {
    if (m.playoff_tier !== "WINNERS_BRACKET" || m.away_team_id == null || !isPlayed(m)) continue;
    const home = teamIdx.get(teamKey(m.season, m.home_team_id));
    const away = teamIdx.get(teamKey(m.season, m.away_team_id));
    for (const [team, won] of [[home, m.winner === "HOME"], [away, m.winner === "AWAY"]]) {
      if (!team?.owner_guid) continue;
      names.set(team.owner_guid, team.owner_name);
      if (!apps.has(team.owner_guid)) apps.set(team.owner_guid, new Set());
      apps.get(team.owner_guid).add(m.season);
      if (won) wins.set(team.owner_guid, (wins.get(team.owner_guid) || 0) + 1);
    }
  }
  const appsArr = [...apps.entries()].map(([guid, seasons]) => ({ ownerGuid: guid, name: names.get(guid), count: seasons.size })).sort((a, b) => b.count - a.count);
  const winsArr = [...wins.entries()].map(([guid, count]) => ({ ownerGuid: guid, name: names.get(guid), count })).sort((a, b) => b.count - a.count);
  return { apps: appsArr, wins: winsArr };
}

// ============================================================
// Teams page — one card/page per franchise (owner_guid), not per
// season-team-slot, so a team's whole history lives at one URL even
// across name changes. Reuses computeCareerStats/computeDynastyRankings/
// computePlayoffLegends rather than re-deriving totals a second way.
// ============================================================

/** Route-safe id for an owner GUID — ESPN's GUIDs come wrapped in curly
 *  braces ("{46DA...}") which are awkward in a URL path; strip them since
 *  the remaining hex is already unique on its own. */
export function ownerSlug(guid) {
  return (guid || "").replace(/[{}]/g, "");
}

/** One row per franchise for the Teams grid: latest team name, the owner's
 *  first/most recent season (est./active), and the trophy/medal/last-place
 *  counts the card badges are built from. `active` = fielded a team in the
 *  most recent season on file, regardless of whether that season is
 *  finalized yet. */
export function computeFranchises(teams, careerStats, dynastyRankings) {
  const runnerUpsByGuid = new Map(dynastyRankings.map(d => [d.ownerGuid, d.runnerUps]));
  const currentLogos = computeCurrentLogos(teams);
  const latestSeason = Math.max(...teams.map(t => t.season));
  const byOwner = new Map();
  for (const t of teams) {
    if (!t.owner_guid) continue;
    if (!byOwner.has(t.owner_guid)) byOwner.set(t.owner_guid, { estYear: t.season, lastYear: t.season, teamName: t.team_name });
    const f = byOwner.get(t.owner_guid);
    if (t.season < f.estYear) f.estYear = t.season;
    if (t.season >= f.lastYear) { f.lastYear = t.season; f.teamName = t.team_name; } // most recent season's name wins
  }
  return careerStats.map(c => {
    const f = byOwner.get(c.ownerGuid) || {};
    return {
      ownerGuid: c.ownerGuid, ownerName: c.ownerName, teamName: f.teamName || c.ownerName, logo: currentLogos.get(c.ownerGuid) || null,
      estYear: f.estYear, lastYear: f.lastYear, active: f.lastYear === latestSeason,
      seasons: c.seasons, championships: c.championships, runnerUps: runnerUpsByGuid.get(c.ownerGuid) || 0,
      lastPlaceFinishes: c.lastPlaceFinishes,
    };
  });
}

// ============================================================
// Team detail page — Season History table's Expected/Overall/WW columns,
// and per-franchise "Team Records" cards (the same Juggernaut/Cakewalk/
// Powerhouse/streak stats the Stats page shows league-wide, scoped down
// to one owner's games).
// ============================================================

/** Per-(season,week) all-play and median-expected results for every team
 *  slot, keyed by teamKey. Two different "how good was this record really"
 *  measures, both standard in fantasy analytics:
 *   - all-play: treat every OTHER score that same week as a hypothetical
 *     opponent — how many of those would this score have beaten?
 *   - expected (median): a single win if the score beat the week's
 *     median, a single loss if it didn't (same game-count as the real
 *     schedule, unlike all-play).
 *  weeklyHighs counts weeks this team had the single best score in the
 *  league (ties for the top score all count). Byes (a lone team with no
 *  opponent that week) still contribute their score to the pool so
 *  everyone else's all-play/median comparison is complete, they just don't
 *  generate a real matchup of their own. */
export function computeFranchiseWeeklyStats(matchups) {
  const weekScores = new Map(); // "season|week" -> [{key, score}]
  for (const m of matchups) {
    if (!isPlayed(m)) continue;
    const wk = `${m.season}|${m.week}`;
    if (!weekScores.has(wk)) weekScores.set(wk, []);
    weekScores.get(wk).push({ key: teamKey(m.season, m.home_team_id), score: m.home_score });
    if (m.away_team_id != null) weekScores.get(wk).push({ key: teamKey(m.season, m.away_team_id), score: m.away_score });
  }
  const acc = new Map();
  const get = (key) => {
    if (!acc.has(key)) acc.set(key, { allPlayW: 0, allPlayL: 0, allPlayT: 0, expW: 0, expL: 0, expT: 0, weeklyHighs: 0 });
    return acc.get(key);
  };
  for (const entries of weekScores.values()) {
    const sorted = [...entries.map(e => e.score)].sort((a, b) => a - b);
    const mid = sorted.length / 2;
    const median = Number.isInteger(mid) ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[Math.floor(mid)];
    const maxScore = Math.max(...sorted);
    for (const e of entries) {
      const rec = get(e.key);
      for (const other of entries) {
        if (other === e) continue;
        if (e.score > other.score) rec.allPlayW++;
        else if (e.score < other.score) rec.allPlayL++;
        else rec.allPlayT++;
      }
      if (e.score > median) rec.expW++;
      else if (e.score < median) rec.expL++;
      else rec.expT++;
      if (e.score === maxScore) rec.weeklyHighs++;
    }
  }
  return acc;
}

/** Last `n` results (chronological, oldest→newest) for every team-slot in
 *  one season — the Season page's "Form" column. Keyed by espn_team_id
 *  since it's always used within a single already-known season. */
export function computeSeasonFormGuide(matchups, season, n = 5) {
  const byTeam = new Map();
  for (const m of matchups) {
    if (m.season !== season || m.away_team_id == null || !isPlayed(m)) continue;
    const homeResult = m.winner === "HOME" ? "W" : m.winner === "AWAY" ? "L" : "T";
    const awayResult = m.winner === "AWAY" ? "W" : m.winner === "HOME" ? "L" : "T";
    if (!byTeam.has(m.home_team_id)) byTeam.set(m.home_team_id, []);
    if (!byTeam.has(m.away_team_id)) byTeam.set(m.away_team_id, []);
    byTeam.get(m.home_team_id).push({ week: m.week, result: homeResult });
    byTeam.get(m.away_team_id).push({ week: m.week, result: awayResult });
  }
  const out = new Map();
  for (const [id, games] of byTeam) {
    games.sort((a, b) => a.week - b.week);
    out.set(id, games.slice(-n));
  }
  return out;
}

/** Standings for a set of seasons combined — one row per FRANCHISE (owner),
 *  not per team-slot, with every counting stat summed across whichever
 *  seasons in `activeYears` that owner actually played. This is what
 *  drives the multi-season "aggregate" table; a single-season selection
 *  uses the plain per-team-slot seasonRecords instead (a franchise concept
 *  isn't needed when there's only one season in scope). */
export function computeAggregateStandings(teams, seasonRecords, weeklyStats, activeYears) {
  // Uses the full `teams` array (not just the seasons in scope) so a
  // custom year-range still shows each franchise's true current logo, not
  // whatever they had during that older window.
  const currentLogos = computeCurrentLogos(teams);
  const byOwner = new Map();
  for (const t of teams) {
    if (!t.owner_guid || !activeYears.includes(t.season)) continue;
    if (!byOwner.has(t.owner_guid)) {
      byOwner.set(t.owner_guid, {
        ownerGuid: t.owner_guid, ownerName: t.owner_name, teamName: t.team_name, logo: currentLogos.get(t.owner_guid) || null, lastYear: t.season,
        seasons: 0, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0,
        expW: 0, expL: 0, allPlayW: 0, allPlayL: 0, weeklyHighs: 0,
      });
    }
    const f = byOwner.get(t.owner_guid);
    if (t.season >= f.lastYear) { f.lastYear = t.season; f.teamName = t.team_name; } // most recent name in range wins
    const r = (seasonRecords[t.season] || []).find(r => r.ownerGuid === t.owner_guid);
    if (r) {
      f.seasons++;
      f.wins += r.wins; f.losses += r.losses; f.ties += r.ties;
      f.pointsFor += r.pointsFor; f.pointsAgainst += r.pointsAgainst;
    }
    const w = weeklyStats.get(teamKey(t.season, t.espn_team_id));
    if (w) {
      f.expW += w.expW; f.expL += w.expL;
      f.allPlayW += w.allPlayW; f.allPlayL += w.allPlayL;
      f.weeklyHighs += w.weeklyHighs;
    }
  }
  return [...byOwner.values()].sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
}

// ============================================================
// Season page — playoff probability for the in-progress season: "of every
// team-season in this league's history that had the exact same record
// after the exact same number of games, what percent made the playoffs?"
// ============================================================

/** Which (season, espnTeamId) slots made the real playoffs — appeared in
 *  at least one WINNERS_BRACKET game that season. Team-slot keyed (not
 *  owner_guid keyed like computePlayoffLegends), since this is entirely
 *  season-scoped and needs to work even for the corrected 2011 team. */
function computeMadePlayoffsSet(matchups) {
  const made = new Set();
  for (const m of matchups) {
    if (m.playoff_tier !== "WINNERS_BRACKET" || m.away_team_id == null || !isPlayed(m)) continue;
    made.add(teamKey(m.season, m.home_team_id));
    made.add(teamKey(m.season, m.away_team_id));
  }
  return made;
}

/** Every team-slot's chronological game-by-game results, keyed by teamKey,
 *  sorted by week. Shared by the historical pool (every past season) and
 *  the target season's own teams (same walk, just used differently). */
function computeGameLogs(matchups) {
  const logs = new Map();
  for (const m of matchups) {
    if (m.away_team_id == null || !isPlayed(m)) continue;
    const hKey = teamKey(m.season, m.home_team_id), aKey = teamKey(m.season, m.away_team_id);
    const homeResult = m.winner === "HOME" ? "W" : m.winner === "AWAY" ? "L" : "T";
    const awayResult = m.winner === "AWAY" ? "W" : m.winner === "HOME" ? "L" : "T";
    if (!logs.has(hKey)) logs.set(hKey, []);
    if (!logs.has(aKey)) logs.set(aKey, []);
    logs.get(hKey).push({ week: m.week, result: homeResult });
    logs.get(aKey).push({ week: m.week, result: awayResult });
  }
  for (const log of logs.values()) log.sort((a, b) => a.week - b.week);
  return logs;
}

/** For every team-season in league history EXCEPT `targetSeason`, indexes
 *  "after G games, this team's record was W-L-T" -> did they make the
 *  playoffs that season. Only pulls from seasons that actually finished
 *  (have a decided champion) so a second in-progress season can never
 *  contaminate the pool. `targetSeason` is a parameter (not hardcoded to
 *  "the current season") so this same function can be pointed at a
 *  completed past season to sanity-check the method against a known real
 *  outcome, not just used live on data that doesn't exist yet. */
function buildPlayoffOddsPool(teams, matchups, seasonRecords, targetSeason) {
  const madePlayoffs = computeMadePlayoffsSet(matchups);
  const logs = computeGameLogs(matchups);
  const pool = new Map(); // "games|w|l|t" -> { total, made }
  const seasons = new Set(teams.map(t => t.season));
  for (const season of seasons) {
    if (season === targetSeason) continue;
    if (!(seasonRecords[season] || []).some(r => r.finalRank === 1)) continue; // skip unfinished seasons
    for (const t of teams.filter(t => t.season === season)) {
      const key = teamKey(season, t.espn_team_id);
      const log = logs.get(key) || [];
      let w = 0, l = 0, tt = 0;
      log.forEach((g, i) => {
        if (g.result === "W") w++; else if (g.result === "L") l++; else tt++;
        const poolKey = `${i + 1}|${w}|${l}|${tt}`;
        if (!pool.has(poolKey)) pool.set(poolKey, { total: 0, made: 0 });
        const entry = pool.get(poolKey);
        entry.total++;
        if (madePlayoffs.has(key)) entry.made++;
      });
    }
  }
  return pool;
}

/** Playoff probability for every team in `targetSeason`, based on their
 *  actual current record: "of every team-season in this league's history
 *  with the same record after the same number of games, what percent made
 *  the playoffs?" Below `minGames` played the sample is dominated by
 *  small-n noise (a 1-0 start matches almost every good team's start), so
 *  callers should gate display on `gamesPlayed >= minGames` themselves —
 *  this still returns a result either way, un-opinionated about the UI. */
export function computePlayoffProbabilities(teams, matchups, seasonRecords, targetSeason, asOfGames = Infinity) {
  const pool = buildPlayoffOddsPool(teams, matchups, seasonRecords, targetSeason);
  const madePlayoffs = computeMadePlayoffsSet(matchups);
  const logs = computeGameLogs(matchups);
  const targetTeams = teams.filter(t => t.season === targetSeason);
  return targetTeams.map(t => {
    const key = teamKey(targetSeason, t.espn_team_id);
    const log = (logs.get(key) || []).slice(0, asOfGames);
    let w = 0, l = 0, tt = 0;
    for (const g of log) { if (g.result === "W") w++; else if (g.result === "L") l++; else tt++; }
    const gamesPlayed = log.length;
    const poolKey = `${gamesPlayed}|${w}|${l}|${tt}`;
    const entry = pool.get(poolKey);
    const probability = entry && entry.total > 0 ? (entry.made / entry.total) * 100 : null;

    // "click to view more data" — every historical team-season that fed
    // this percentage, for the expanded detail view.
    const matches = [];
    if (gamesPlayed > 0) {
      const seasons = new Set(teams.map(x => x.season));
      for (const season of seasons) {
        if (season === targetSeason || !(seasonRecords[season] || []).some(r => r.finalRank === 1)) continue;
        for (const other of teams.filter(x => x.season === season)) {
          const oKey = teamKey(season, other.espn_team_id);
          const oLog = (logs.get(oKey) || []).slice(0, gamesPlayed);
          if (oLog.length < gamesPlayed) continue;
          let ow = 0, ol = 0, ot = 0;
          for (const g of oLog) { if (g.result === "W") ow++; else if (g.result === "L") ol++; else ot++; }
          if (ow === w && ol === l && ot === tt) {
            matches.push({ season, ownerName: other.owner_name, teamName: other.team_name, madePlayoffs: madePlayoffs.has(oKey) });
          }
        }
      }
    }

    return {
      ownerGuid: t.owner_guid, ownerName: t.owner_name, teamName: t.team_name,
      gamesPlayed, wins: w, losses: l, ties: tt, probability, sampleSize: entry?.total || 0, matches,
    };
  });
}

/** The 8 "Team Records" cards on a franchise's page — the Stats page's
 *  Juggernaut/Featherweight/Cakewalk/Nailbiter/Powerhouse/Slacker/streak
 *  stats, scoped to just this owner's games instead of the whole league. */
export function computeTeamRecords(teamIdx, matchups, seasonRecords, ownerGuid) {
  const scores = computeScoreEntries(teamIdx, matchups).filter(e => e.team.owner_guid === ownerGuid);
  const juggernaut = [...scores].sort((a, b) => b.score - a.score)[0] || null;
  const featherweight = [...scores].sort((a, b) => a.score - b.score)[0] || null;

  const games = [];
  for (const m of matchups) {
    if (m.away_team_id == null || !isPlayed(m) || m.winner === "TIE") continue;
    const home = teamIdx.get(teamKey(m.season, m.home_team_id));
    const away = teamIdx.get(teamKey(m.season, m.away_team_id));
    if (!home || !away || (home.owner_guid !== ownerGuid && away.owner_guid !== ownerGuid)) continue;
    const homeWon = m.winner === "HOME";
    const winner = homeWon ? home : away, loser = homeWon ? away : home;
    const winnerScore = homeWon ? m.home_score : m.away_score, loserScore = homeWon ? m.away_score : m.home_score;
    games.push({
      season: m.season, week: m.week, won: winner.owner_guid === ownerGuid,
      winnerName: winner.owner_name || winner.team_name, loserName: loser.owner_name || loser.team_name,
      winnerScore, loserScore, margin: winnerScore - loserScore,
    });
  }
  const wins = games.filter(g => g.won);
  const cakewalk = [...wins].sort((a, b) => b.margin - a.margin)[0] || null; // biggest win
  const nailbiter = [...games].sort((a, b) => a.margin - b.margin)[0] || null; // closest game either way

  const ppgRows = [];
  for (const season of Object.keys(seasonRecords)) {
    const r = seasonRecords[season].find(r => r.ownerGuid === ownerGuid);
    if (r?.games) ppgRows.push({ season: r.season, ppg: r.pointsFor / r.games, games: r.games });
  }
  const powerhouse = [...ppgRows].sort((a, b) => b.ppg - a.ppg)[0] || null;
  const slacker = [...ppgRows].sort((a, b) => a.ppg - b.ppg)[0] || null;

  const ownerGames = [];
  for (const m of matchups) {
    if (m.away_team_id == null || !isPlayed(m)) continue;
    const home = teamIdx.get(teamKey(m.season, m.home_team_id));
    const away = teamIdx.get(teamKey(m.season, m.away_team_id));
    const mine = home?.owner_guid === ownerGuid ? home : away?.owner_guid === ownerGuid ? away : null;
    if (!mine) continue;
    const won = m.winner === "HOME" ? mine === home : m.winner === "AWAY" ? mine === away : null;
    ownerGames.push({ season: m.season, week: m.week, result: won == null ? "T" : won ? "W" : "L" });
  }
  ownerGames.sort((a, b) => a.season - b.season || a.week - b.week);
  const { bestWin, bestWinRange, bestLoss, bestLossRange } = longestStreaksFromGames(ownerGames);

  return {
    juggernaut, featherweight, cakewalk, nailbiter, powerhouse, slacker,
    victoryLap: bestWin > 0 ? { len: bestWin, range: bestWinRange } : null,
    dumpsterFire: bestLoss > 0 ? { len: bestLoss, range: bestLossRange } : null,
  };
}
