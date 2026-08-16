import React, { useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { panelStyle, th, td } from "../../theme.jsx";
import { computeCareerStats } from "./compute.js";

export default function ChampsPage() {
  const { teams, seasonRecords, seasons } = useOutletContext();
  const careerStats = useMemo(() => computeCareerStats(teams, seasonRecords), [teams, seasonRecords]);
  const titleHolders = useMemo(() => careerStats.filter(c => c.championships > 0), [careerStats]);

  return (
    <>
      <div style={panelStyle()}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
          Champions by Season
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", fontSize:12.5 }}>
            <thead>
              <tr style={{ opacity:0.65, textAlign:"left" }}>
                <th style={th()}>Season</th><th style={th("left")}>🏆 Champion</th><th style={th()}>Record</th>
                <th style={th()}>Pts For</th><th style={th("left")}>Runner-up</th><th style={th("left")}>Last Place</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map(s => {
                const rows = (seasonRecords[s] || []).filter(r => r.finalRank != null);
                const champion = rows.find(r => r.finalRank === 1);
                const runnerUp = rows.find(r => r.finalRank === 2);
                const lastPlace = rows.length ? rows.reduce((a, b) => (a.finalRank > b.finalRank ? a : b)) : null;
                if (!champion) return (
                  <tr key={s}><td style={td()}>{s}</td><td style={td("left")} colSpan={5}>In progress, not finalized yet</td></tr>
                );
                return (
                  <tr key={s}>
                    <td style={td()}>{s}</td>
                    <td style={{...td("left"), fontWeight:700, color:"#f0d97a"}}>{champion.ownerName || champion.teamName}</td>
                    <td style={td()}>{champion.wins}-{champion.losses}{champion.ties ? `-${champion.ties}` : ""}</td>
                    <td style={td()}>{champion.pointsFor.toFixed(1)}</td>
                    <td style={td("left")}>{runnerUp ? (runnerUp.ownerName || runnerUp.teamName) : "—"}</td>
                    <td style={td("left")}>{lastPlace && lastPlace !== champion ? (lastPlace.ownerName || lastPlace.teamName) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={panelStyle()}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
          Most Championships
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", fontSize:12.5 }}>
            <thead>
              <tr style={{ opacity:0.65, textAlign:"left" }}>
                <th style={th("left")}>Owner</th><th style={th()}>Titles</th><th style={th()}>Seasons Played</th>
              </tr>
            </thead>
            <tbody>
              {titleHolders.map(c => (
                <tr key={c.ownerGuid}>
                  <td style={td("left")}>{c.ownerName}</td>
                  <td style={{...td(), fontWeight:700, color:"#f0d97a"}}>{"🏆".repeat(c.championships)} {c.championships}</td>
                  <td style={td()}>{c.seasons}</td>
                </tr>
              ))}
              {titleHolders.length === 0 && <tr><td style={td("left")} colSpan={3}>No completed seasons yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
