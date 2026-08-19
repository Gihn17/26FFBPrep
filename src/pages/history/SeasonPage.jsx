import React, { useState, useMemo } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { panelStyle, th, td } from "../../theme.jsx";
import { useSeasonFilter, SeasonPillFilter } from "./SeasonFilter.jsx";
import {
  computePlayoffProbabilities, computeSeasonFormGuide, computeAggregateStandings,
  computeFranchiseWeeklyStats, teamKey, ownerSlug,
} from "./compute.js";
import TeamAvatar from "./Avatar.jsx";

// Below this many games played, don't show numbers that look precise but
// aren't yet. Backtested against every completed Koi season (holding each
// one out of its own historical pool), scored on Brier score (0=perfect,
// 0.25=coin-flip — more sensitive than plain right/wrong, since it grades
// calibration, not just direction) rather than raw accuracy, whose
// confidence interval at this sample size (~178 team-seasons) is wide
// enough to make Weeks 3-6 look equivalent when they aren't: Week 3 scores
// 0.220 (barely better than a coin flip), Week 4 0.206, Week 5 0.183 (the
// real jump), Week 6 0.168 (best, but only a small further gain over 5).
// Week 5 gets most of the available reliability without waiting the extra
// week Week 6 costs.
const MIN_GAMES_FOR_PROBABILITY = 5;

const PROB_TOOLTIP = "Percentage of teams in a league's history that made the playoffs with the actual current record. Click to view more data.";
const EXP_TOOLTIP = "A win if your score beat the week's median, a loss if it didn't.";
const OVR_TOOLTIP = "All-play record: how you'd have done playing every other team in the league every week.";
const WW_TOOLTIP = "Weekly Wins: weeks you had the single highest score in the league.";

// Ties count as half a win — the standard fantasy convention — so "Actual"
// sorts by true record quality, not just raw win count.
function winPct(wins, losses, ties) {
  const games = wins + losses + ties;
  return games > 0 ? (wins + ties * 0.5) / games : 0;
}

function probColor(p) {
  if (p == null) return "#9c998e";
  if (p >= 66) return "#7fd18f";
  if (p >= 33) return "#c9a227";
  return "#e08a8a";
}

/** Generic click-to-sort table state — one hook instance per table, since
 *  the "Individual Seasons" view renders several independent tables (one
 *  per season) that each need their own sort, not a shared one. Starts
 *  with no active column (natural/existing row order) so nothing changes
 *  visually until a user actually clicks a header. `accessors` maps a
 *  column id to a function pulling that column's comparable value off a
 *  row; strings sort A→Z first, numbers highest-first — the common
 *  "click once = best/most on top" convention — and null/undefined always
 *  sorts to the bottom regardless of direction, so unfinalized/missing
 *  values don't jump to the top on a descending sort. */
function useSort(rows, accessors) {
  const [col, setCol] = useState(null);
  const [dir, setDir] = useState("desc");

  const sorted = useMemo(() => {
    const acc = col && accessors[col];
    if (!acc) return rows;
    const factor = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = acc(a), bv = acc(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return factor * av.localeCompare(bv);
      return factor * (av - bv);
    });
  }, [rows, accessors, col, dir]);

  const sortProps = (colId, defaultDir = "desc") => ({
    active: col === colId,
    dir,
    onClick: () => {
      if (col === colId) setDir(d => (d === "asc" ? "desc" : "asc"));
      else { setCol(colId); setDir(defaultDir); }
    },
  });

  return { sorted, sortProps };
}

function SortTh({ label, align, title, active, dir, onClick }) {
  return (
    <th style={{ ...th(align), cursor:"pointer", userSelect:"none", color: active ? "#f0d97a" : undefined }} title={title} onClick={onClick}>
      {label}
      {title && <span style={{ fontSize:10, opacity:0.6 }}> ⓘ</span>}
      <span style={{ display:"inline-block", width:11, fontSize:9, opacity: active ? 0.9 : 0.35 }}>
        {active ? (dir === "asc" ? "▲" : "▼") : "⇅"}
      </span>
    </th>
  );
}

