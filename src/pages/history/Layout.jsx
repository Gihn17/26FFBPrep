import React, { useState, useEffect, useMemo } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { pageShell, panelStyle, btnStyle } from "../../theme.jsx";
import { buildTeamIndex, computeSeasonRecords, computeOwnerOptions, computeCurrentLogos, applyOwnershipCorrections } from "./compute.js";

const LEAGUE = "koi"; // only league with an ESPN id on file so far — same code path once Jordan/Final have one

const TABS = [
  ["season", "Seasons"],
  ["stats", "Stats"],
  ["h2h", "H2H"],
  ["champs", "Champs"],
  ["teams", "Teams"],
];

/** Loads {teams, matchups} once, derives the shared shapes every sub-page
 *  needs (team index, season records, owner list), and hands it all down
 *  via Outlet context — sub-pages don't each re-fetch or re-derive this. */
export default function HistoryLayout() {
  const [teams, setTeams] = useState([]);
  const [matchups, setMatchups] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const currentUserName = (typeof localStorage !== "undefined" && localStorage.getItem("ffb-user")) || "Will";
  const canEdit = currentUserName === "Will";

  const load = () => {
    fetch(`/api/history/${LEAGUE}`).then(r => r.json()).then(d => {
      setTeams(applyOwnershipCorrections(LEAGUE, d.teams || []));
      setMatchups(d.matchups || []);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  };
  useEffect(load, []);

  const refresh = async () => {
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const res = await fetch(`/api/history/${LEAGUE}/refresh`, { method: "POST" });
      const data = await res.json();
      setRefreshResult(data);
      load();
    } catch (e) {
      setRefreshResult({ error: e.message });
    }
    setRefreshing(false);
  };

  const teamIdx = useMemo(() => buildTeamIndex(teams), [teams]);
  const seasonRecords = useMemo(() => computeSeasonRecords(teams, matchups), [teams, matchups]);
  const seasons = useMemo(() => [...new Set(teams.map(t => t.season))].sort((a, b) => b - a), [teams]); // newest first
  const ownerOptions = useMemo(() => computeOwnerOptions(teams), [teams]);
  // One logo per franchise, always their most current — every page uses
  // this instead of trusting whatever a per-season row happens to carry,
  // so historical views don't show a different (and more likely dead)
  // logo than the team's real current one.
  const currentLogos = useMemo(() => computeCurrentLogos(teams), [teams]);

  const context = { league: LEAGUE, teams, matchups, teamIdx, seasonRecords, seasons, ownerOptions, currentLogos, loaded, canEdit };

  return (
    <div style={pageShell()}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", flexWrap:"wrap", gap:12, marginBottom:16 }}>
          <div>
            <Link to="/" style={{ fontSize:11, color:"#9c998e", textDecoration:"none" }}>&larr; Fantasy HQ</Link>
            <h1 style={{ margin:"2px 0 0", fontSize:28, fontWeight:800 }}>League History — Koi</h1>
          </div>
          {canEdit && (
            <button onClick={refresh} disabled={refreshing} style={btnStyle()}>
              {refreshing ? "Refreshing…" : "Refresh History"}
            </button>
          )}
        </div>

        {refreshResult && (
          <div style={{ ...panelStyle(), fontSize:12.5 }}>
            {refreshResult.error ? (
              <span style={{ color:"#e08a8a" }}>Refresh failed: {refreshResult.error}</span>
            ) : (
              <>
                <span style={{ color:"#7fd18f" }}>Imported: {refreshResult.imported?.join(", ") || "none"}.</span>{" "}
                {refreshResult.skipped?.length > 0 && (
                  <span style={{ opacity:0.7 }}>
                    Skipped — {refreshResult.skipped.map(s => `${s.year} (${s.reason})`).join("; ")}
                  </span>
                )}
              </>
            )}
          </div>
        )}

        <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
          {TABS.map(([slug, label]) => (
            <NavLink key={slug} to={`/league-koi/${slug}`}
              style={({ isActive }) => ({
                padding:"8px 16px", borderRadius:8, textDecoration:"none",
                border:"1px solid " + (isActive ? "#c9a227" : "#33362a"),
                background: isActive ? "#2a2a18" : "#181910", color: isActive ? "#f0d97a" : "#c9c6ba",
                fontWeight:700, fontSize:13,
              })}>
              {label}
            </NavLink>
          ))}
        </div>

        {!loaded ? (
          <div style={panelStyle()}>Loading…</div>
        ) : teams.length === 0 ? (
          <div style={panelStyle()}>
            No history imported yet. {canEdit ? "Hit \"Refresh History\" above to pull it from ESPN." : "Ask Will to run a refresh."}
          </div>
        ) : (
          <Outlet context={context} />
        )}
      </div>
    </div>
  );
}
