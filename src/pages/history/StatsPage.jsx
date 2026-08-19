import React, { useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { panelStyle, btnStyle } from "../../theme.jsx";
import { useSeasonFilter, SeasonPillFilter } from "./SeasonFilter.jsx";
import {
  computeScoreEntries, computeSeasonPPG, computeBlowouts, computeLossWinExtremes, computeStreaks,
} from "./compute.js";
import TeamAvatar from "./Avatar.jsx";

const SUB_TABS = [["scores", "🏆 Scores"], ["matchups", "◎ Matchups"], ["streaks", "🔥 Streaks"]];
const MEDAL_COLOR = ["#e0b93f", "#b9bcc4", "#c9793f"]; // gold / silver / bronze, ranks 1-3

/** One podium bar. Bar height is fixed per rank (not scaled to the value)
 *  — the three values in a block are usually close together (or, in "low"
 *  mode, the #1 spot is the smallest number), so a value-proportional bar
 *  would either be visually flat or make the actual record look shortest.
 *  Rank order alone is what the podium communicates. */
function PodiumBar({ rank, row, color, currentLogos }) {
  const height = rank === 1 ? 128 : 106;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flex:"0 1 150px", minWidth:110 }}>
      <TeamAvatar name={row.avatarName} seed={row.avatarGuid || row.avatarName} size={rank === 1 ? 64 : 54} imageUrl={currentLogos.get(row.avatarGuid)} />
      <div style={{ fontWeight:700, fontSize:13, marginTop:8, textAlign:"center" }}>{row.primary}</div>
      {row.secondary && <div style={{ fontSize:11, opacity:0.6, marginBottom:8, textAlign:"center" }}>{row.secondary}</div>}
      <div style={{
        width:"100%", height, borderRadius:8, marginTop:"auto",
        background: `linear-gradient(180deg, ${color}, ${color}bb)`,
        display:"flex", alignItems:"center", justifyContent:"center",
        boxShadow: `0 4px 14px ${color}33`,
      }}>
        <span style={{ fontSize:20, fontWeight:800, color:"#12130f" }}>{row.value}</span>
      </div>
    </div>
  );
}

/** One stat leaderboard, redesigned as a 3-bar "podium" (2nd-1st-3rd, gold
 *  in the middle) for the top spots, with a toggle for the stat's two
 *  directions and a "Show Top 10" list underneath for ranks 4-10. */
