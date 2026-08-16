import React, { useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { panelStyle, btnStyle } from "../../theme.jsx";
import { computeCareerStats, computeDynastyRankings, computeFranchises, ownerSlug } from "./compute.js";
import TeamAvatar from "./Avatar.jsx";

function medalRow(f) {
  const parts = [];
  for (let i = 0; i < f.championships; i++) parts.push("🏆");
  for (let i = 0; i < f.runnerUps; i++) parts.push("🥈");
  for (let i = 0; i < f.lastPlaceFinishes; i++) parts.push("💩");
  return parts;
}

function TeamCard({ f, dim }) {
  return (
    <Link to={`/league-koi/teams/${ownerSlug(f.ownerGuid)}`} style={{ textDecoration:"none", color:"inherit" }}>
      <div style={{
        ...panelStyle(), marginBottom:0, textAlign:"center", padding:"20px 14px",
        opacity: dim ? 0.6 : 1, transition:"transform .1s, border-color .1s", cursor:"pointer",
      }}>
        <div style={{ display:"flex", justifyContent:"center", marginBottom:10 }}>
          <TeamAvatar name={f.teamName} seed={f.ownerGuid} size={64} imageUrl={f.logo} />
        </div>
        <div style={{ fontWeight:700, fontSize:14.5 }}>{f.teamName}</div>
        <div style={{ fontSize:12, opacity:0.7, marginBottom:8 }}>{f.ownerName}{dim ? " · inactive" : ""}</div>
        <div style={{ fontSize:14, letterSpacing:1, minHeight:18 }}>{medalRow(f).join(" ") || " "}</div>
      </div>
    </Link>
  );
}

export default function TeamsPage() {
  const { teams, seasonRecords } = useOutletContext();
  const [showInactive, setShowInactive] = useState(false);

  const careerStats = useMemo(() => computeCareerStats(teams, seasonRecords), [teams, seasonRecords]);
  const dynastyRankings = useMemo(() => computeDynastyRankings(teams, seasonRecords), [teams, seasonRecords]);
  const franchises = useMemo(() => computeFranchises(teams, careerStats, dynastyRankings), [teams, careerStats, dynastyRankings]);

  const active = franchises.filter(f => f.active).sort((a, b) => b.lastYear - a.lastYear || a.ownerName.localeCompare(b.ownerName));
  const inactive = franchises.filter(f => !f.active).sort((a, b) => b.lastYear - a.lastYear);

  return (
    <>
      <div style={{ ...panelStyle(), display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ fontSize:32 }}>🏈</div>
          <div>
            <div style={{ fontSize:20, fontWeight:800 }}>Teams</div>
            <div style={{ fontSize:12.5, opacity:0.7 }}>{active.length} Active &middot; {franchises.length} All-Time</div>
          </div>
        </div>
        {inactive.length > 0 && (
          <button onClick={()=>setShowInactive(s=>!s)} style={btnStyle()}>
            {showInactive ? "Hide Inactive" : `Show Inactive (${inactive.length})`}
          </button>
        )}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(210px, 1fr))", gap:14, marginBottom:12 }}>
        {active.map(f => <TeamCard key={f.ownerGuid} f={f} />)}
        {showInactive && inactive.map(f => <TeamCard key={f.ownerGuid} f={f} dim />)}
      </div>

      <div style={{ textAlign:"center", fontSize:12, opacity:0.55 }}>
        Click on a team to view their complete history and statistics
      </div>
    </>
  );
}
