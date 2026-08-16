// Pure data-shaping helpers shared across every League History sub-page
// (Season, H2H, Champs, Teams). All operate on the raw {teams, matchups}
// payload from GET /api/history/:league — nothing here calls the network.

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
      finalRank: t.final_rank || null,
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
