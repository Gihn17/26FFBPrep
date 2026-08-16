import React, { useState, useEffect, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { panelStyle, btnStyle, th, td, inp } from "../../theme.jsx";
import { computeScoreEntries } from "./compute.js";

export default function SeasonPage() {
  const { teamIdx, matchups, seasonRecords, seasons } = useOutletContext();

  // "all" | "single" | "range" — quick pills (All-Time / current season) +
  // a Custom popover (pick one season, or a year range) rather than one
  // flat dropdown. Range is new: a custom span of seasons, not just
  // "everything" or "exactly one."
  const [filterMode, setFilterMode] = useState("all");
  const [singleYear, setSingleYear] = useState(null);
  const [rangeFrom, setRangeFrom] = useState(null);
  const [rangeTo, setRangeTo] = useState(null);
  const [showCustom, setShowCustom] = useState(false);

  const mostRecentSeason = seasons[0];
  useEffect(() => {
    if (seasons.length && singleYear == null) setSingleYear(mostRecentSeason);
    if (seasons.length && rangeFrom == null) setRangeFrom(seasons[seasons.length - 1]);
    if (seasons.length && rangeTo == null) setRangeTo(mostRecentSeason);
  }, [seasons, mostRecentSeason, singleYear, rangeFrom, rangeTo]);

  const activeYears = useMemo(() => {
    if (filterMode === "single" && singleYear != null) return [singleYear];
    if (filterMode === "range" && rangeFrom != null && rangeTo != null) {
      const lo = Math.min(rangeFrom, rangeTo), hi = Math.max(rangeFrom, rangeTo);
      return seasons.filter(s => s >= lo && s <= hi);
    }
    return seasons;
  }, [filterMode, singleYear, rangeFrom, rangeTo, seasons]);

  const scoreEntries = useMemo(() => computeScoreEntries(teamIdx, matchups), [teamIdx, matchups]);
  const scoredEntriesInScope = useMemo(() => scoreEntries.filter(e => activeYears.includes(e.season)), [scoreEntries, activeYears]);
  const scoreHigh = useMemo(() => [...scoredEntriesInScope].sort((a, b) => b.score - a.score).slice(0, 10), [scoredEntriesInScope]);
  const scoreLow = useMemo(() => [...scoredEntriesInScope].sort((a, b) => a.score - b.score).slice(0, 10), [scoredEntriesInScope]);

  const isCustomActive = filterMode === "range" || (filterMode === "single" && singleYear !== mostRecentSeason);

  return (
    <>
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:16 }}>
        <div style={{ display:"flex", gap:6 }}>
          <button onClick={()=>{ setFilterMode("all"); setShowCustom(false); }}
            style={filterMode==="all" ? btnStyle("#2a2a18","#c9a227") : btnStyle()}>All-Time</button>
          <button onClick={()=>{ setFilterMode("single"); setSingleYear(mostRecentSeason); setShowCustom(false); }}
            style={(filterMode==="single" && singleYear===mostRecentSeason) ? btnStyle("#2a2a18","#c9a227") : btnStyle()}>
            {mostRecentSeason}
          </button>
          <div style={{ position:"relative" }}>
            <button onClick={()=>setShowCustom(s=>!s)} style={isCustomActive ? btnStyle("#2a2a18","#c9a227") : btnStyle()}>
              Custom {showCustom ? "▲" : "▼"}
            </button>
            {showCustom && (
              <div style={{ position:"absolute", top:"110%", right:0, zIndex:10, background:"#181910",
                border:"1px solid #33362a", borderRadius:10, padding:14, width:230, boxShadow:"0 8px 24px rgba(0,0,0,0.4)" }}>
                <div style={{ fontSize:11, opacity:0.6, marginBottom:6 }}>Single Season</div>
                <select value={singleYear ?? ""} onChange={e=>{ setSingleYear(Number(e.target.value)); setFilterMode("single"); setShowCustom(false); }}
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
                <button onClick={()=>{ setFilterMode("range"); setShowCustom(false); }} style={{...btnStyle("#20211a","#c9a227"), width:"100%"}}>
                  Apply
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={panelStyle()}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
          Season Records
        </div>
        {activeYears.map(s => {
          const rows = seasonRecords[s] || [];
          const ranked = rows.filter(r => r.finalRank != null);
          const champion = ranked.find(r => r.finalRank === 1);
          const lastPlace = ranked.length ? ranked.reduce((a, b) => (a.finalRank > b.finalRank ? a : b)) : null;
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
                      <tr key={`${r.season}-${r.ownerGuid}`}>
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

      <div style={panelStyle()}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
          Single-Week Score Records
        </div>
        <div style={{ display:"flex", gap:24, flexWrap:"wrap" }}>
          <div style={{ flex:"1 1 300px" }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#7fd18f", marginBottom:6 }}>Highest</div>
            {scoreHigh.map((e, i) => (
              <div key={i} style={{ fontSize:12.5, display:"flex", justifyContent:"space-between", padding:"3px 0", borderBottom:"1px solid #1e2018" }}>
                <span>{e.team.owner_name || e.team.team_name} — {e.season} wk {e.week}</span>
                <b>{e.score.toFixed(1)}</b>
              </div>
            ))}
            {scoreHigh.length === 0 && <div style={{ fontSize:12, opacity:0.6 }}>No games in this scope.</div>}
          </div>
          <div style={{ flex:"1 1 300px" }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#e08a8a", marginBottom:6 }}>Lowest</div>
            {scoreLow.map((e, i) => (
              <div key={i} style={{ fontSize:12.5, display:"flex", justifyContent:"space-between", padding:"3px 0", borderBottom:"1px solid #1e2018" }}>
                <span>{e.team.owner_name || e.team.team_name} — {e.season} wk {e.week}</span>
                <b>{e.score.toFixed(1)}</b>
              </div>
            ))}
            {scoreLow.length === 0 && <div style={{ fontSize:12, opacity:0.6 }}>No games in this scope.</div>}
          </div>
        </div>
      </div>
    </>
  );
}
