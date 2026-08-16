import React, { useState, useMemo } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { panelStyle, btnStyle, inp, th, td } from "../../theme.jsx";
import { useSeasonFilter } from "./SeasonFilter.jsx";
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

function probColor(p) {
  if (p == null) return "#9c998e";
  if (p >= 66) return "#7fd18f";
  if (p >= 33) return "#c9a227";
  return "#e08a8a";
}

function InfoTh({ label, title }) {
  return <th style={th()} title={title}>{label} <span style={{ fontSize:10, opacity:0.6 }}>ⓘ</span></th>;
}

function TeamCell({ ownerGuid, ownerName, teamName, sub }) {
  return (
    <td style={td("left")}>
      <Link to={ownerGuid ? `/league-koi/teams/${ownerSlug(ownerGuid)}` : "#"} style={{ display:"flex", alignItems:"center", gap:8, textDecoration:"none", color:"inherit", pointerEvents: ownerGuid ? "auto" : "none" }}>
        <TeamAvatar name={teamName} seed={ownerGuid || teamName} size={26} />
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

function CustomPopover({ seasons, filter }) {
  const [open, setOpen] = useState(false);
  const { filterMode, setFilterMode, singleYear, setSingleYear, rangeFrom, setRangeFrom, rangeTo, setRangeTo, mostRecentSeason } = filter;
  const isActive = filterMode === "range" || (filterMode === "single" && singleYear !== mostRecentSeason);
  return (
    <div style={{ position:"relative" }}>
      <button onClick={()=>setOpen(o=>!o)} style={isActive ? btnStyle("#2a2a18","#c9a227") : btnStyle("rgba(255,255,255,0.1)","rgba(255,255,255,0.3)")}>
        Custom {open ? "▲" : "▼"}
      </button>
      {open && (
        <div style={{ position:"absolute", top:"110%", right:0, zIndex:10, background:"#181910",
          border:"1px solid #33362a", borderRadius:10, padding:14, width:230, boxShadow:"0 8px 24px rgba(0,0,0,0.4)" }}>
          <div style={{ fontSize:11, opacity:0.6, marginBottom:6 }}>Single Season</div>
          <select value={singleYear ?? ""} onChange={e=>{ setSingleYear(Number(e.target.value)); setFilterMode("single"); setOpen(false); }}
            style={{...inp("100%"), marginBottom:14}}>
            {seasons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <div style={{ fontSize:11, opacity:0.6, marginBottom:6 }}>Year Range</div>
          <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:10 }}>
            <select value={rangeFrom ?? ""} onChange={e=>setRangeFrom(Number(e.target.value))} style={inp(85)}>
              {[...seasons].reverse().map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span style={{opacity:0.5, fontSize:12}}>to</span>
            <select value={rangeTo ?? ""} onChange={e=>setRangeTo(Number(e.target.value))} style={inp(85)}>
              {[...seasons].reverse().map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button onClick={()=>{ setFilterMode("range"); setOpen(false); }} style={{...btnStyle("#20211a","#c9a227"), width:"100%"}}>
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

export default function SeasonPage() {
  const { teams, matchups, seasonRecords, seasons } = useOutletContext();
  // Default to the current season, not All-Time — this page is meant to
  // answer "how's this year going," Stats/Teams pages are where All-Time
  // browsing lives.
  const filter = useSeasonFilter(seasons, { defaultMode: "single" });
  const { filterMode, setFilterMode, singleYear, setSingleYear, mostRecentSeason, activeYears } = filter;
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

  return (
    <>
      <div style={{ background: bannerGradient, borderRadius:12, padding:"18px 20px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:14 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ fontSize:32 }}>🏈</div>
          <div>
            <div style={{ fontSize:22, fontWeight:800 }}>Standings</div>
            {isSingleSeason ? (
              reigningChamp ? (
                <div style={{ fontSize:13, opacity:0.85 }}>🏆 {reigningChamp.ownerName || reigningChamp.teamName} <span style={{opacity:0.6}}>({reigningChamp.season})</span></div>
              ) : <div style={{ fontSize:12.5, opacity:0.7 }}>No champion decided yet</div>
            ) : (
              <div style={{ fontSize:12.5, opacity:0.8 }}>{activeYears.length} seasons &middot; {franchiseCount} teams &middot; {gamesInScope} games</div>
            )}
          </div>
        </div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          <button onClick={()=>{ setFilterMode("single"); setSingleYear(mostRecentSeason); }}
            style={(filterMode==="single" && singleYear===mostRecentSeason) ? btnStyle("#2a2a18","#c9a227") : btnStyle("rgba(255,255,255,0.1)","rgba(255,255,255,0.3)")}>
            {mostRecentSeason}
          </button>
          <button onClick={()=>setFilterMode("all")} style={filterMode==="all" ? btnStyle("#2a2a18","#c9a227") : btnStyle("rgba(255,255,255,0.1)","rgba(255,255,255,0.3)")}>
            All Time
          </button>
          <CustomPopover seasons={seasons} filter={filter} />
        </div>
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
                  <th style={th()}>#</th><th style={th("left")}>Team</th>
                  <th style={th()}>Actual</th><th style={th()}>Form</th>
                  <InfoTh label="Exp" title={EXP_TOOLTIP} /><InfoTh label="Ovr" title={OVR_TOOLTIP} /><InfoTh label="WW" title={WW_TOOLTIP} />
                  <th style={th()}>PF</th><th style={th()}>PA</th>
                  {withProbability && <th style={th()} title={PROB_TOOLTIP}>Playoff <span style={{ fontSize:10, opacity:0.6 }}>ⓘ</span></th>}
                </tr>
              </thead>
              <tbody>
                {singleRows.map(r => {
                  const rowKey = `${r.season}-${r.ownerGuid || r.teamName}`;
                  const teamRow = teams.find(t => t.season === r.season && (r.ownerGuid ? t.owner_guid === r.ownerGuid : t.team_name === r.teamName));
                  const w = teamRow ? weeklyStats.get(teamKey(r.season, teamRow.espn_team_id)) : null;
                  const games = teamRow ? formGuide?.get(teamRow.espn_team_id) : null;
                  const p = withProbability ? probByGuid.get(r.ownerGuid || r.teamName) : null;
                  const isExpanded = expandedKey === rowKey;
                  return (
                    <React.Fragment key={rowKey}>
                      <tr>
                        <td style={{...td(), fontWeight: r.finalRank===1 ? 700 : 400, color: r.finalRank===1 ? "#f0d97a" : undefined}}>
                          {r.finalRank != null ? (r.finalRank===1 ? "🏆 1" : r.finalRank) : "—"}
                        </td>
                        <TeamCell ownerGuid={r.ownerGuid} ownerName={r.ownerName} teamName={r.teamName} />
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
                    <th style={th()}>#</th><th style={th("left")}>Team</th>
                    <th style={th()}>Actual</th>
                    <InfoTh label="Exp" title={EXP_TOOLTIP} /><InfoTh label="Ovr" title={OVR_TOOLTIP} /><InfoTh label="WW" title={WW_TOOLTIP} />
                    <th style={th()}>PF</th><th style={th()}>PA</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregateRows.map((a, i) => (
                    <tr key={a.ownerGuid}>
                      <td style={td()}>{i + 1}</td>
                      <TeamCell ownerGuid={a.ownerGuid} ownerName={a.ownerName} teamName={a.teamName}
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
              return (
                <div key={s} style={{ marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:6 }}>
                    {s}
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
                          <th style={th()}>Rank</th><th style={th("left")}>Owner</th><th style={th("left")}>Team</th>
                          <th style={th()}>W</th><th style={th()}>L</th><th style={th()}>T</th>
                          <th style={th()}>Pts For</th><th style={th()}>Pts Against</th>
                          <th style={th()}>High</th><th style={th()}>Low</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => (
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
            })}
          </div>
        </>
      )}
    </>
  );
}
