import React, { useState, useEffect } from "react";
import { panelStyle, btnStyle } from "./theme.jsx";

const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];

// Historical positional draft-cost trends (Koi, real completed ESPN
// seasons) — "what does the 3rd RB usually cost", for spotting an
// outlier bid live or during prep. Backed by /api/gm/draft-history/*
// (server/draftHistory.js) — same tool the chat assistant's
// get_positional_draft_trends uses, so a question here and a question
// in the chat box give the same answer.
export default function DraftTrendsPanel() {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState("RB");
  const [trends, setTrends] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadSeasons = () => {
    fetch("/api/gm/draft-history/seasons?league=koi")
      .then(r => r.ok ? r.json() : { seasons: [] })
      .then(d => setSeasons(d.seasons || []))
      .catch(() => {});
  };

  const loadTrends = (pos) => {
    setError(null);
    fetch(`/api/gm/draft-history/trends?league=koi&position=${pos}`)
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        setTrends(data);
      })
      .catch(e => { setError(e.message); setTrends(null); });
  };

  useEffect(() => { if (open) { loadSeasons(); loadTrends(position); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) loadTrends(position); }, [position]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    setRefreshing(true);
    fetch("/api/gm/draft-history/refresh", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league: "koi" }),
    })
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        setSeasons(data.seasons || []);
        loadTrends(position);
      })
      .catch(e => setError(e.message))
      .finally(() => setRefreshing(false));
  };

  if (!open) {
    return <button onClick={() => setOpen(true)} style={btnStyle()}>📈 Draft Trends</button>;
  }

  return (
    <div style={{ ...panelStyle(), maxWidth: 620 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>📈 Draft Trends — Koi {seasons.length ? `(${seasons.slice().reverse().join(", ")})` : ""}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={refresh} disabled={refreshing} style={{ ...btnStyle(), fontSize: 11, padding: "3px 8px" }}>
            {refreshing ? "Refreshing…" : "Refresh from ESPN"}
          </button>
          <button onClick={() => setOpen(false)} style={{ ...btnStyle(), fontSize: 11, padding: "3px 8px" }}>Close</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {POSITIONS.map(p => (
          <button key={p} onClick={() => setPosition(p)} style={{
            padding: "4px 10px", borderRadius: 16, fontSize: 11.5, fontWeight: 700,
            border: "1px solid " + (position === p ? "#c9a227" : "#33362a"),
            background: position === p ? "#20211a" : "transparent",
            color: position === p ? "#f0d97a" : "#9c998e",
          }}>{p}</button>
        ))}
      </div>

      {error && <div style={{ fontSize: 12, color: "#e08a8a", marginBottom: 8 }}>{error}</div>}
      {!trends && !error && <div style={{ fontSize: 12, opacity: 0.6 }}>Loading…</div>}
      {trends && !trends.byRank.length && (
        <div style={{ fontSize: 12, opacity: 0.6 }}>No {position} data stored yet — hit Refresh from ESPN.</div>
      )}
      {trends && trends.byRank.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.6, fontSize: 11 }}>
                <th style={{ padding: "4px 8px" }}>Rank</th>
                <th style={{ padding: "4px 8px" }}>Mean</th>
                <th style={{ padding: "4px 8px" }}>Median</th>
                <th style={{ padding: "4px 8px" }}>Range</th>
                <th style={{ padding: "4px 8px" }}>Seasons</th>
                <th style={{ padding: "4px 8px" }}>Example</th>
              </tr>
            </thead>
            <tbody>
              {trends.byRank.map(r => (
                <tr key={r.rank} style={{ borderTop: "1px solid #2a2c20" }}>
                  <td style={{ padding: "4px 8px", fontWeight: 700 }}>{position}{r.rank}</td>
                  <td style={{ padding: "4px 8px" }}>${r.mean}</td>
                  <td style={{ padding: "4px 8px" }}>${r.median}</td>
                  <td style={{ padding: "4px 8px", opacity: 0.75 }}>${r.min}–${r.max}</td>
                  <td style={{ padding: "4px 8px", opacity: 0.6 }}>{r.seasonsWithData}</td>
                  <td style={{ padding: "4px 8px", opacity: 0.6, fontSize: 11 }}>{r.examples[0]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
