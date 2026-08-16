import React, { useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { panelStyle, th, td } from "../../theme.jsx";
import { computeCareerStats } from "./compute.js";

export default function TeamsPage() {
  const { teams, seasonRecords } = useOutletContext();
  const careerStats = useMemo(() => computeCareerStats(teams, seasonRecords), [teams, seasonRecords]);

  return (
    <div style={panelStyle()}>
      <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
        All-Time Team Records
      </div>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", fontSize:12.5, whiteSpace:"nowrap" }}>
          <thead>
            <tr style={{ opacity:0.65, textAlign:"left" }}>
              <th style={th("left")}>Owner</th><th style={th()}>Seasons</th>
              <th style={th()}>W</th><th style={th()}>L</th><th style={th()}>T</th><th style={th()}>Win %</th>
              <th style={th()}>Pts For</th><th style={th()}>Pts Against</th>
              <th style={th()}>Titles</th><th style={th()}>Best</th><th style={th()}>Worst</th>
            </tr>
          </thead>
          <tbody>
            {careerStats.map(c => {
              const games = c.wins + c.losses + c.ties;
              const winPct = games ? (c.wins + c.ties * 0.5) / games : 0;
              return (
                <tr key={c.ownerGuid}>
                  <td style={td("left")}>{c.ownerName}</td>
                  <td style={td()}>{c.seasons}</td>
                  <td style={td()}>{c.wins}</td><td style={td()}>{c.losses}</td><td style={td()}>{c.ties}</td>
                  <td style={td()}>{(winPct * 100).toFixed(1)}%</td>
                  <td style={td()}>{c.pointsFor.toFixed(1)}</td>
                  <td style={td()}>{c.pointsAgainst.toFixed(1)}</td>
                  <td style={{...td(), color: c.championships ? "#f0d97a" : undefined, fontWeight: c.championships ? 700 : 400}}>
                    {c.championships || "—"}
                  </td>
                  <td style={td()}>{c.bestRank ?? "—"}</td>
                  <td style={td()}>{c.worstRank ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
