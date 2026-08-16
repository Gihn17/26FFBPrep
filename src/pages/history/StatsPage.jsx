import React, { useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { panelStyle, btnStyle } from "../../theme.jsx";
import { useSeasonFilter, SeasonFilterBar } from "./SeasonFilter.jsx";
import {
  computeScoreEntries, computeSeasonPPG, computeBlowouts, computeLossWinExtremes, computeStreaks,
} from "./compute.js";

const SUB_TABS = [["scores", "🏆 Scores"], ["matchups", "🎯 Matchups"], ["streaks", "🔥 Streaks"]];

/** One stat leaderboard: title + a two-way toggle (e.g. Juggernaut vs
 *  Featherweight), a highlighted #1 row, ranks 2-5 compact, and a "Show
 *  Top 10" expand. Every section on this page is one of these with
 *  differently-shaped rows ({primary, secondary, value}), rather than six
 *  bespoke layouts. */
function StatBlock({ title, toggleOptions, activeToggle, onToggle, rows, color }) {
  const [expanded, setExpanded] = useState(false);
  const visible = rows.slice(0, expanded ? 10 : 5);
  return (
    <div style={panelStyle()}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, flexWrap:"wrap", gap:8 }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", textTransform:"uppercase" }}>{title}</div>
        {toggleOptions && (
          <div style={{ display:"flex", gap:6 }}>
            {toggleOptions.map(([key, label]) => (
              <button key={key} onClick={()=>onToggle(key)} style={activeToggle===key ? btnStyle("#2a2a18","#c9a227") : btnStyle()}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize:12, opacity:0.6 }}>No games in this scope.</div>
      ) : (
        <>
          {visible.map((r, i) => i === 0 ? (
            <div key="0" style={{ border:`1px solid ${color}`, borderRadius:8, padding:14, marginBottom:8, background:`${color}18` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
                <div>
                  <span style={{ fontSize:11, background:"#c9a227", color:"#12130f", borderRadius:12, padding:"2px 9px", fontWeight:800, marginRight:8 }}>#1</span>
                  <span style={{ fontWeight:700, fontSize:14 }}>{r.primary}</span>
                  {r.secondary && <div style={{ fontSize:11.5, opacity:0.65, marginTop:4 }}>{r.secondary}</div>}
                </div>
                <div style={{ fontSize:24, fontWeight:800, color }}>{r.value}</div>
              </div>
            </div>
          ) : (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 10px", background:"#181910", borderRadius:6, marginBottom:6, fontSize:12.5 }}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                <span style={{ opacity:0.5, width:16 }}>{i + 1}</span>
                <div>
                  {r.primary}
                  {r.secondary && <div style={{ fontSize:11, opacity:0.6 }}>{r.secondary}</div>}
                </div>
              </div>
              <b style={{ color }}>{r.value}</b>
            </div>
          ))}
          {rows.length > 5 && (
            <button onClick={()=>setExpanded(e=>!e)} style={{ ...btnStyle(), width:"100%", marginTop:4 }}>
              {expanded ? "Show less" : "Show Top 10"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ScoresTab({ teamIdx, matchups, seasonRecords, activeYears }) {
  const [scoreView, setScoreView] = useState("high");
  const [ppgView, setPpgView] = useState("high");

  const scoreEntries = useMemo(() => computeScoreEntries(teamIdx, matchups).filter(e => activeYears.includes(e.season)), [teamIdx, matchups, activeYears]);
  const scoreRows = useMemo(() => {
    const sorted = [...scoreEntries].sort((a, b) => scoreView === "high" ? b.score - a.score : a.score - b.score);
    return sorted.map(e => ({
      primary: e.team.owner_name || e.team.team_name,
      secondary: `${e.season} · Week ${e.week}`,
      value: e.score.toFixed(1),
    }));
  }, [scoreEntries, scoreView]);

  const ppg = useMemo(() => computeSeasonPPG(seasonRecords, activeYears), [seasonRecords, activeYears]);
  const ppgRows = useMemo(() => (ppgView === "high" ? ppg.highest : ppg.lowest).map(r => ({
    primary: r.name, secondary: `${r.season} · ${r.games} games`, value: r.ppg.toFixed(1),
  })), [ppg, ppgView]);

  return (
    <>
      <StatBlock title="Most Points (Game)" color="#c9a227" rows={scoreRows}
        toggleOptions={[["high","Juggernaut"],["low","Featherweight"]]} activeToggle={scoreView} onToggle={setScoreView} />
      <StatBlock title="Most PPG (Season)" color="#4f8fd1" rows={ppgRows}
        toggleOptions={[["high","Powerhouse"],["low","Gauntlet"]]} activeToggle={ppgView} onToggle={setPpgView} />
    </>
  );
}

function MatchupsTab({ teamIdx, matchups, activeYears }) {
  const [blowoutView, setBlowoutView] = useState("biggest");
  const [lossWinView, setLossWinView] = useState("heartbreak");

  const blowouts = useMemo(() => computeBlowouts(teamIdx, matchups, activeYears), [teamIdx, matchups, activeYears]);
  const blowoutRows = useMemo(() => (blowoutView === "biggest" ? blowouts.biggest : blowouts.closest).map(g => ({
    primary: <>{g.winnerName} <span style={{opacity:0.5, fontWeight:400}}>def.</span> {g.loserName}</>,
    secondary: `${g.season} · Week ${g.week} · ${g.winnerScore.toFixed(1)} - ${g.loserScore.toFixed(1)}`,
    value: `+${g.margin.toFixed(2)}`,
  })), [blowouts, blowoutView]);

  const lossWin = useMemo(() => computeLossWinExtremes(teamIdx, matchups, activeYears), [teamIdx, matchups, activeYears]);
  const lossWinRows = useMemo(() => {
    if (lossWinView === "heartbreak") {
      return lossWin.heartbreak.map(g => ({
        primary: g.loserName, secondary: `lost to ${g.winnerName} · ${g.season} wk ${g.week}`, value: `${g.loserScore.toFixed(1)} pts`,
      }));
    }
    return lossWin.criminal.map(g => ({
      primary: g.winnerName, secondary: `beat ${g.loserName} · ${g.season} wk ${g.week}`, value: `${g.winnerScore.toFixed(1)} pts`,
    }));
  }, [lossWin, lossWinView]);

  return (
    <>
      <StatBlock title="Biggest Blowouts" color="#7fd18f" rows={blowoutRows}
        toggleOptions={[["biggest","Cakewalk"],["closest","Nailbiter"]]} activeToggle={blowoutView} onToggle={setBlowoutView} />
      <StatBlock title={lossWinView === "heartbreak" ? "Most Points in a Loss" : "Fewest Points in a Win"} color="#8a63d1" rows={lossWinRows}
        toggleOptions={[["heartbreak","Heartbreak"],["criminal","Criminal"]]} activeToggle={lossWinView} onToggle={setLossWinView} />
    </>
  );
}

function streakLabel(s) {
  return s.startSeason === s.endSeason
    ? `${s.startSeason} · Weeks ${s.startWeek} → ${s.endWeek}`
    : `${s.startSeason} Wk${s.startWeek} → ${s.endSeason} Wk${s.endWeek}`;
}

function StreaksTab({ teamIdx, matchups, activeYears }) {
  const [winMode, setWinMode] = useState("season");
  const [lossMode, setLossMode] = useState("season");

  const winStreaks = useMemo(() => computeStreaks(teamIdx, matchups, activeYears, winMode), [teamIdx, matchups, activeYears, winMode]);
  const winRows = useMemo(() => winStreaks.winStreaks.map(s => ({ primary: s.name, secondary: streakLabel(s), value: `${s.len} W` })), [winStreaks]);

  const lossStreaks = useMemo(() => computeStreaks(teamIdx, matchups, activeYears, lossMode), [teamIdx, matchups, activeYears, lossMode]);
  const lossRows = useMemo(() => lossStreaks.lossStreaks.map(s => ({ primary: s.name, secondary: streakLabel(s), value: `${s.len} L` })), [lossStreaks]);

  return (
    <>
      <StatBlock title="Longest Winning Streaks" color="#7fd18f" rows={winRows}
        toggleOptions={[["season","Season"],["overall","Overall"]]} activeToggle={winMode} onToggle={setWinMode} />
      <StatBlock title="Longest Losing Streaks" color="#e08a8a" rows={lossRows}
        toggleOptions={[["season","Season"],["overall","Overall"]]} activeToggle={lossMode} onToggle={setLossMode} />
    </>
  );
}

export default function StatsPage() {
  const { teamIdx, matchups, seasonRecords, seasons } = useOutletContext();
  const filter = useSeasonFilter(seasons);
  const { activeYears } = filter;
  const [subTab, setSubTab] = useState("scores");

  return (
    <>
      <SeasonFilterBar seasons={seasons} filter={filter} />

      <div style={{ display:"flex", justifyContent:"center", gap:8, marginBottom:16 }}>
        {SUB_TABS.map(([key, label]) => (
          <button key={key} onClick={()=>setSubTab(key)}
            style={{
              padding:"8px 18px", borderRadius:8,
              border:"1px solid " + (subTab===key ? "#c9a227" : "#33362a"),
              background: subTab===key ? "#2a2a18" : "#181910", color: subTab===key ? "#f0d97a" : "#c9c6ba",
              fontWeight:700, fontSize:13,
            }}>
            {label}
          </button>
        ))}
      </div>

      {subTab === "scores" && <ScoresTab teamIdx={teamIdx} matchups={matchups} seasonRecords={seasonRecords} activeYears={activeYears} />}
      {subTab === "matchups" && <MatchupsTab teamIdx={teamIdx} matchups={matchups} activeYears={activeYears} />}
      {subTab === "streaks" && <StreaksTab teamIdx={teamIdx} matchups={matchups} activeYears={activeYears} />}
    </>
  );
}
