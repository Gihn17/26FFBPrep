import React, { useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { panelStyle, th, td, btnStyle } from "../../theme.jsx";
import { computeDynastyRankings, computePlayoffLegends, computeScoreEntries } from "./compute.js";
import TeamAvatar from "./Avatar.jsx";

function leaderOf(list) {
  // Callers pass lists sorted for their own purposes (dynastyRankings is
  // sorted by championships, not runner-ups), so don't trust list[0] —
  // find the actual max ourselves.
  if (!list.length) return { label: "—", value: 0 };
  const max = Math.max(...list.map(x => x.count));
  if (!max) return { label: "—", value: 0 };
  const leaders = list.filter(x => x.count === max);
  return { label: leaders.length > 1 ? "Multiple Teams" : leaders[0].name, value: max };
}

function LegendCard({ title, color, value, label }) {
  return (
    <div style={{ flex:"1 1 180px", minWidth:150, border:"1px solid #2a2c20", borderRadius:10, overflow:"hidden" }}>
      <div style={{ background:color, padding:"8px 12px", fontSize:12.5, fontWeight:700, color:"#12130f" }}>{title}</div>
      <div style={{ padding:"14px 12px", background:"#181910", textAlign:"center" }}>
        <div style={{ fontSize:24, fontWeight:800 }}>{value}</div>
        <div style={{ fontSize:12, opacity:0.75, marginTop:2 }}>{label}</div>
      </div>
    </div>
  );
}

export default function ChampsPage() {
  const { teams, teamIdx, matchups, seasonRecords, seasons, currentLogos } = useOutletContext();
  const [showAllRankings, setShowAllRankings] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const dynastyRankings = useMemo(() => computeDynastyRankings(teams, seasonRecords), [teams, seasonRecords]);
  const playoffLegends = useMemo(() => computePlayoffLegends(teamIdx, matchups), [teamIdx, matchups]);
  const scoreEntries = useMemo(() => computeScoreEntries(teamIdx, matchups), [teamIdx, matchups]);
  const highScore = useMemo(() => [...scoreEntries].sort((a, b) => b.score - a.score)[0], [scoreEntries]);

  const seasonsWithChampion = useMemo(() =>
    seasons.filter(s => (seasonRecords[s] || []).some(r => r.finalRank === 1)),
    [seasons, seasonRecords]);
  const latestChamp = useMemo(() => {
    const s = seasonsWithChampion[0];
    if (s == null) return null;
    const champ = seasonRecords[s].find(r => r.finalRank === 1);
    return champ ? { ...champ, season: s } : null;
  }, [seasonsWithChampion, seasonRecords]);

  const rankingsVisible = dynastyRankings.slice(0, showAllRankings ? dynastyRankings.length : 5);
  const historyVisible = seasonsWithChampion.slice(0, showAllHistory ? seasonsWithChampion.length : 5);

  const champLeader = leaderOf(dynastyRankings.map(d => ({ name: d.ownerName, count: d.championships })));
  const runnerUpLeader = leaderOf(dynastyRankings.map(d => ({ name: d.ownerName, count: d.runnerUps })));
  const appsLeader = leaderOf(playoffLegends.apps);
  const winsLeader = leaderOf(playoffLegends.wins);

  return (
    <>
      {latestChamp && (
        <div style={{
          background: "linear-gradient(135deg, #c9a227, #e0863f)", borderRadius:12, padding:"32px 20px",
          textAlign:"center", marginBottom:16, color:"#12130f",
        }}>
          <div style={{
            width:70, height:70, borderRadius:"50%", border:"3px solid #f0d97a", margin:"0 auto 10px", position:"relative",
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>
            <TeamAvatar name={latestChamp.teamName} seed={latestChamp.ownerGuid || latestChamp.teamName} size={64} imageUrl={currentLogos.get(latestChamp.ownerGuid)} />
            <div style={{
              position:"absolute", bottom:-4, right:-4, width:26, height:26, borderRadius:"50%",
              background:"#181910", border:"2px solid #f0d97a", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13,
            }}>🏆</div>
          </div>
          <div style={{ fontSize:24, fontWeight:800 }}>{latestChamp.ownerName || latestChamp.teamName}</div>
          <div style={{ fontSize:14, opacity:0.85 }}>{latestChamp.season} Champion</div>
        </div>
      )}

      <div style={{ display:"flex", gap:16, flexWrap:"wrap", marginBottom:16 }}>
        <div style={{ ...panelStyle(), flex:"1 1 380px", marginBottom:0 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
            🎖️ Dynasty Rankings
          </div>
          <table style={{ width:"100%", fontSize:12.5 }}>
            <tbody>
              {rankingsVisible.map((d, i) => (
                <tr key={d.ownerGuid} style={{ borderBottom:"1px solid #1e2018" }}>
                  <td style={{ ...td(), width:24, opacity:0.6 }}>{i + 1}</td>
                  <td style={td("left")}>{d.ownerName}</td>
                  <td style={{ ...td(), color:"#f0d97a", fontWeight:700, whiteSpace:"nowrap" }}>{d.championships} 🏆</td>
                  <td style={{ ...td(), opacity:0.75, whiteSpace:"nowrap" }}>{d.runnerUps} 🥈</td>
                </tr>
              ))}
            </tbody>
          </table>
          {dynastyRankings.length > 5 && (
            <button onClick={()=>setShowAllRankings(s=>!s)} style={{ ...btnStyle(), width:"100%", marginTop:10 }}>
              {showAllRankings ? "Show less" : `Show All (${dynastyRankings.length})`}
            </button>
          )}
        </div>

        <div style={{ ...panelStyle(), flex:"1 1 380px", marginBottom:0 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
            🏆 Championship History
          </div>
          <table style={{ width:"100%", fontSize:12.5 }}>
            <tbody>
              {historyVisible.map(s => {
                const rows = seasonRecords[s] || [];
                const champ = rows.find(r => r.finalRank === 1);
                const runnerUp = rows.find(r => r.finalRank === 2);
                return (
                  <tr key={s} style={{ borderBottom:"1px solid #1e2018" }}>
                    <td style={{ ...td(), opacity:0.7 }}>{s}</td>
                    <td style={{ ...td("left"), fontWeight:700, color:"#f0d97a" }}>{champ.ownerName || champ.teamName}</td>
                    <td style={{ ...td(), whiteSpace:"nowrap" }}>{champ.pointsFor.toFixed(1)} - {runnerUp ? runnerUp.pointsFor.toFixed(1) : "—"}</td>
                    <td style={{ ...td("left"), opacity:0.75 }}>{runnerUp ? (runnerUp.ownerName || runnerUp.teamName) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {seasonsWithChampion.length > 5 && (
            <button onClick={()=>setShowAllHistory(s=>!s)} style={{ ...btnStyle(), width:"100%", marginTop:10 }}>
              {showAllHistory ? "Show less" : `Show All (${seasonsWithChampion.length} years)`}
            </button>
          )}
        </div>
      </div>

      <div style={panelStyle()}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
          👑 Playoff Legends
        </div>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          <LegendCard title="Championships" color="#c9a227" value={champLeader.value} label={champLeader.label} />
          <LegendCard title="Runner-Ups" color="#9c998e" value={runnerUpLeader.value} label={runnerUpLeader.label} />
          <LegendCard title="Playoff Apps" color="#4f8fd1" value={appsLeader.value} label={appsLeader.label} />
          <LegendCard title="Playoff Wins" color="#7fd18f" value={winsLeader.value} label={winsLeader.label} />
          {highScore && (
            <LegendCard title="High Score" color="#e0863f" value={highScore.score.toFixed(2)}
              label={`${highScore.team.owner_name || highScore.team.team_name} — ${highScore.season} wk ${highScore.week}`} />
          )}
        </div>
      </div>
    </>
  );
}
