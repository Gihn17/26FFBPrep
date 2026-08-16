import React, { useState, useEffect, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { panelStyle, btnStyle, th, td } from "../../theme.jsx";
import { computeH2HGames } from "./compute.js";

export default function H2HPage() {
  const { teamIdx, matchups, ownerOptions } = useOutletContext();
  const [ownerA, setOwnerA] = useState("");
  const [ownerB, setOwnerB] = useState("");

  // Default to the first two owners once loaded, so the page shows
  // something rather than two blank dropdowns.
  useEffect(() => {
    if (ownerOptions.length >= 2 && !ownerA && !ownerB) {
      setOwnerA(ownerOptions[0].guid);
      setOwnerB(ownerOptions[1].guid);
    }
  }, [ownerOptions, ownerA, ownerB]);

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
    <div style={panelStyle()}>
      <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
        Head-to-Head
      </div>
      <div style={{ display:"flex", gap:16, alignItems:"flex-end", flexWrap:"wrap", marginBottom:12 }}>
        <label style={{ display:"flex", flexDirection:"column", gap:4, fontSize:11, opacity:0.75 }}>
          Team A
          <select value={ownerA} onChange={e=>setOwnerA(e.target.value)} style={{...btnStyle(), cursor:"pointer"}}>
            {ownerOptions.map(o => <option key={o.guid} value={o.guid} disabled={o.guid === ownerB}>{o.name}</option>)}
          </select>
        </label>
        <label style={{ display:"flex", flexDirection:"column", gap:4, fontSize:11, opacity:0.75 }}>
          Team B
          <select value={ownerB} onChange={e=>setOwnerB(e.target.value)} style={{...btnStyle(), cursor:"pointer"}}>
            {ownerOptions.map(o => <option key={o.guid} value={o.guid} disabled={o.guid === ownerA}>{o.name}</option>)}
          </select>
        </label>
      </div>

      {ownerA === ownerB ? (
        <div style={{ fontSize:12.5, opacity:0.7 }}>Pick two different teams to compare.</div>
      ) : h2hGames.length === 0 ? (
        <div style={{ fontSize:12.5, opacity:0.7 }}>These two have never played each other.</div>
      ) : (
        <>
          <div style={{ fontSize:13, marginBottom:10 }}>
            {h2hSummary.winsA > h2hSummary.winsB ? <><b>{nameA}</b> leads</>
              : h2hSummary.winsB > h2hSummary.winsA ? <><b>{nameB}</b> leads</>
              : "Series is tied"}{" "}
            <b>{h2hSummary.winsA}-{h2hSummary.winsB}{h2hSummary.ties ? `-${h2hSummary.ties}` : ""}</b>
            {" "}({h2hSummary.ptsA.toFixed(1)} - {h2hSummary.ptsB.toFixed(1)} points) across {h2hGames.length} game{h2hGames.length===1?"":"s"}.
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
    </div>
  );
}
