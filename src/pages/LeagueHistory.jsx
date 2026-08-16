import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { pageShell, panelStyle, btnStyle, pText, th, td } from "../theme.jsx";

const LEAGUE = "koi"; // starting point per request — Final/Jordan can follow the same code path later

function teamKey(season, espnTeamId) { return `${season}|${espnTeamId}`; }

function buildTeamIndex(teams) {
  const idx = new Map();
  for (const t of teams) idx.set(teamKey(t.season, t.espn_team_id), t);
  return idx;
}

/** Per-season W/L/T, points for/against, and each team's own high/low week —
 *  scoped to one season, keyed by the season's own team slot (a team's
 *  identity within a season, not yet resolved across seasons). */
function computeSeasonRecords(teams, matchups) {
  const acc = new Map();
  for (const t of teams) {
    acc.set(teamKey(t.season, t.espn_team_id), {
      season: t.season, teamName: t.team_name, ownerName: t.owner_name, ownerGuid: t.owner_guid,
      wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, games: 0, high: null, low: null,
    });
  }
  for (const m of matchups) {
    if (m.away_team_id == null || m.home_score == null || m.away_score == null) continue; // bye or not yet played
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
  for (const season of Object.keys(bySeason)) bySeason[season].sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
  return bySeason;
}

/** Head-to-head, keyed by owner GUID pair (not team slot) so it's correct
 *  across seasons even if a team's name/id changed — both a per-season
 *  breakdown and an all-time roll-up. */
function computeHeadToHead(teamIdx, matchups) {
  const allTime = new Map();
  const perSeason = new Map();
  for (const m of matchups) {
    if (m.away_team_id == null || m.home_score == null || m.away_score == null) continue;
    const home = teamIdx.get(teamKey(m.season, m.home_team_id));
    const away = teamIdx.get(teamKey(m.season, m.away_team_id));
    if (!home?.owner_guid || !away?.owner_guid || home.owner_guid === away.owner_guid) continue;
    const pairKey = [home.owner_guid, away.owner_guid].sort().join("::");
    const apply = (map) => {
      let rec = map.get(pairKey);
      if (!rec) {
        rec = { ownerA: home.owner_guid, ownerB: away.owner_guid, nameA: home.owner_name, nameB: away.owner_name,
                games: 0, winsA: 0, winsB: 0, ties: 0, ptsA: 0, ptsB: 0 };
        map.set(pairKey, rec);
      }
      const homeIsA = home.owner_guid === rec.ownerA;
      rec.games++;
      rec.ptsA += homeIsA ? m.home_score : m.away_score;
      rec.ptsB += homeIsA ? m.away_score : m.home_score;
      if (m.winner === "TIE") rec.ties++;
      else {
        const winnerGuid = m.winner === "HOME" ? home.owner_guid : away.owner_guid;
        if (winnerGuid === rec.ownerA) rec.winsA++; else rec.winsB++;
      }
    };
    apply(allTime);
    if (!perSeason.has(m.season)) perSeason.set(m.season, new Map());
    apply(perSeason.get(m.season));
  }
  return {
    allTime: [...allTime.values()].sort((a, b) => b.games - a.games),
    perSeason: Object.fromEntries([...perSeason.entries()].map(([s, map]) => [s, [...map.values()]])),
  };
}

/** Highest/lowest single-week scores, both per-season and all-time. */
function computeExtremes(teamIdx, matchups) {
  const entries = [];
  for (const m of matchups) {
    if (m.home_score != null) entries.push({ season: m.season, week: m.week, key: teamKey(m.season, m.home_team_id), score: m.home_score });
    if (m.away_team_id != null && m.away_score != null) entries.push({ season: m.season, week: m.week, key: teamKey(m.season, m.away_team_id), score: m.away_score });
  }
  const named = entries.map(e => ({ ...e, team: teamIdx.get(e.key) })).filter(e => e.team);
  const allTimeHigh = [...named].sort((a, b) => b.score - a.score).slice(0, 10);
  const allTimeLow = [...named].sort((a, b) => a.score - b.score).slice(0, 10);
  const bySeason = {};
  for (const e of named) (bySeason[e.season] = bySeason[e.season] || []).push(e);
  const perSeason = {};
  for (const season of Object.keys(bySeason)) {
    const sorted = [...bySeason[season]].sort((a, b) => b.score - a.score);
    perSeason[season] = { high: sorted[0], low: sorted[sorted.length - 1] };
  }
  return { allTimeHigh, allTimeLow, perSeason };
}

export default function LeagueHistory() {
  const [teams, setTeams] = useState([]);
  const [matchups, setMatchups] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [season, setSeason] = useState("all");

  const currentUserName = (typeof localStorage !== "undefined" && localStorage.getItem("ffb-user")) || "Will";
  const canEdit = currentUserName === "Will";

  const load = () => {
    fetch(`/api/history/${LEAGUE}`).then(r => r.json()).then(d => {
      setTeams(d.teams || []);
      setMatchups(d.matchups || []);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  };
  useEffect(load, []);

  const refresh = async () => {
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const res = await fetch(`/api/history/${LEAGUE}/refresh`, { method: "POST" });
      const data = await res.json();
      setRefreshResult(data);
      load();
    } catch (e) {
      setRefreshResult({ error: e.message });
    }
    setRefreshing(false);
  };

  const teamIdx = useMemo(() => buildTeamIndex(teams), [teams]);
  const seasonRecords = useMemo(() => computeSeasonRecords(teams, matchups), [teams, matchups]);
  const headToHead = useMemo(() => computeHeadToHead(teamIdx, matchups), [teamIdx, matchups]);
  const extremes = useMemo(() => computeExtremes(teamIdx, matchups), [teamIdx, matchups]);
  const seasons = useMemo(() => [...new Set(teams.map(t => t.season))].sort((a, b) => b - a), [teams]);

  const h2hRows = season === "all" ? headToHead.allTime : (headToHead.perSeason[season] || []);

  return (
    <div style={pageShell()}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", flexWrap:"wrap", gap:12, marginBottom:16 }}>
          <div>
            <Link to="/" style={{ fontSize:11, color:"#9c998e", textDecoration:"none" }}>&larr; Fantasy HQ</Link>
            <h1 style={{ margin:"2px 0 0", fontSize:28, fontWeight:800 }}>League History — Koi</h1>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {canEdit && (
              <button onClick={refresh} disabled={refreshing} style={btnStyle()}>
                {refreshing ? "Refreshing…" : "Refresh History"}
              </button>
            )}
            <select value={season} onChange={e=>setSeason(e.target.value)} style={{...btnStyle(), cursor:"pointer"}}>
              <option value="all">All-time</option>
              {seasons.map(s => <option key={s} value={s}>{s} season</option>)}
            </select>
          </div>
        </div>

        {refreshResult && (
          <div style={{ ...panelStyle(), fontSize:12.5 }}>
            {refreshResult.error ? (
              <span style={{ color:"#e08a8a" }}>Refresh failed: {refreshResult.error}</span>
            ) : (
              <>
                <span style={{ color:"#7fd18f" }}>Imported: {refreshResult.imported?.join(", ") || "none"}.</span>{" "}
                {refreshResult.skipped?.length > 0 && (
                  <span style={{ opacity:0.7 }}>
                    Skipped — {refreshResult.skipped.map(s => `${s.year} (${s.reason})`).join("; ")}
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {!loaded ? (
          <div style={panelStyle()}>Loading…</div>
        ) : teams.length === 0 ? (
          <div style={panelStyle()}>
            <p style={pText()}>
              No history imported yet. {canEdit ? "Hit \"Refresh History\" above to pull it from ESPN." : "Ask Will to run a refresh."}
            </p>
          </div>
        ) : (
          <>
            <div style={panelStyle()}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
                Season Records
              </div>
              {(season === "all" ? seasons : [Number(season)]).map(s => (
                <div key={s} style={{ marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:6 }}>{s}</div>
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", fontSize:12.5 }}>
                      <thead>
                        <tr style={{ opacity:0.65, textAlign:"left" }}>
                          <th style={th("left")}>Owner</th><th style={th("left")}>Team</th>
                          <th style={th()}>W</th><th style={th()}>L</th><th style={th()}>T</th>
                          <th style={th()}>Pts For</th><th style={th()}>Pts Against</th>
                          <th style={th()}>High</th><th style={th()}>Low</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(seasonRecords[s] || []).map(r => (
                          <tr key={`${r.season}-${r.ownerGuid}`}>
                            <td style={td("left")}>{r.ownerName || "—"}</td>
                            <td style={td("left")}>{r.teamName}</td>
                            <td style={td()}>{r.wins}</td><td style={td()}>{r.losses}</td><td style={td()}>{r.ties}</td>
                            <td style={td()}>{r.pointsFor.toFixed(1)}</td><td style={td()}>{r.pointsAgainst.toFixed(1)}</td>
                            <td style={td()}>{r.high != null ? r.high.toFixed(1) : "—"}</td>
                            <td style={td()}>{r.low != null ? r.low.toFixed(1) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>

            <div style={panelStyle()}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
                Head-to-Head {season === "all" ? "(All-Time)" : `(${season})`}
              </div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", fontSize:12.5 }}>
                  <thead>
                    <tr style={{ opacity:0.65, textAlign:"left" }}>
                      <th style={th("left")}>Matchup</th><th style={th()}>Games</th><th style={th()}>Record</th><th style={th()}>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h2hRows.map((r, i) => (
                      <tr key={i}>
                        <td style={td("left")}>{r.nameA || "?"} vs {r.nameB || "?"}</td>
                        <td style={td()}>{r.games}</td>
                        <td style={td()}>{r.winsA}-{r.winsB}{r.ties ? `-${r.ties}` : ""}</td>
                        <td style={td()}>{r.ptsA.toFixed(1)} - {r.ptsB.toFixed(1)}</td>
                      </tr>
                    ))}
                    {h2hRows.length === 0 && (
                      <tr><td style={td("left")} colSpan={4}>No matchups for this scope yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={panelStyle()}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
                Single-Week Score Records
              </div>
              {season === "all" ? (
                <div style={{ display:"flex", gap:24, flexWrap:"wrap" }}>
                  <div style={{ flex:"1 1 300px" }}>
                    <div style={{ fontSize:12, fontWeight:700, color:"#7fd18f", marginBottom:6 }}>Highest (all-time)</div>
                    {extremes.allTimeHigh.map((e, i) => (
                      <div key={i} style={{ fontSize:12.5, display:"flex", justifyContent:"space-between", padding:"3px 0", borderBottom:"1px solid #1e2018" }}>
                        <span>{e.team.owner_name || e.team.team_name} — {e.season} wk {e.week}</span>
                        <b>{e.score.toFixed(1)}</b>
                      </div>
                    ))}
                  </div>
                  <div style={{ flex:"1 1 300px" }}>
                    <div style={{ fontSize:12, fontWeight:700, color:"#e08a8a", marginBottom:6 }}>Lowest (all-time)</div>
                    {extremes.allTimeLow.map((e, i) => (
                      <div key={i} style={{ fontSize:12.5, display:"flex", justifyContent:"space-between", padding:"3px 0", borderBottom:"1px solid #1e2018" }}>
                        <span>{e.team.owner_name || e.team.team_name} — {e.season} wk {e.week}</span>
                        <b>{e.score.toFixed(1)}</b>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ display:"flex", gap:24, flexWrap:"wrap", fontSize:13 }}>
                  {extremes.perSeason[season]?.high && (
                    <div>Highest: <b style={{color:"#7fd18f"}}>{extremes.perSeason[season].high.team.owner_name}</b> — wk {extremes.perSeason[season].high.week}, {extremes.perSeason[season].high.score.toFixed(1)}</div>
                  )}
                  {extremes.perSeason[season]?.low && (
                    <div>Lowest: <b style={{color:"#e08a8a"}}>{extremes.perSeason[season].low.team.owner_name}</b> — wk {extremes.perSeason[season].low.week}, {extremes.perSeason[season].low.score.toFixed(1)}</div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
