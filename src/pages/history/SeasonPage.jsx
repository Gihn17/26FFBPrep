import React, { useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { panelStyle, th, td } from "../../theme.jsx";
import { useSeasonFilter, SeasonFilterBar } from "./SeasonFilter.jsx";
import { computePlayoffProbabilities } from "./compute.js";

// Below this many games played, don't show numbers that look precise but
// aren't yet. Backtested against every completed Koi season (holding each
// one out of its own historical pool): sample size is never actually the
// constraint here (even Week 1 averages 84 historical comps) — it's
// signal. Weeks 1-2 barely beat a coin flip (59%/65% accuracy predicting
// the real playoff outcome); Week 3 jumps to 70% and Weeks 3-6 sit in the
// same 70-75% band, so waiting all the way to Week 6 wasn't buying
// anything a Week 3 gate doesn't already get.
const MIN_GAMES_FOR_PROBABILITY = 3;

const PROB_TOOLTIP = "Percentage of teams in a league's history that made the playoffs with the actual current record. Click to view more data.";

function probColor(p) {
  if (p == null) return "#9c998e";
  if (p >= 66) return "#7fd18f";
  if (p >= 33) return "#c9a227";
  return "#e08a8a";
}

export default function SeasonPage() {
  const { teams, matchups, seasonRecords, seasons } = useOutletContext();
  const filter = useSeasonFilter(seasons);
  const { activeYears } = filter;
  const [expandedKey, setExpandedKey] = useState(null);

  const mostRecentSeason = seasons[0]; // Layout sorts seasons newest-first
  const mostRecentRows = seasonRecords[mostRecentSeason] || [];
  const mostRecentInProgress = !mostRecentRows.some(r => r.finalRank === 1);
  const gamesPlayed = mostRecentRows[0]?.games || 0;
  const showProbability = mostRecentInProgress && gamesPlayed >= MIN_GAMES_FOR_PROBABILITY;

  const probabilities = useMemo(() => {
    if (!mostRecentInProgress) return null;
    return computePlayoffProbabilities(teams, matchups, seasonRecords, mostRecentSeason);
  }, [teams, matchups, seasonRecords, mostRecentSeason, mostRecentInProgress]);
  const probByKey = useMemo(() => {
    const m = new Map();
    (probabilities || []).forEach(p => m.set(p.ownerGuid || p.teamName, p));
    return m;
  }, [probabilities]);

  return (
    <>
      <SeasonFilterBar seasons={seasons} filter={filter} />

      {mostRecentInProgress && !showProbability && activeYears.includes(mostRecentSeason) && (
        <div style={{ ...panelStyle(), fontSize:12.5, opacity:0.7 }}>
          Playoff probability will show once {mostRecentSeason} reaches Week {MIN_GAMES_FOR_PROBABILITY} — too early for the record-matching sample to mean much right now.
        </div>
      )}

      <div style={panelStyle()}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
          Season Records
        </div>
        {activeYears.map(s => {
          const rows = seasonRecords[s] || [];
          const ranked = rows.filter(r => r.finalRank != null);
          const champion = ranked.find(r => r.finalRank === 1);
          const lastPlace = ranked.length ? ranked.reduce((a, b) => (a.finalRank > b.finalRank ? a : b)) : null;
          const withProbability = showProbability && s === mostRecentSeason;
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
                      {withProbability && (
                        <th style={th()} title={PROB_TOOLTIP}>
                          Playoff % <span style={{ fontSize:10, opacity:0.6 }}>ⓘ</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const rowKey = `${r.season}-${r.ownerGuid || r.teamName}`;
                      const p = withProbability ? probByKey.get(r.ownerGuid || r.teamName) : null;
                      const isExpanded = expandedKey === rowKey;
                      return (
                        <React.Fragment key={rowKey}>
                          <tr>
                            <td style={{...td(), fontWeight: r.finalRank===1 ? 700 : 400, color: r.finalRank===1 ? "#f0d97a" : undefined}}>
                              {r.finalRank != null ? (r.finalRank===1 ? "🏆 1" : r.finalRank) : "—"}
                            </td>
                            <td style={td("left")}>{r.ownerName || "—"}</td>
                            <td style={td("left")}>{r.teamName}</td>
                            <td style={td()}>{r.wins}</td><td style={td()}>{r.losses}</td><td style={td()}>{r.ties}</td>
                            <td style={td()}>{r.pointsFor.toFixed(1)}</td><td style={td()}>{r.pointsAgainst.toFixed(1)}</td>
                            <td style={td()}>{r.high != null ? r.high.toFixed(1) : "—"}</td>
                            <td style={td()}>{r.low != null ? r.low.toFixed(1) : "—"}</td>
                            {withProbability && (
                              <td style={{...td(), cursor: p?.sampleSize ? "pointer" : "default"}} title={PROB_TOOLTIP}
                                onClick={() => p?.sampleSize && setExpandedKey(isExpanded ? null : rowKey)}>
                                {p && p.probability != null ? (
                                  <span style={{ fontWeight:700, color: probColor(p.probability) }}>
                                    {p.probability.toFixed(0)}% <span style={{ fontSize:10, opacity:0.55 }}>{isExpanded ? "▲" : "▾"}</span>
                                  </span>
                                ) : <span style={{ opacity:0.5 }}>—</span>}
                              </td>
                            )}
                          </tr>
                          {isExpanded && p && (
                            <tr>
                              <td colSpan={11} style={{ background:"#12130f", padding:"10px 14px", borderBottom:"1px solid #1e2018" }}>
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
          );
        })}
      </div>
    </>
  );
}