function TeamCell({ ownerGuid, ownerName, teamName, sub, logo, league }) {
  return (
    <td style={td("left")}>
      <Link to={ownerGuid ? `/league/${league}/teams/${ownerSlug(ownerGuid)}` : "#"} style={{ display:"flex", alignItems:"center", gap:8, textDecoration:"none", color:"inherit", pointerEvents: ownerGuid ? "auto" : "none" }}>
        <TeamAvatar name={teamName} seed={ownerGuid || teamName} size={26} imageUrl={logo} />
        <div>
          <div style={{ fontWeight:700 }}>{teamName}</div>
          {(sub || ownerName) && <div style={{ fontSize:10.5, opacity:0.6 }}>{sub || ownerName}</div>}
        </div>
      </Link>
    </td>
  );
}

function FormCells({ games }) {
  if (!games || games.length === 0) return <td style={{...td(), opacity:0.4}}>—</td>;
  return (
    <td style={td()}>
      <div style={{ display:"flex", gap:3, justifyContent:"center" }}>
        {games.map((g, i) => (
          <span key={i} style={{
            fontSize:11, fontWeight:800, width:16, height:16, lineHeight:"16px", borderRadius:3,
            color: g.result === "W" ? "#7fd18f" : g.result === "L" ? "#e08a8a" : "#c9a227",
          }}>{g.result}</span>
        ))}
      </div>
    </td>
  );
}

function PlayoffPill({ probability, sampleSize, expanded, onClick }) {
  if (probability == null) return <td style={{...td(), opacity:0.4, fontSize:11}} title={`Playoff probability becomes available at Week ${MIN_GAMES_FOR_PROBABILITY}`}>—</td>;
  const color = probColor(probability);
  return (
    <td style={{...td(), cursor: sampleSize ? "pointer" : "default"}} title={PROB_TOOLTIP} onClick={() => sampleSize && onClick()}>
      <div style={{ position:"relative", width:74, height:21, borderRadius:11, background:"#0f100b", border:`1px solid ${color}55`, overflow:"hidden", margin:"0 auto" }}>
        <div style={{ position:"absolute", inset:0, width:`${probability}%`, background:color, opacity:0.3 }} />
        <div style={{ position:"relative", textAlign:"center", lineHeight:"19px", fontSize:11, fontWeight:800, color }}>
          {probability.toFixed(0)}% {expanded ? "▲" : "▾"}
        </div>
      </div>
    </td>
  );
}


const SEASON_MINI_TABLE_ACCESSORS = {
  rank: r => r.finalRank,
  owner: r => r.ownerName || r.teamName,
  team: r => r.teamName,
  w: r => r.wins,
  l: r => r.losses,
  t: r => r.ties,
  pf: r => r.pointsFor,
  pa: r => r.pointsAgainst,
  high: r => r.high,
  low: r => r.low,
};

/** One season's table in the "Individual Seasons" (multi-season/All-Time)
 *  view — its own component so each season gets independent sort state via
 *  its own useSort call, instead of one shared sort applying to every
 *  season's table at once. */
