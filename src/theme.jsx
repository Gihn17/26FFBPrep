// Shared visual language for every page in this app (draft tool, landing,
// Game Day, League History) — pulled out of App.jsx so new pages look like
// part of the same site instead of reinventing colors/spacing per page.
import React from "react";

export const OUTLOOK_STYLE = {
  green:  { bg:"#1c3a2a", border:"#3f9e5e", label:"Green — go get him" },
  yellow: { bg:"#3a3418", border:"#c9a227", label:"Yellow — proceed with caution" },
  red:    { bg:"#3a1f1f", border:"#c0453f", label:"Red — stay away" },
  pink:   { bg:"#3a1f30", border:"#d162a4", label:"Pink — late flyer" },
  purple: { bg:"#241a3a", border:"#8a63d1", label:"Purple — ignore" },
};
export const POS_COLORS = { QB:"#d162a4", RB:"#3f9e5e", WR:"#4f8fd1", TE:"#c9a227", K:"#9a9a9a", DEF:"#c0453f" };
export const LEAGUE_LABELS = { koi:"Koi", final:"Final Fantasy", jordan:"Jordan" };

export function btnStyle(bg="#20211a", border="#c9a227") {
  return { padding:"8px 14px", borderRadius:8, border:`1px solid ${border}`, background:bg, color:"#e9e6dd", fontSize:13, fontWeight:600 };
}
export function panelStyle() {
  return { background:"#181910", border:"1px solid #2a2c20", borderRadius:10, padding:14, marginBottom:14 };
}
export function lbl() {
  return { display:"flex", flexDirection:"column", gap:4, fontSize:11, opacity:0.75 };
}
export function lblSmall(color) {
  return { fontSize:11, fontWeight:700, color, marginBottom:4, textTransform:"uppercase", letterSpacing:0.5 };
}
export function pText() {
  return { fontSize:12.5, opacity:0.8, lineHeight:1.6, maxWidth:900, marginBottom:14 };
}
export function inp(w) {
  return { width:w, background:"#0f100b", border:"1px solid #33362a", borderRadius:6, color:"#e9e6dd", padding:"6px 8px", fontSize:13 };
}
export function ta() {
  return { width:"100%", background:"#0f100b", border:"1px solid #33362a", borderRadius:6, color:"#e9e6dd", padding:"8px", fontSize:13, resize:"vertical" };
}
export function th(align="center") {
  return { padding:"10px 8px", textAlign:align, borderBottom:"1px solid #2a2c20" };
}
export function td(align="center") {
  return { padding:"7px 8px", textAlign:align, borderBottom:"1px solid #1e2018", fontSize:13 };
}
export function badgeSup() {
  return { marginLeft:4, fontSize:9, fontWeight:800, color:"#7fd1c9", letterSpacing:0.5 };
}
export function SortTh({ label, col, sortKey, sortDir, onSort, align }) {
  const active = sortKey === col;
  return (
    <th style={{ ...th(align), cursor:"pointer", userSelect:"none", color: active ? "#f0d97a" : undefined }}
        onClick={()=>onSort(col)}>
      {label}
      <span style={{ display:"inline-block", width:12, opacity: active ? 1 : 0.25, marginLeft:2 }}>
        {active ? (sortDir === "asc" ? "▲" : "▼") : "▾"}
      </span>
    </th>
  );
}

// Page shell — the outer background/font wrapper every page uses, so
// landing/gameday/history feel like the same site as the draft tool
// without each page re-declaring the same container styles.
export function pageShell() {
  return {
    fontFamily: "'Bahnschrift','Segoe UI',Arial,sans-serif",
    background: "#12130f", color: "#e9e6dd", minHeight: "100vh", padding: "20px",
    backgroundImage: "radial-gradient(circle at 10% 0%, #1a2418 0%, #12130f 55%)",
  };
}
