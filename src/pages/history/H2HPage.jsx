import React, { useState, useEffect, useMemo } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { panelStyle, btnStyle, inp, th, td } from "../../theme.jsx";
import { computeWeekSlate, computeLatestPlayedWeek, ownerSlug } from "./compute.js";
import TeamAvatar from "./Avatar.jsx";
import H2HPanel from "./H2HPanel.jsx";

const MODES = [["week", "📅 This Week"], ["matchup", "⚔️ Compare Teams"]];
const HOT_STREAK_MIN = 3; // win streak length before a team's record gets a 🔥

function weeksInSeason(matchups, season) {
  return [...new Set(matchups.filter(m => m.season === season && m.away_team_id != null && m.home_score != null && !(m.home_score===0 && m.away_score===0)).map(m => m.week))].sort((a, b) => a - b);
}

function WeekPicker({ seasons, matchups, season, week, onChange, latest }) {
  const [open, setOpen] = useState(false);
  const [draftSeason, setDraftSeason] = useState(season);
  const [draftWeek, setDraftWeek] = useState(week);
  useEffect(() => { setDraftSeason(season); setDraftWeek(week); }, [season, week, open]);
  const draftWeeks = useMemo(() => weeksInSeason(matchups, draftSeason), [matchups, draftSeason]);
  const isCurrent = latest && season === latest.season && week === latest.week;

  return (
    <div style={{ display:"flex", gap:6 }}>
      <button onClick={() => latest && onChange(latest.season, latest.week)}
        style={isCurrent ? btnStyle("#2a2a18","#c9a227") : btnStyle("rgba(255,255,255,0.1)","rgba(255,255,255,0.3)")}>
        Current
      </button>
      <div style={{ position:"relative" }}>
        <button onClick={()=>setOpen(o=>!o)} style={!isCurrent ? btnStyle("#2a2a18","#c9a227") : btnStyle("rgba(255,255,255,0.1)","rgba(255,255,255,0.3)")}>
          {season} &middot; Week {week} {open ? "▲" : "▼"}
        </button>
        {open && (
          <div style={{ position:"absolute", top:"110%", right:0, zIndex:10, background:"#181910",
            border:"1px solid #33362a", borderRadius:10, padding:14, width:210, boxShadow:"0 8px 24px rgba(0,0,0,0.4)" }}>
            <div style={{ fontSize:11, opacity:0.6, marginBottom:6 }}>Season</div>
            <select value={draftSeason} onChange={e=>{ const s = Number(e.target.value); setDraftSeason(s); const wks = weeksInSeason(matchups, s); setDraftWeek(wks[wks.length-1] || 1); }}
              style={{...inp("100%"), marginBottom:14}}>
              {seasons.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div style={{ fontSize:11, opacity:0.6, marginBottom:6 }}>Week</div>
            <select value={draftWeek} onChange={e=>setDraftWeek(Number(e.target.value))} style={{...inp("100%"), marginBottom:12}}>
              {draftWeeks.map(w => <option key={w} value={w}>Week {w}</option>)}
            </select>
            <button onClick={()=>{ onChange(draftSeason, draftWeek); setOpen(false); }} style={{...btnStyle("#20211a","#c9a227"), width:"100%"}}>
              ✓ Apply
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamBlock({ team, record, align }) {
  const name = team?.owner_name || team?.team_name || "—";
  const hot = record?.streakType === "W" && record.streakLen >= HOT_STREAK_MIN;
  return (
    <Link to={team?.owner_guid ? `/league-koi/teams/${ownerSlug(team.owner_guid)}` : "#"}
      style={{ display:"flex", alignItems:"center", gap:10, textDecoration:"none", color:"inherit", flexDirection: align==="right" ? "row-reverse" : "row", flex:"1 1 0", minWidth:0 }}>
      <TeamAvatar name={team?.team_name} seed={team?.owner_guid || team?.team_name} size={40} />
      <div style={{ textAlign: align === "right" ? "right" : "left", minWidth:0 }}>
        <div style={{ fontWeight:700, fontSize:14.5, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{name}</div>
        <div style={{ fontSize:11.5, opacity:0.6 }}>
          {record ? `${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ""}` : "—"}
          {hot && " 🔥"}
        </div>
      </div>
    </Link>
  );
}

function MatchupCard({ g }) {
  const [expanded, setExpanded] = useState(false);
  const homeWon = g.homeScore > g.awayScore, awayWon = g.awayScore > g.homeScore;
  return (
    <div style={{ ...panelStyle(), marginBottom:10 }}>
      <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
        <TeamBlock team={g.homeTeam} record={g.homeRecord} align="left" />
        <div style={{ textAlign:"center", flex:"0 0 140px" }}>
          <div style={{ fontSize:10.5, opacity:0.5, letterSpacing:1, marginBottom:2 }}>FINAL</div>
          <div style={{ fontSize:20, fontWeight:800 }}>
            <span style={{ color: homeWon ? "#7fd18f" : "#e9e6dd" }}>{g.homeScore.toFixed(1)}</span>
            <span style={{ opacity:0.4, margin:"0 6px" }}>-</span>
            <span style={{ color: awayWon ? "#7fd18f" : "#e9e6dd" }}>{g.awayScore.toFixed(1)}</span>
          </div>
          {g.h2h && (
            <div style={{ fontSize:11.5, opacity:0.75, marginTop:4, display:"flex", gap:10, justifyContent:"center" }}>
              <span title="All-time head-to-head record between these two, as of this game">
                🏆 {g.h2h.winsHome}-{g.h2h.winsAway}{g.h2h.ties ? `-${g.h2h.ties}` : ""}
              </span>
              {g.h2h.streakSide && (
                <span title="Current head-to-head win streak in this rivalry">
                  🔥 {g.h2h.streakLen} win{g.h2h.streakLen===1 ? "" : "s"}
                </span>
              )}
            </div>
          )}
        </div>
        <TeamBlock team={g.awayTeam} record={g.awayRecord} align="right" />
        {g.h2h && g.h2h.allGames.length > 1 && (
          <button onClick={()=>setExpanded(e=>!e)} style={{ background:"none", border:"none", color:"#9c998e", cursor:"pointer", fontSize:14, padding:4 }}>
            {expanded ? "▲" : "▼"}
          </button>
        )}
      </div>
      {expanded && g.h2h && (
        <div style={{ marginTop:12, paddingTop:12, borderTop:"1px solid #2a2c20", overflowX:"auto" }}>
          <table style={{ width:"100%", fontSize:12 }}>
            <thead>
              <tr style={{ opacity:0.6, textAlign:"left" }}>
                <th style={th()}>Season</th><th style={th()}>Week</th>
                <th style={th("left")}>{g.homeTeam?.owner_name || g.homeTeam?.team_name}</th>
                <th style={th("left")}>{g.awayTeam?.owner_name || g.awayTeam?.team_name}</th>
                <th style={th("left")}>Winner</th>
              </tr>
            </thead>
            <tbody>
              {[...g.h2h.allGames].reverse().map((m, i) => {
                const aWon = m.scoreA > m.scoreB, bWon = m.scoreB > m.scoreA;
                return (
                  <tr key={i}>
                    <td style={td()}>{m.season}</td>
                    <td style={td()}>{m.week}{m.playoffTier && m.playoffTier !== "NONE" ? " (playoffs)" : ""}</td>
                    <td style={{...td("left"), fontWeight: aWon ? 700 : 400, color: aWon ? "#7fd18f" : undefined}}>{m.scoreA.toFixed(1)}</td>
                    <td style={{...td("left"), fontWeight: bWon ? 700 : 400, color: bWon ? "#7fd18f" : undefined}}>{m.scoreB.toFixed(1)}</td>
                    <td style={td("left")}>{aWon ? (g.homeTeam?.owner_name || g.homeTeam?.team_name) : bWon ? (g.awayTeam?.owner_name || g.awayTeam?.team_name) : "Tie"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WeekView({ teamIdx, matchups, teams, seasons }) {
  const latest = useMemo(() => computeLatestPlayedWeek(teams, matchups), [teams, matchups]);
  const [season, setSeason] = useState(latest?.season);
  const [week, setWeek] = useState(latest?.week);
  useEffect(() => { if (latest && season == null) { setSeason(latest.season); setWeek(latest.week); } }, [latest, season]);

  const slate = useMemo(() => (season != null && week != null) ? computeWeekSlate(teamIdx, matchups, season, week) : [], [teamIdx, matchups, season, week]);
  const isPlayoffs = slate.length > 0 && slate.some(g => g.playoffTier && g.playoffTier !== "NONE");

  return (
    <>
      <div style={{ background: "linear-gradient(135deg, #b5541f, #8a3a15)", borderRadius:12, padding:"18px 20px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:14 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ fontSize:32 }}>🏈</div>
          <div>
            <div style={{ fontSize:22, fontWeight:800 }}>Head-to-Head</div>
            <div style={{ fontSize:12.5, opacity:0.85 }}>{slate.length} Matchups &middot; {isPlayoffs ? "Playoffs" : "Regular Season"}</div>
          </div>
        </div>
        {season != null && <WeekPicker seasons={seasons} matchups={matchups} season={season} week={week}
          onChange={(s, w) => { setSeason(s); setWeek(w); }} latest={latest} />}
      </div>

      {slate.length === 0 ? (
        <div style={panelStyle()}>No games played that week.</div>
      ) : (
        slate.map((g, i) => <MatchupCard key={i} g={g} />)
      )}
    </>
  );
}

export default function H2HPage() {
  const { teams, matchups, teamIdx, ownerOptions, seasons } = useOutletContext();
  const [mode, setMode] = useState("week");
  const [ownerA, setOwnerA] = useState("");
  const [ownerB, setOwnerB] = useState("");

  useEffect(() => {
    if (ownerOptions.length >= 2 && !ownerA && !ownerB) {
      setOwnerA(ownerOptions[0].guid);
      setOwnerB(ownerOptions[1].guid);
    }
  }, [ownerOptions, ownerA, ownerB]);

  return (
    <>
      <div style={{ display:"flex", justifyContent:"center", gap:8, marginBottom:16 }}>
        {MODES.map(([key, label]) => (
          <button key={key} onClick={()=>setMode(key)}
            style={{
              padding:"8px 18px", borderRadius:8,
              border:"1px solid " + (mode===key ? "#c9a227" : "#33362a"),
              background: mode===key ? "#2a2a18" : "#181910", color: mode===key ? "#f0d97a" : "#c9c6ba",
              fontWeight:700, fontSize:13,
            }}>
            {label}
          </button>
        ))}
      </div>

      {mode === "week" ? (
        <WeekView teamIdx={teamIdx} matchups={matchups} teams={teams} seasons={seasons} />
      ) : (
        <div style={panelStyle()}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
            Head-to-Head
          </div>
          <H2HPanel teamIdx={teamIdx} matchups={matchups} ownerOptions={ownerOptions}
            ownerA={ownerA} ownerB={ownerB} onChangeA={setOwnerA} onChangeB={setOwnerB} />
        </div>
      )}
    </>
  );
}
