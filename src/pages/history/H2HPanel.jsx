import React, { useMemo } from "react";
import { btnStyle, th, td } from "../../theme.jsx";
import { computeH2HGames } from "./compute.js";

/** Shared by H2HPage (both sides pickable) and TeamDetailPage (side A
 *  locked to the franchise whose page you're on, only the opponent is
 *  pickable) — one place for the "leader's number goes first" logic so a
 *  future fix to it doesn't need to be made twice. */
export default function H2HPanel({ teamIdx, matchups, ownerOptions, ownerA, ownerB, onChangeA, onChangeB, lockA }) {
  const h2hGames = useMemo(() => computeH2HGames(teamIdx, matchups, ownerA, ownerB), [teamIdx, matchups, ownerA, ownerB]);
  const h2hSummary = useMemo(() => {
    let winsA = 0, winsB = 0, ties = 0, ptsA = 0, ptsB = 0;
    for (const g of h2hGames) {
      ptsA += g.scoreA; ptsB += g.scoreB;
      if (g.scoreA > g.scoreB) winsA++; else if (g.scoreB > g.scoreA) winsB++; else ties++;
    }
    return { winsA, winsB, ties, ptsA, ptsB };
  }, [h2hGames]);
  const nameA = ownerOptions.find(o => o.guid === ownerA)?.name;
  const nameB = ownerOptions.find(o => o.guid === ownerB)?.name;

  return (
    <>
      <div style={{ display:"flex", gap:16, alignItems:"flex-end", flexWrap:"wrap", marginBottom:12 }}>
        {!lockA && (
          <label style={{ display:"flex", flexDirection:"column", gap:4, fontSize:11, opacity:0.75 }}>
            Team A
            <select value={ownerA} onChange={e=>onChangeA(e.target.value)} style={{...btnStyle(), cursor:"pointer"}}>
              {ownerOptions.map(o => <option key={o.guid} value={o.guid} disabled={o.guid === ownerB}>{o.name}</option>)}
            </select>
          </label>
        )}
        <label style={{ display:"flex", flexDirection:"column", gap:4, fontSize:11, opacity:0.75 }}>
          {lockA ? "Opponent" : "Team B"}
          <select value={ownerB} onChange={e=>onChangeB(e.target.value)} style={{...btnStyle(), cursor:"pointer"}}>
            {lockA && <option value="">Select Opponent…</option>}
            {ownerOptions.map(o => <option key={o.guid} value={o.guid} disabled={o.guid === ownerA}>{o.name}</option>)}
          </select>
        </label>
      </div>

      {!ownerB ? (
        <div style={{ fontSize:12.5, opacity:0.6, textAlign:"center", padding:"20px 0" }}>
          Choose an opponent to see head-to-head history and stats.
        </div>
      ) : ownerA === ownerB ? (
        <div style={{ fontSize:12.5, opacity:0.7 }}>Pick two different teams to compare.</div>
      ) : h2hGames.length === 0 ? (
        <div style={{ fontSize:12.5, opacity:0.7 }}>These two have never played each other.</div>
      ) : (
        <>
          <div style={{ fontSize:13, marginBottom:10 }}>
            {(() => {
              // "X leads N-M" needs N (the leader's number) first, regardless
              // of which dropdown (A/B) the leader happens to be in.
              const aLeads = h2hSummary.winsA > h2hSummary.winsB;
              const bLeads = h2hSummary.winsB > h2hSummary.winsA;
              const leaderName = aLeads ? nameA : bLeads ? nameB : null;
              const leaderWins = aLeads ? h2hSummary.winsA : h2hSummary.winsB;
              const trailerWins = aLeads ? h2hSummary.winsB : h2hSummary.winsA;
              const leaderPts = aLeads ? h2hSummary.ptsA : h2hSummary.ptsB;
              const trailerPts = aLeads ? h2hSummary.ptsB : h2hSummary.ptsA;
              return (
                <>
                  {leaderName ? <><b>{leaderName}</b> leads</> : "Series is tied"}{" "}
                  <b>{leaderWins}-{trailerWins}{h2hSummary.ties ? `-${h2hSummary.ties}` : ""}</b>
                  {" "}({leaderPts.toFixed(1)} - {trailerPts.toFixed(1)} points) across {h2hGames.length} game{h2hGames.length===1?"":"s"}.
                </>
              );
            })()}
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", fontSize:12.5 }}>
              <thead>
                <tr style={{ opacity:0.65, textAlign:"left" }}>
                  <th style={th()}>Season</th><th style={th()}>Week</th>
                  <th style={th("left")}>{nameA}</th>
                  <th style={th("left")}>{nameB}</th>
                  <th style={th("left")}>Winner</th>
                </tr>
              </thead>
              <tbody>
                {h2hGames.map((g, i) => {
                  const aWon = g.scoreA > g.scoreB;
                  const bWon = g.scoreB > g.scoreA;
                  const winnerName = aWon ? nameA : bWon ? nameB : "Tie";
                  return (
                    <tr key={i}>
                      <td style={td()}>{g.season}</td>
                      <td style={td()}>{g.week}{g.playoffTier && g.playoffTier !== "NONE" ? " (playoffs)" : ""}</td>
                      <td style={{...td("left"), fontWeight: aWon ? 700 : 400, color: aWon ? "#7fd18f" : undefined}}>{g.teamNameA} — {g.scoreA.toFixed(1)}</td>
                      <td style={{...td("left"), fontWeight: bWon ? 700 : 400, color: bWon ? "#7fd18f" : undefined}}>{g.teamNameB} — {g.scoreB.toFixed(1)}</td>
                      <td style={td("left")}>{winnerName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