function SeasonMiniTable({ season, rows, champion, lastPlace }) {
  const { sorted, sortProps } = useSort(rows, SEASON_MINI_TABLE_ACCESSORS);
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ fontSize:13, fontWeight:700, marginBottom:6 }}>
        {season}
        {champion && (
          <span style={{ fontWeight:400, fontSize:12, opacity:0.85 }}>
            {" — 🏆 "}{champion.ownerName || champion.teamName}
            {lastPlace && lastPlace !== champion && <> · last: {lastPlace.ownerName || lastPlace.teamName}</>}
          </span>
        )}
        {!champion && <span style={{ fontWeight:400, fontSize:12, opacity:0.5 }}> — season in progress, not finalized yet</span>}
      </div>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", fontSize:12.5 }}>
          <thead>
            <tr style={{ opacity:0.65, textAlign:"left" }}>
              <SortTh label="Rank" {...sortProps("rank", "asc")} />
              <SortTh label="Owner" align="left" {...sortProps("owner", "asc")} />
              <SortTh label="Team" align="left" {...sortProps("team", "asc")} />
              <SortTh label="W" {...sortProps("w")} /><SortTh label="L" {...sortProps("l")} /><SortTh label="T" {...sortProps("t")} />
              <SortTh label="Pts For" {...sortProps("pf")} /><SortTh label="Pts Against" {...sortProps("pa")} />
              <SortTh label="High" {...sortProps("high")} /><SortTh label="Low" {...sortProps("low")} />
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={`${r.season}-${r.ownerGuid || r.teamName}`}>
                <td style={{...td(), fontWeight: r.finalRank===1 ? 700 : 400, color: r.finalRank===1 ? "#f0d97a" : undefined}}>
                  {r.finalRank != null ? (r.finalRank===1 ? "🏆 1" : r.finalRank) : "—"}
                </td>
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
  );
}

