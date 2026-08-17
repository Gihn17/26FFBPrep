import React from "react";
import { Link } from "react-router-dom";
import { pageShell, panelStyle, btnStyle } from "../theme.jsx";
import { useAuth } from "../AuthContext.jsx";

const TOOLS = [
  {
    to: "/draft", emoji: "📋", title: "Draft Prep", area: "draft",
    desc: "Player pool, VBD/tiers/auction values, live draft-day board for Koi, Final Fantasy, and Jordan.",
  },
  {
    to: "/gameday", emoji: "📊", title: "Game Day", area: "gameday",
    desc: "Live matchup scores for the current week, per league — updates while games are being played.",
    note: "🚧 Under construction — still being refined.",
  },
];

// One button per league's own League History — a separate row below the
// main tools, on purpose, so adding Jordan/Final Fantasy later is just
// another entry here rather than reshaping a single generic tile.
const LEAGUE_HISTORIES = [
  {
    to: "/league-koi/season", emoji: "📚", title: "League History - Koi", area: "history",
    desc: "Season records, matchup log, head-to-head, and high/low weekly scores.",
  },
];

function ToolCard({ t }) {
  return (
    <div style={{ flex:"1 1 260px", minWidth:240 }}>
      <Link to={t.to} style={{ textDecoration:"none", color:"inherit" }}>
        <div style={{...panelStyle(), marginBottom:0, height:"100%", transition:"border-color 0.15s", cursor:"pointer"}}
             onMouseEnter={e=>e.currentTarget.style.borderColor="#c9a227"}
             onMouseLeave={e=>e.currentTarget.style.borderColor="#2a2c20"}>
          <div style={{ fontSize:28, marginBottom:8 }}>{t.emoji}</div>
          <div style={{ fontSize:16, fontWeight:700, color:"#f0d97a", marginBottom:6 }}>{t.title}</div>
          <div style={{ fontSize:12.5, opacity:0.75, lineHeight:1.5 }}>{t.desc}</div>
        </div>
      </Link>
      {t.note && <div style={{ fontSize:11.5, opacity:0.6, marginTop:6, paddingLeft:2 }}>{t.note}</div>}
    </div>
  );
}

export default function Landing() {
  const { user, logout } = useAuth();
  const canSee = (t) => user?.role === "admin" || user?.role === "standard" || user?.permissions.includes(t.area);
  const visibleTools = TOOLS.filter(canSee);
  const visibleHistories = LEAGUE_HISTORIES.filter(canSee);

  return (
    <div style={pageShell()}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
          <div>
            <div style={{ fontSize:11, letterSpacing:3, color:"#c9a227", fontWeight:700 }}>Bowen FFB</div>
            <h1 style={{ margin:"2px 0 24px", fontSize:34, fontWeight:800, letterSpacing:0.5 }}>Fantasy HQ</h1>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {user?.role === "admin" && (
              <Link to="/admin" title="Admin" style={{ ...btnStyle(), textDecoration:"none", fontSize:16, padding:"6px 10px" }}>⚙️</Link>
            )}
            <button onClick={logout} style={btnStyle()}>Log out</button>
          </div>
        </div>

        {visibleTools.length > 0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:16, marginBottom: visibleHistories.length ? 28 : 0 }}>
            {visibleTools.map(t => <ToolCard key={t.to} t={t} />)}
          </div>
        )}

        {visibleHistories.length > 0 && (
          <>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
              League History
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:16 }}>
              {visibleHistories.map(t => <ToolCard key={t.to} t={t} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
