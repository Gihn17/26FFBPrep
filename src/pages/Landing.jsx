import React from "react";
import { Link } from "react-router-dom";
import { pageShell, panelStyle } from "../theme.jsx";

const TOOLS = [
  {
    to: "/draft", emoji: "📋", title: "Draft Prep",
    desc: "Player pool, VBD/tiers/auction values, live draft-day board for Koi, Final Fantasy, and Jordan.",
  },
  {
    to: "/gameday", emoji: "📊", title: "Game Day",
    desc: "Live matchup scores for the current week, per league — updates while games are being played.",
  },
  {
    to: "/history", emoji: "📚", title: "League History",
    desc: "Season records, matchup log, head-to-head, and high/low weekly scores — starting with Koi.",
  },
];

export default function Landing() {
  return (
    <div style={pageShell()}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ fontSize:11, letterSpacing:3, color:"#c9a227", fontWeight:700 }}>WILL'S FANTASY FOOTBALL</div>
        <h1 style={{ margin:"2px 0 24px", fontSize:34, fontWeight:800, letterSpacing:0.5 }}>Fantasy HQ</h1>

        <div style={{ display:"flex", flexWrap:"wrap", gap:16 }}>
          {TOOLS.map(t => (
            <Link key={t.to} to={t.to} style={{ textDecoration:"none", color:"inherit", flex:"1 1 260px", minWidth:240 }}>
              <div style={{...panelStyle(), marginBottom:0, height:"100%", transition:"border-color 0.15s", cursor:"pointer"}}
                   onMouseEnter={e=>e.currentTarget.style.borderColor="#c9a227"}
                   onMouseLeave={e=>e.currentTarget.style.borderColor="#2a2c20"}>
                <div style={{ fontSize:28, marginBottom:8 }}>{t.emoji}</div>
                <div style={{ fontSize:16, fontWeight:700, color:"#f0d97a", marginBottom:6 }}>{t.title}</div>
                <div style={{ fontSize:12.5, opacity:0.75, lineHeight:1.5 }}>{t.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
