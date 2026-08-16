import React, { useState, useEffect, useMemo } from "react";
import { btnStyle, inp } from "../../theme.jsx";

/** Shared season-scoping state — quick pills (All-Time / current season)
 *  plus a Custom popover (single season, or a year range) — used by every
 *  History sub-page that needs to scope its data to a set of seasons
 *  (Season, Stats). Kept as one hook + one component so both pages stay
 *  in sync with the same filter behavior instead of drifting apart. */
export function useSeasonFilter(seasons) {
  const [filterMode, setFilterMode] = useState("all"); // "all" | "single" | "range"
  const [singleYear, setSingleYear] = useState(null);
  const [rangeFrom, setRangeFrom] = useState(null);
  const [rangeTo, setRangeTo] = useState(null);
  const mostRecentSeason = seasons[0];

  useEffect(() => {
    if (seasons.length && singleYear == null) setSingleYear(mostRecentSeason);
    if (seasons.length && rangeFrom == null) setRangeFrom(seasons[seasons.length - 1]);
    if (seasons.length && rangeTo == null) setRangeTo(mostRecentSeason);
  }, [seasons, mostRecentSeason, singleYear, rangeFrom, rangeTo]);

  const activeYears = useMemo(() => {
    if (filterMode === "single" && singleYear != null) return [singleYear];
    if (filterMode === "range" && rangeFrom != null && rangeTo != null) {
      const lo = Math.min(rangeFrom, rangeTo), hi = Math.max(rangeFrom, rangeTo);
      return seasons.filter(s => s >= lo && s <= hi);
    }
    return seasons;
  }, [filterMode, singleYear, rangeFrom, rangeTo, seasons]);

  const scopeLabel = filterMode === "single" ? `${singleYear}`
    : filterMode === "range" ? `${Math.min(rangeFrom, rangeTo)}–${Math.max(rangeFrom, rangeTo)}`
    : "All-Time";

  return {
    filterMode, setFilterMode, singleYear, setSingleYear, rangeFrom, setRangeFrom, rangeTo, setRangeTo,
    mostRecentSeason, activeYears, scopeLabel,
  };
}

export function SeasonFilterBar({ seasons, filter }) {
  const [showCustom, setShowCustom] = useState(false);
  const { filterMode, setFilterMode, singleYear, setSingleYear, rangeFrom, setRangeFrom, rangeTo, setRangeTo, mostRecentSeason } = filter;
  const isCustomActive = filterMode === "range" || (filterMode === "single" && singleYear !== mostRecentSeason);

  return (
    <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:16 }}>
      <div style={{ display:"flex", gap:6 }}>
        <button onClick={()=>{ setFilterMode("all"); setShowCustom(false); }}
          style={filterMode==="all" ? btnStyle("#2a2a18","#c9a227") : btnStyle()}>All-Time</button>
        <button onClick={()=>{ setFilterMode("single"); setSingleYear(mostRecentSeason); setShowCustom(false); }}
          style={(filterMode==="single" && singleYear===mostRecentSeason) ? btnStyle("#2a2a18","#c9a227") : btnStyle()}>
          {mostRecentSeason}
        </button>
        <div style={{ position:"relative" }}>
          <button onClick={()=>setShowCustom(s=>!s)} style={isCustomActive ? btnStyle("#2a2a18","#c9a227") : btnStyle()}>
            Custom {showCustom ? "▲" : "▼"}
          </button>
          {showCustom && (
            <div style={{ position:"absolute", top:"110%", right:0, zIndex:10, background:"#181910",
              border:"1px solid #33362a", borderRadius:10, padding:14, width:230, boxShadow:"0 8px 24px rgba(0,0,0,0.4)" }}>
              <div style={{ fontSize:11, opacity:0.6, marginBottom:6 }}>Single Season</div>
              <select value={singleYear ?? ""} onChange={e=>{ setSingleYear(Number(e.target.value)); setFilterMode("single"); setShowCustom(false); }}
                style={{...inp("100%"), marginBottom:14}}>
                {seasons.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <div style={{ fontSize:11, opacity:0.6, marginBottom:6 }}>Year Range</div>
              <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:10 }}>
                <select value={rangeFrom ?? ""} onChange={e=>setRangeFrom(Number(e.target.value))} style={inp(85)}>
                  {[...seasons].reverse().map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <span style={{opacity:0.5, fontSize:12}}>to</span>
                <select value={rangeTo ?? ""} onChange={e=>setRangeTo(Number(e.target.value))} style={inp(85)}>
                  {[...seasons].reverse().map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button onClick={()=>{ setFilterMode("range"); setShowCustom(false); }} style={{...btnStyle("#20211a","#c9a227"), width:"100%"}}>
                Apply
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