function StatBlock({ icon, iconColor, title, toggleOptions, activeToggle, onToggle, rows, currentLogos }) {
  const [expanded, setExpanded] = useState(false);
  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3, 10);
  const podiumOrder = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3; // silver, gold, bronze
  const podiumRanks = top3.length === 3 ? [2, 1, 3] : top3.map((_, i) => i + 1);

  return (
    <div style={panelStyle()}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18, flexWrap:"wrap", gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:38, height:38, borderRadius:9, background:iconColor, display:"flex", alignItems:"center", justifyContent:"center", fontSize:17 }}>{icon}</div>
          <div style={{ fontWeight:800, fontSize:16 }}>{title}</div>
        </div>
        {toggleOptions && (
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {toggleOptions.map(([key, label, ico]) => (
              <button key={key} onClick={()=>onToggle(key)} style={{
                display:"flex", alignItems:"center", gap:6, padding:"9px 16px", borderRadius:9, fontWeight:700, fontSize:13,
                border: "1px solid " + (activeToggle===key ? iconColor : "#33362a"),
                background: activeToggle===key ? iconColor : "#20211a",
                color: activeToggle===key ? "#12130f" : "#9c998e",
              }}>
                {ico} {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize:12, opacity:0.6 }}>No games in this scope.</div>
      ) : (
        <>
          <div style={{ display:"flex", justifyContent:"center", alignItems:"flex-end", gap:18, flexWrap:"wrap", marginBottom:16 }}>
            {podiumOrder.map((row, i) => <PodiumBar key={i} rank={podiumRanks[i]} row={row} color={MEDAL_COLOR[podiumRanks[i]-1]} currentLogos={currentLogos} />)}
          </div>

          {rest.length > 0 && (
            <>
              <div style={{ borderTop:"1px solid #2a2c20", margin:"4px 0 10px" }} />
              {expanded && rest.map((r, i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 10px", background:"#181910", borderRadius:6, marginBottom:6, fontSize:12.5 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ opacity:0.5, width:16 }}>{i + 4}</span>
                    <TeamAvatar name={r.avatarName} seed={r.avatarGuid || r.avatarName} size={22} imageUrl={currentLogos.get(r.avatarGuid)} />
                    <div>
                      {r.primary}
                      {r.secondary && <div style={{ fontSize:11, opacity:0.6 }}>{r.secondary}</div>}
                    </div>
                  </div>
                  <b>{r.value}</b>
                </div>
              ))}
              <button onClick={()=>setExpanded(e=>!e)} style={{ ...btnStyle(), width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                {expanded ? "▲ Show less" : "▼ Show Top 10"}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ScoresTab({ teamIdx, matchups, seasonRecords, activeYears, currentLogos }) {
  const [scoreView, setScoreView] = useState("high");
  const [ppgView, setPpgView] = useState("high");

  const scoreEntries = useMemo(() => computeScoreEntries(teamIdx, matchups).filter(e => activeYears.includes(e.season)), [teamIdx, matchups, activeYears]);
  const scoreRows = useMemo(() => {
    const sorted = [...scoreEntries].sort((a, b) => scoreView === "high" ? b.score - a.score : a.score - b.score);
    return sorted.map(e => ({
      primary: e.team.owner_name || e.team.team_name, avatarGuid: e.team.owner_guid, avatarName: e.team.team_name,
      secondary: `${e.season} · Week ${e.week}`, value: e.score.toFixed(1),
    }));
  }, [scoreEntries, scoreView]);

  const ppg = useMemo(() => computeSeasonPPG(seasonRecords, activeYears), [seasonRecords, activeYears]);
  const ppgRows = useMemo(() => (ppgView === "high" ? ppg.highest : ppg.lowest).map(r => ({
    primary: r.name, avatarGuid: r.ownerGuid, avatarName: r.teamName, secondary: `${r.season} · ${r.games} games`, value: r.ppg.toFixed(1),
  })), [ppg, ppgView]);

  return (
    <>
      <StatBlock icon="💪" iconColor="#3f9e5e" title={scoreView === "high" ? "Most Points (game)" : "Least Points (game)"} rows={scoreRows} currentLogos={currentLogos}
        toggleOptions={[["high","Most Points (game)","💪"],["low","Least Points (game)","🪶"]]} activeToggle={scoreView} onToggle={setScoreView} />
      <StatBlock icon="⚡" iconColor="#4f8fd1" title={ppgView === "high" ? "Most PPG" : "Least PPG"} rows={ppgRows} currentLogos={currentLogos}
        toggleOptions={[["high","Most PPG","⚡"],["low","Least PPG","🛡️"]]} activeToggle={ppgView} onToggle={setPpgView} />
    </>
  );
}

function MatchupsTab({ teamIdx, matchups, activeYears, currentLogos }) {
  const [blowoutView, setBlowoutView] = useState("biggest");
  const [lossWinView, setLossWinView] = useState("heartbreak");

  const blowouts = useMemo(() => computeBlowouts(teamIdx, matchups, activeYears), [teamIdx, matchups, activeYears]);
  const blowoutRows = useMemo(() => (blowoutView === "biggest" ? blowouts.biggest : blowouts.closest).map(g => ({
    primary: `${g.winnerName} def. ${g.loserName}`, avatarGuid: g.winnerGuid, avatarName: g.winnerTeamName,
    secondary: `${g.season} · Week ${g.week} · ${g.winnerScore.toFixed(1)} - ${g.loserScore.toFixed(1)}`,
    value: `+${g.margin.toFixed(1)}`,
  })), [blowouts, blowoutView]);

  const lossWin = useMemo(() => computeLossWinExtremes(teamIdx, matchups, activeYears), [teamIdx, matchups, activeYears]);
  const lossWinRows = useMemo(() => {
    if (lossWinView === "heartbreak") {
      return lossWin.heartbreak.map(g => ({
        primary: g.loserName, avatarGuid: g.loserGuid, avatarName: g.loserTeamName,
        secondary: `lost to ${g.winnerName} · ${g.season} wk ${g.week}`, value: `${g.loserScore.toFixed(1)}`,
      }));
    }
    return lossWin.criminal.map(g => ({
      primary: g.winnerName, avatarGuid: g.winnerGuid, avatarName: g.winnerTeamName,
      secondary: `beat ${g.loserName} · ${g.season} wk ${g.week}`, value: `${g.winnerScore.toFixed(1)}`,
    }));
  }, [lossWin, lossWinView]);

  return (
    <>
      <StatBlock icon="◎" iconColor="#7fd18f" title={blowoutView === "biggest" ? "Biggest Blowouts" : "Biggest Nailbiter"} rows={blowoutRows} currentLogos={currentLogos}
        toggleOptions={[["biggest","Biggest Blowouts","🎂"],["closest","Biggest Nailbiter","🔍"]]} activeToggle={blowoutView} onToggle={setBlowoutView} />
      <StatBlock icon="💔" iconColor="#8a63d1" title={lossWinView === "heartbreak" ? "Most Points in a Loss" : "Fewest Points in a Win"} rows={lossWinRows} currentLogos={currentLogos}
        toggleOptions={[["heartbreak","Most Points in a Loss","💔"],["criminal","Fewest Points in a Win","🕵️"]]} activeToggle={lossWinView} onToggle={setLossWinView} />
    </>
  );
}

function streakLabel(s) {
  return s.startSeason === s.endSeason
    ? `${s.startSeason} · Weeks ${s.startWeek} → ${s.endWeek}`
    : `${s.startSeason} Wk${s.startWeek} → ${s.endSeason} Wk${s.endWeek}`;
}

function StreaksTab({ teamIdx, matchups, activeYears, currentLogos }) {
  // Season-only — a streak that reset every year end used to also be
  // offered as "Overall" (chained across season boundaries by owner);
  // dropped per Will's call, so this is always the within-a-season kind.
  const winStreaks = useMemo(() => computeStreaks(teamIdx, matchups, activeYears, "season"), [teamIdx, matchups, activeYears]);
  const winRows = useMemo(() => winStreaks.winStreaks.map(s => ({
    primary: s.name, avatarGuid: s.ownerGuid, avatarName: s.teamName, secondary: streakLabel(s), value: `${s.len}W`,
  })), [winStreaks]);

  const lossStreaks = useMemo(() => computeStreaks(teamIdx, matchups, activeYears, "season"), [teamIdx, matchups, activeYears]);
  const lossRows = useMemo(() => lossStreaks.lossStreaks.map(s => ({
    primary: s.name, avatarGuid: s.ownerGuid, avatarName: s.teamName, secondary: streakLabel(s), value: `${s.len}L`,
  })), [lossStreaks]);

  return (
    <>
      <StatBlock icon="🔥" iconColor="#7fd18f" title="Longest Winning Streaks" rows={winRows} currentLogos={currentLogos} />
      <StatBlock icon="🥶" iconColor="#e08a8a" title="Longest Losing Streaks" rows={lossRows} currentLogos={currentLogos} />
    </>
  );
}

export default function StatsPage() {
  const { teamIdx, matchups, seasonRecords, seasons, currentLogos } = useOutletContext();
  const filter = useSeasonFilter(seasons);
  const { activeYears, filterMode } = filter;
  const [subTab, setSubTab] = useState("scores");

  const scopeLabel = filterMode === "all" ? "All-Time"
    : filterMode === "single" ? `${activeYears[0]}`
    : activeYears.length ? `${Math.min(...activeYears)}–${Math.max(...activeYears)}` : "All-Time";

  return (
    <>
      <div style={{ background:"linear-gradient(135deg, #1f6f7a, #164e57)", borderRadius:12, padding:"18px 20px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:14 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ fontSize:32 }}>🏈</div>
          <div>
            <div style={{ fontSize:22, fontWeight:800 }}>Stat Records</div>
            <div style={{ fontSize:12.5, opacity:0.85 }}>{scopeLabel}</div>
          </div>
        </div>
        <SeasonPillFilter seasons={seasons} filter={filter} />
      </div>

      <div style={{ display:"flex", justifyContent:"center", gap:8, marginBottom:16 }}>
        {SUB_TABS.map(([key, label]) => (
          <button key={key} onClick={()=>setSubTab(key)}
            style={{
              padding:"10px 22px", borderRadius:10,
              border:"1px solid " + (subTab===key ? "#1f6f7a" : "#33362a"),
              background: subTab===key ? "#1f6f7a" : "#181910", color: subTab===key ? "#fff" : "#c9c6ba",
              fontWeight:700, fontSize:13,
            }}>
            {label}
          </button>
        ))}
      </div>

      {subTab === "scores" && <ScoresTab teamIdx={teamIdx} matchups={matchups} seasonRecords={seasonRecords} activeYears={activeYears} currentLogos={currentLogos} />}
      {subTab === "matchups" && <MatchupsTab teamIdx={teamIdx} matchups={matchups} activeYears={activeYears} currentLogos={currentLogos} />}
      {subTab === "streaks" && <StreaksTab teamIdx={teamIdx} matchups={matchups} activeYears={activeYears} currentLogos={currentLogos} />}
    </>
  );
}
