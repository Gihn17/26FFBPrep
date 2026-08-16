import React from "react";
import { useOutletContext } from "react-router-dom";
import { panelStyle, th, td } from "../../theme.jsx";
import { useSeasonFilter, SeasonFilterBar } from "./SeasonFilter.jsx";

export default function SeasonPage() {
  const { seasonRecords, seasons } = useOutletContext();
  const filter = useSeasonFilter(seasons);
  const { activeYears } = filter;

  return (
    <>
      <SeasonFilterBar seasons={seasons} filter={filter} />

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
  );
}