export default function SeasonPage() {
  const { league, teams, matchups, seasonRecords, seasons, currentLogos } = useOutletContext();
  // Default to the current season, not All-Time — this page is meant to
  // answer "how's this year going," Stats/Teams pages are where All-Time
  // browsing lives.
  const filter = useSeasonFilter(seasons, { defaultMode: "single" });
  const { filterMode, mostRecentSeason, activeYears } = filter;
  const [expandedKey, setExpandedKey] = useState(null);

  const isSingleSeason = activeYears.length === 1;
  const singleSeason = isSingleSeason ? activeYears[0] : null;

  const mostRecentRows = seasonRecords[mostRecentSeason] || [];
  const mostRecentInProgress = !mostRecentRows.some(r => r.finalRank === 1);
  const gamesPlayed = mostRecentRows[0]?.games || 0;
  const showProbability = mostRecentInProgress && gamesPlayed >= MIN_GAMES_FOR_PROBABILITY;
  const withProbability = isSingleSeason && singleSeason === mostRecentSeason && showProbability;

  const probabilities = useMemo(() => {
    if (!withProbability) return null;
    return computePlayoffProbabilities(teams, matchups, seasonRecords, mostRecentSeason);
  }, [teams, matchups, seasonRecords, mostRecentSeason, withProbability]);
  const probByGuid = useMemo(() => new Map((probabilities || []).map(p => [p.ownerGuid || p.teamName, p])), [probabilities]);

  const formGuide = useMemo(() => isSingleSeason ? computeSeasonFormGuide(matchups, singleSeason) : null, [matchups, singleSeason, isSingleSeason]);

  const weeklyStats = useMemo(() => computeFranchiseWeeklyStats(matchups), [matchups]);
  const aggregateRows = useMemo(() => isSingleSeason ? null : computeAggregateStandings(teams, seasonRecords, weeklyStats, activeYears), [teams, seasonRecords, weeklyStats, activeYears, isSingleSeason]);

  const aggregateSortAccessors = useMemo(() => ({
    team: a => a.teamName,
    actual: a => winPct(a.wins, a.losses, a.ties),
    exp: a => a.expW,
    ovr: a => a.allPlayW,
    ww: a => a.weeklyHighs,
    pf: a => a.pointsFor,
    pa: a => a.pointsAgainst,
  }), []);
  // Called unconditionally (aggregateRows is null in single-season view) —
  // hooks can't be called inside the isSingleSeason branch below.
  const { sorted: sortedAggregateRows, sortProps: aggregateSortProps } = useSort(aggregateRows || [], aggregateSortAccessors);

  // Most recent DECIDED champion, regardless of the current filter — same
  // "reigning champion" idea the Champs page hero uses, just as a small
  // banner subtitle here.
  const reigningChamp = useMemo(() => {
    for (const s of seasons) {
      const champ = (seasonRecords[s] || []).find(r => r.finalRank === 1);
      if (champ) return { ...champ, season: s };
    }
    return null;
  }, [seasons, seasonRecords]);

  const gamesInScope = useMemo(() => matchups.filter(m => activeYears.includes(m.season) && m.away_team_id != null && m.home_score != null && !(m.home_score===0 && m.away_score===0)).length, [matchups, activeYears]);
  const franchiseCount = useMemo(() => new Set(teams.filter(t => activeYears.includes(t.season) && t.owner_guid).map(t => t.owner_guid)).size, [teams, activeYears]);

  const bannerGradient = isSingleSeason
    ? "linear-gradient(135deg, #1a3050, #14253f)"
    : "linear-gradient(135deg, #1c3a2a, #14251c)";

  const singleRows = isSingleSeason ? (seasonRecords[singleSeason] || []) : [];
  const ranked = singleRows.filter(r => r.finalRank != null);
  const seasonChampion = ranked.find(r => r.finalRank === 1);

  // Precomputed once per row (rather than derived inline during render, as
  // before) so the sort accessors below and the render loop read the exact
  // same values — sorting by Exp/Ovr/WW/Playoff% needs w/p resolved up
  // front, not recomputed after the array's already been reordered.
  const enrichedSingleRows = useMemo(() => {
    if (!isSingleSeason) return [];
    return singleRows.map(r => {
      const teamRow = teams.find(t => t.season === r.season && (r.ownerGuid ? t.owner_guid === r.ownerGuid : t.team_name === r.teamName));
      const w = teamRow ? weeklyStats.get(teamKey(r.season, teamRow.espn_team_id)) : null;
      const games = teamRow ? formGuide?.get(teamRow.espn_team_id) : null;
      const p = withProbability ? probByGuid.get(r.ownerGuid || r.teamName) : null;
      return { r, w, games, p, winPct: winPct(r.wins, r.losses, r.ties), rowKey: `${r.season}-${r.ownerGuid || r.teamName}` };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleRows, isSingleSeason, teams, weeklyStats, formGuide, withProbability, probByGuid]);

  const singleSortAccessors = useMemo(() => ({
    rank: e => e.r.finalRank,
    team: e => e.r.teamName,
    actual: e => e.winPct,
    exp: e => e.w?.expW,
    ovr: e => e.w?.allPlayW,
    ww: e => e.w?.weeklyHighs,
    pf: e => e.r.pointsFor,
    pa: e => e.r.pointsAgainst,
    playoff: e => e.p?.probability,
  }), []);
  const { sorted: sortedSingleRows, sortProps: singleSortProps } = useSort(enrichedSingleRows, singleSortAccessors);

  return (
    <>
      <div style={{ background: bannerGradient, borderRadius:12, padding:"18px 20px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:14 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ fontSize:32 }}>🏈</div>
          <div>
            <div style={{ fontSize:22, fontWeight:800 }}>Standings</div>
            {isSingleSeason && singleSeason === mostRecentSeason ? (
              // Viewing the current season specifically — "reigning champ"
              // means whoever last actually won, which can be a prior
              // season's champion while this one is still in progress.
              reigningChamp ? (
                <div style={{ fontSize:13, opacity:0.85 }}>🏆 Reigning Champ - {reigningChamp.ownerName || reigningChamp.teamName} <span style={{opacity:0.6}}>({reigningChamp.season})</span></div>
              ) : <div style={{ fontSize:12.5, opacity:0.7 }}>No champion decided yet</div>
            ) : isSingleSeason ? (
              // Viewing a different single season via the filter — show
              // THAT season's own champion, not the current reigning one.
              seasonChampion ? (
                <div style={{ fontSize:13, opacity:0.85 }}>🏆 {seasonChampion.ownerName || seasonChampion.teamName} <span style={{opacity:0.6}}>({singleSeason})</span></div>
              ) : <div style={{ fontSize:12.5, opacity:0.7 }}>{singleSeason} — not finalized</div>
            ) : (
              <div style={{ fontSize:12.5, opacity:0.8 }}>{activeYears.length} seasons &middot; {franchiseCount} teams &middot; {gamesInScope} games</div>
            )}
          </div>
        </div>
        <SeasonPillFilter seasons={seasons} filter={filter} />
      </div>

      {isSingleSeason ? (
        <div style={panelStyle()}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>
            {singleSeason}
            {seasonChampion && <span style={{ fontWeight:400, fontSize:12, opacity:0.85 }}> — 🏆 {seasonChampion.ownerName || seasonChampion.teamName}</span>}
            {!seasonChampion && <span style={{ fontWeight:400, fontSize:12, opacity:0.5 }}> — season in progress, not finalized yet</span>}
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", fontSize:12.5, whiteSpace:"nowrap" }}>
              <thead>
                <tr style={{ opacity:0.65, textAlign:"left" }}>
                  <SortTh label="#" {...singleSortProps("rank", "asc")} />
                  <SortTh label="Team" align="left" {...singleSortProps("team", "asc")} />
                  <SortTh label="Actual" {...singleSortProps("actual")} /><th style={th()}>Form</th>
                  <SortTh label="Exp" title={EXP_TOOLTIP} {...singleSortProps("exp")} />
                  <SortTh label="Ovr" title={OVR_TOOLTIP} {...singleSortProps("ovr")} />
                  <SortTh label="WW" title={WW_TOOLTIP} {...singleSortProps("ww")} />
                  <SortTh label="PF" {...singleSortProps("pf")} /><SortTh label="PA" {...singleSortProps("pa")} />
                  {withProbability && <SortTh label="Playoff" title={PROB_TOOLTIP} {...singleSortProps("playoff")} />}
                </tr>
              </thead>
              <tbody>
                {sortedSingleRows.map(({ r, w, games, p, rowKey }) => {
                  const isExpanded = expandedKey === rowKey;
                  return (
                    <React.Fragment key={rowKey}>
                      <tr>
                        <td style={{...td(), fontWeight: r.finalRank===1 ? 700 : 400, color: r.finalRank===1 ? "#f0d97a" : undefined}}>
                          {r.finalRank != null ? (r.finalRank===1 ? "🏆 1" : r.finalRank) : "—"}
                        </td>
                        <TeamCell ownerGuid={r.ownerGuid} ownerName={r.ownerName} teamName={r.teamName} logo={currentLogos.get(r.ownerGuid)} league={league} />
                        <td style={td()}>{r.wins}-{r.losses}{r.ties ? `-${r.ties}` : ""}</td>
                        <FormCells games={games} />
                        <td style={{...td(), opacity:0.75, fontStyle:"italic"}}>{w ? `${w.expW}-${w.expL}` : "—"}</td>
                        <td style={{...td(), opacity:0.75, fontStyle:"italic"}}>{w ? `${w.allPlayW}-${w.allPlayL}` : "—"}</td>
                        <td style={td()}>{w ? w.weeklyHighs : "—"}</td>
                        <td style={td()}>{r.pointsFor.toFixed(1)}</td>
                        <td style={td()}>{r.pointsAgainst.toFixed(1)}</td>
                        {withProbability && (
                          <PlayoffPill probability={p?.probability} sampleSize={p?.sampleSize}
                            expanded={isExpanded} onClick={()=>setExpandedKey(isExpanded ? null : rowKey)} />
                        )}
                      </tr>
                      {isExpanded && p && (
                        <tr>
                          <td colSpan={10} style={{ background:"#12130f", padding:"10px 14px", borderBottom:"1px solid #1e2018" }}>
                            <div style={{ fontSize:12, opacity:0.8, marginBottom:8 }}>
                              Of <b>{p.sampleSize}</b> team-seasons in Koi history that were <b>{p.wins}-{p.losses}{p.ties ? `-${p.ties}` : ""}</b> after
                              {" "}<b>{p.gamesPlayed}</b> games, <b>{p.matches.filter(m=>m.madePlayoffs).length}</b> made the playoffs.
                            </div>
                            <div style={{ display:"flex", flexWrap:"wrap", gap:6, maxHeight:140, overflowY:"auto" }}>
                              {p.matches.sort((a,b)=>b.season-a.season).map((m, i) => (
                                <span key={i} style={{
                                  fontSize:11, padding:"3px 8px", borderRadius:12,
                                  background: m.madePlayoffs ? "#1c3a2a" : "#241a1a",
                                  color: m.madePlayoffs ? "#7fd18f" : "#e08a8a",
                                  border: `1px solid ${m.madePlayoffs ? "#3f9e5e" : "#c0453f"}`,
                                }}>
                                  {m.season} {m.ownerName || m.teamName} {m.madePlayoffs ? "✓" : "✗"}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
          <div style={panelStyle()}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
              Combined Standings — {filterMode === "all" ? "All-Time" : `${Math.min(...activeYears)}–${Math.max(...activeYears)}`}
            </div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", fontSize:12.5, whiteSpace:"nowrap" }}>
                <thead>
                  <tr style={{ opacity:0.65, textAlign:"left" }}>
                    <th style={th()}>#</th>
                    <SortTh label="Team" align="left" {...aggregateSortProps("team", "asc")} />
                    <SortTh label="Actual" {...aggregateSortProps("actual")} />
                    <SortTh label="Exp" title={EXP_TOOLTIP} {...aggregateSortProps("exp")} />
                    <SortTh label="Ovr" title={OVR_TOOLTIP} {...aggregateSortProps("ovr")} />
                    <SortTh label="WW" title={WW_TOOLTIP} {...aggregateSortProps("ww")} />
                    <SortTh label="PF" {...aggregateSortProps("pf")} /><SortTh label="PA" {...aggregateSortProps("pa")} />
                  </tr>
                </thead>
                <tbody>
                  {sortedAggregateRows.map((a, i) => (
                    <tr key={a.ownerGuid}>
                      <td style={td()}>{i + 1}</td>
                      <TeamCell ownerGuid={a.ownerGuid} ownerName={a.ownerName} teamName={a.teamName} logo={a.logo} league={league}
                        sub={a.seasons < activeYears.length ? `${a.ownerName} · ${a.seasons} seasons in range` : a.ownerName} />
                      <td style={td()}>{a.wins}-{a.losses}{a.ties ? `-${a.ties}` : ""}</td>
                      <td style={{...td(), opacity:0.75, fontStyle:"italic"}}>{a.expW}-{a.expL}</td>
                      <td style={{...td(), opacity:0.75, fontStyle:"italic"}}>{a.allPlayW}-{a.allPlayL}</td>
                      <td style={td()}>{a.weeklyHighs}</td>
                      <td style={td()}>{a.pointsFor.toFixed(1)}</td>
                      <td style={td()}>{a.pointsAgainst.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={panelStyle()}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
              Individual Seasons
            </div>
            {activeYears.map(s => {
              const rows = seasonRecords[s] || [];
              const rankedS = rows.filter(r => r.finalRank != null);
              const champion = rankedS.find(r => r.finalRank === 1);
              const lastPlace = rankedS.length ? rankedS.reduce((a, b) => (a.finalRank > b.finalRank ? a : b)) : null;
              return <SeasonMiniTable key={s} season={s} rows={rows} champion={champion} lastPlace={lastPlace} />;
            })}
          </div>
        </>
      )}
    </>
  );
}
