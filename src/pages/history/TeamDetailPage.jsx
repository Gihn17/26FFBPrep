import React, { useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { panelStyle, btnStyle, td, SortTh } from "../../theme.jsx";
import {
  computeCareerStats, computeDynastyRankings, computeFranchises, computeFranchiseWeeklyStats,
  computeTeamRecords, ownerSlug, teamKey,
} from "./compute.js";
import TeamAvatar from "./Avatar.jsx";
import H2HPanel from "./H2HPanel.jsx";

function StatBox({ label, value }) {
  return (
    <div style={{ flex:"1 1 100px", textAlign:"center", padding:"10px 6px" }}>
      <div style={{ fontSize:24, fontWeight:800 }}>{value}</div>
      <div style={{ fontSize:11.5, opacity:0.65 }}>{label}</div>
    </div>
  );
}

function RecordCard({ title, color, value, sub }) {
  return (
    <div style={{ flex:"1 1 190px", minWidth:170, border:"1px solid #2a2c20", borderRadius:10, overflow:"hidden" }}>
      <div style={{ background:color, padding:"7px 12px", fontSize:12, fontWeight:700, color:"#12130f" }}>{title}</div>
      <div style={{ padding:"12px", background:"#181910", textAlign:"center" }}>
        <div style={{ fontSize:18, fontWeight:800 }}>{value}</div>
        <div style={{ fontSize:11, opacity:0.7, marginTop:3 }}>{sub}</div>
      </div>
    </div>
  );
}

const HELP = { color:"#8a8672", cursor:"help", marginLeft:3, fontSize:10 };

export default function TeamDetailPage() {
  const { slug } = useParams();
  const { teams, matchups, teamIdx, seasonRecords, ownerOptions } = useOutletContext();
  const [yearFilter, setYearFilter] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const [sortKey, setSortKey] = useState("season");
  const [sortDir, setSortDir] = useState("desc");
  const [opponent, setOpponent] = useState("");

  const careerStats = useMemo(() => computeCareerStats(teams, seasonRecords), [teams, seasonRecords]);
  const dynastyRankings = useMemo(() => computeDynastyRankings(teams, seasonRecords), [teams, seasonRecords]);
  const franchises = useMemo(() => computeFranchises(teams, careerStats, dynastyRankings), [teams, careerStats, dynastyRankings]);
  const franchise = franchises.find(f => ownerSlug(f.ownerGuid) === slug);

  const weekly = useMemo(() => computeFranchiseWeeklyStats(matchups), [matchups]);
  const records = useMemo(() => franchise ? computeTeamRecords(teamIdx, matchups, seasonRecords, franchise.ownerGuid) : null, [teamIdx, matchups, seasonRecords, franchise]);

  const ownerTeams = useMemo(() => teams.filter(t => t.owner_guid === franchise?.ownerGuid), [teams, franchise]);

  const seasonRows = useMemo(() => {
    if (!franchise) return [];
    return ownerTeams.map(t => {
      const r = seasonRecords[t.season]?.find(r => r.ownerGuid === franchise.ownerGuid);
      const w = weekly.get(teamKey(t.season, t.espn_team_id));
      return {
        season: t.season,
        wins: r?.wins ?? 0, losses: r?.losses ?? 0, ties: r?.ties ?? 0,
        expW: w?.expW ?? 0, expL: w?.expL ?? 0,
        allPlayW: w?.allPlayW ?? 0, allPlayL: w?.allPlayL ?? 0,
        weeklyHighs: w?.weeklyHighs ?? 0,
        pointsFor: r?.pointsFor ?? 0, pointsAgainst: r?.pointsAgainst ?? 0,
        finalRank: r?.finalRank ?? null,
      };
    });
  }, [ownerTeams, seasonRecords, weekly, franchise]);

  const sortVal = (r, key) => ({
    season: r.season, actual: r.wins, expected: r.expW, overall: r.allPlayW, ww: r.weeklyHighs, pf: r.pointsFor, pa: r.pointsAgainst,
  }[key]);

  const filteredRows = yearFilter === "all" ? seasonRows : seasonRows.filter(r => r.season === Number(yearFilter));
  const sortedRows = [...filteredRows].sort((a, b) => (sortVal(a, sortKey) - sortVal(b, sortKey)) * (sortDir === "asc" ? 1 : -1));
  const visibleRows = yearFilter === "all" && !expanded ? sortedRows.slice(0, 5) : sortedRows;

  const onSort = (key) => {
    if (key === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const allTime = seasonRows.reduce((a, r) => ({
    wins: a.wins + r.wins, losses: a.losses + r.losses, ties: a.ties + r.ties,
    expW: a.expW + r.expW, expL: a.expL + r.expL,
    allPlayW: a.allPlayW + r.allPlayW, allPlayL: a.allPlayL + r.allPlayL,
    weeklyHighs: a.weeklyHighs + r.weeklyHighs, pointsFor: a.pointsFor + r.pointsFor, pointsAgainst: a.pointsAgainst + r.pointsAgainst,
  }), { wins:0, losses:0, ties:0, expW:0, expL:0, allPlayW:0, allPlayL:0, weeklyHighs:0, pointsFor:0, pointsAgainst:0 });

  const playoffApps = useMemo(() => {
    if (!franchise) return 0;
    const seasons = new Set();
    for (const m of matchups) {
      if (m.playoff_tier !== "WINNERS_BRACKET" || m.away_team_id == null) continue;
      const home = teamIdx.get(teamKey(m.season, m.home_team_id));
      const away = teamIdx.get(teamKey(m.season, m.away_team_id));
      if (home?.owner_guid === franchise.ownerGuid || away?.owner_guid === franchise.ownerGuid) seasons.add(m.season);
    }
    return seasons.size;
  }, [matchups, teamIdx, franchise]);

  const badge = useMemo(() => {
    if (!franchise) return null;
    const champYears = Object.keys(seasonRecords).filter(s => seasonRecords[s].some(r => r.ownerGuid === franchise.ownerGuid && r.finalRank === 1)).map(Number);
    if (champYears.length) return { icon:"🏆", year: Math.max(...champYears) };
    const lastYears = Object.keys(seasonRecords).filter(s => {
      const rows = seasonRecords[s]; const maxRank = Math.max(...rows.map(r => r.finalRank || 0));
      return maxRank > 0 && rows.some(r => r.ownerGuid === franchise.ownerGuid && r.finalRank === maxRank);
    }).map(Number);
    return lastYears.length ? { icon:"💩", year: Math.max(...lastYears) } : null;
  }, [seasonRecords, franchise]);

  if (!franchise) {
    return <div style={panelStyle()}>Team not found. <Link to="/league-koi/teams" style={{ color:"#c9a227" }}>Back to Teams</Link></div>;
  }

  const seasons = ownerTeams.map(t => t.season).sort((a, b) => b - a);
  const streakLabel = (s) => s ? (s.range.start.season === s.range.end.season
    ? `${s.range.start.season} · Weeks ${s.range.start.week}→${s.range.end.week}`
    : `${s.range.start.season} Wk${s.range.start.week} → ${s.range.end.season} Wk${s.range.end.week}`) : null;

  return (
    <>
      <Link to="/league-koi/teams" style={{ fontSize:11, color:"#9c998e", textDecoration:"none" }}>&larr; All Teams</Link>

      <div style={{ ...panelStyle(), textAlign:"center", padding:"26px 14px" }}>
        <div style={{ display:"flex", justifyContent:"center", marginBottom:10 }}>
          <TeamAvatar name={franchise.teamName} seed={franchise.ownerGuid} size={80} imageUrl={franchise.logo} />
        </div>
        <div style={{ fontSize:22, fontWeight:800 }}>{franchise.teamName}</div>
        <div style={{ fontSize:13, opacity:0.7 }}>{franchise.ownerName} &middot; est. {franchise.estYear}</div>
        {badge && (
          <div style={{ fontSize:13, marginTop:8 }}>
            {badge.icon} <span style={{ opacity:0.75 }}>{badge.year}</span>
          </div>
        )}
        <div style={{ display:"flex", justifyContent:"center", flexWrap:"wrap", borderTop:"1px solid #2a2c20", marginTop:16, paddingTop:4 }}>
          <StatBox label="Seasons" value={franchise.seasons} />
          <StatBox label="Playoffs" value={playoffApps} />
          <StatBox label="Champs" value={franchise.championships} />
        </div>
      </div>

      <div style={panelStyle()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, flexWrap:"wrap", gap:8 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", textTransform:"uppercase" }}>Season History</div>
          <select value={yearFilter} onChange={e=>{setYearFilter(e.target.value); setExpanded(false);}} style={{...btnStyle(), cursor:"pointer"}}>
            <option value="all">All Years</option>
            {seasons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", fontSize:12.5, whiteSpace:"nowrap" }}>
            <thead>
              <tr style={{ opacity:0.65, textAlign:"left" }}>
                <SortTh label="Year" col="season" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label="Actual" col="actual" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label={<>Expected <span style={HELP} title="A win if your score beat the week's median, a loss if it didn't.">ⓘ</span></>}
                  col="expected" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label={<>Overall <span style={HELP} title="All-play record: how you'd have done playing every other team in the league every week.">ⓘ</span></>}
                  col="overall" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label={<>WW <span style={HELP} title="Weekly Wins: weeks you had the single highest score in the league.">ⓘ</span></>}
                  col="ww" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label="PF" col="pf" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh label="PA" col="pa" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(r => (
                <tr key={r.season}>
                  <td style={{...td("left"), fontWeight:700}}>{r.season}{r.finalRank === 1 ? " 🏆" : ""}</td>
                  <td style={td()}>{r.wins}-{r.losses}{r.ties ? `-${r.ties}` : ""}</td>
                  <td style={{...td(), opacity:0.75, fontStyle:"italic"}}>{r.expW}-{r.expL}</td>
                  <td style={{...td(), opacity:0.75, fontStyle:"italic"}}>{r.allPlayW}-{r.allPlayL}</td>
                  <td style={td()}>{r.weeklyHighs}</td>
                  <td style={td()}>{r.pointsFor.toFixed(1)}</td>
                  <td style={td()}>{r.pointsAgainst.toFixed(1)}</td>
                </tr>
              ))}
              <tr style={{ background:"#1c1e15", fontWeight:700 }}>
                <td style={td("left")}>All-Time</td>
                <td style={td()}>{allTime.wins}-{allTime.losses}{allTime.ties ? `-${allTime.ties}` : ""}</td>
                <td style={{...td(), opacity:0.85, fontStyle:"italic"}}>{allTime.expW}-{allTime.expL}</td>
                <td style={{...td(), opacity:0.85, fontStyle:"italic"}}>{allTime.allPlayW}-{allTime.allPlayL}</td>
                <td style={td()}>{allTime.weeklyHighs}</td>
                <td style={td()}>{allTime.pointsFor.toFixed(1)}</td>
                <td style={td()}>{allTime.pointsAgainst.toFixed(1)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {yearFilter === "all" && seasonRows.length > 5 && (
          <button onClick={()=>setExpanded(e=>!e)} style={{ ...btnStyle(), width:"100%", marginTop:10 }}>
            {expanded ? "Show less" : `Show All ${seasonRows.length} Seasons`}
          </button>
        )}
      </div>

      {records && (
        <div style={panelStyle()}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
            Team Records
          </div>
          <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
            <RecordCard title="🐘 Juggernaut" color="#3f9e5e"
              value={records.juggernaut ? records.juggernaut.score.toFixed(2) : "—"}
              sub={records.juggernaut ? `${records.juggernaut.season} Week ${records.juggernaut.week}` : "No games yet"} />
            <RecordCard title="🪶 Featherweight" color="#c0453f"
              value={records.featherweight ? records.featherweight.score.toFixed(2) : "—"}
              sub={records.featherweight ? `${records.featherweight.season} Week ${records.featherweight.week}` : "No games yet"} />
            <RecordCard title="🎂 Cakewalk" color="#4f8fd1"
              value={records.cakewalk ? `${records.cakewalk.winnerScore.toFixed(1)} - ${records.cakewalk.loserScore.toFixed(1)}` : "—"}
              sub={records.cakewalk ? `${records.cakewalk.season} Wk ${records.cakewalk.week} vs ${records.cakewalk.loserName}` : "No wins yet"} />
            <RecordCard title="🔍 Nailbiter" color="#e0863f"
              value={records.nailbiter ? `${records.nailbiter.winnerScore.toFixed(1)} - ${records.nailbiter.loserScore.toFixed(1)}` : "—"}
              sub={records.nailbiter ? `${records.nailbiter.season} Wk ${records.nailbiter.week} ${records.nailbiter.won ? "vs" : "lost to"} ${records.nailbiter.won ? records.nailbiter.loserName : records.nailbiter.winnerName}` : "No games yet"} />
            <RecordCard title="⚡ Powerhouse" color="#4f8fd1"
              value={records.powerhouse ? records.powerhouse.ppg.toFixed(1) : "—"}
              sub={records.powerhouse ? `ppg — ${records.powerhouse.season}` : "No seasons yet"} />
            <RecordCard title="↘️ Slacker" color="#9c998e"
              value={records.slacker ? records.slacker.ppg.toFixed(1) : "—"}
              sub={records.slacker ? `ppg — ${records.slacker.season}` : "No seasons yet"} />
            <RecordCard title="🔥 Victory Lap" color="#7fd18f"
              value={records.victoryLap ? `${records.victoryLap.len} wins` : "—"}
              sub={records.victoryLap ? streakLabel(records.victoryLap) : "No streak yet"} />
            <RecordCard title="🗑️ Dumpster Fire" color="#e08a8a"
              value={records.dumpsterFire ? `${records.dumpsterFire.len} losses` : "—"}
              sub={records.dumpsterFire ? streakLabel(records.dumpsterFire) : "No streak yet"} />
          </div>
        </div>
      )}

      <div style={panelStyle()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, flexWrap:"wrap", gap:8 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", textTransform:"uppercase" }}>Head-to-Head</div>
        </div>
        <H2HPanel teamIdx={teamIdx} matchups={matchups} ownerOptions={ownerOptions.filter(o => o.guid !== franchise.ownerGuid)}
          ownerA={franchise.ownerGuid} ownerB={opponent} onChangeA={()=>{}} onChangeB={setOpponent} lockA />
      </div>
    </>
  );
}
