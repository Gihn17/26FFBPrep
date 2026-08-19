import React, { useState, useEffect, useMemo } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { pageShell, panelStyle, btnStyle, LEAGUE_LABELS } from "../../theme.jsx";
import { buildTeamIndex, computeSeasonRecords, computeOwnerOptions, computeCurrentLogos, applyOwnershipCorrections, applyDisplayNames } from "./compute.js";
import { useAuth } from "../../AuthContext.jsx";

// Pure navigation list now — NOT a permission list. Permission for League
// History is per-LEAGUE (server/db.js's HISTORY_LEAGUES, checked once via
// RequireAuth's historyLeague prop on this whole route in main.jsx), so
// every visitor who reaches this layout at all sees every one of these.
// Keep in sync with db.js's TABS-shaped nav comment above VALID_TABS —
// same manual-sync convention already used for App.jsx's ALL_TABS.
export const TABS = [
  ["season", "Seasons"],
  ["stats", "Stats"],
  ["h2h", "H2H"],
  ["champs", "Champs"],
  ["teams", "Teams"],
];

// Home is Koi-only, Will's call — admin-curated video/chat content, not a
// feature every league gets automatically just by having History (see
// main.jsx's HistoryIndexRedirect/HomeRoute, which enforce the same rule
// at the routing level, not just by hiding this nav entry). Kept as its
// own constant rather than folded into TABS since it's conditionally
// prepended below, not universal.
const HOME_TAB = ["home", "Home"];

/** Loads {teams, matchups} once, derives the shared shapes every sub-page
 *  needs (team index, season records, owner list), and hands it all down
 *  via Outlet context — sub-pages don't each re-fetch or re-derive this. */
export default function HistoryLayout() {
  const { leagueSlug: LEAGUE } = useParams();
  const [teams, setTeams] = useState([]);
  const [matchups, setMatchups] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const { user } = useAuth();
  const canEdit = user?.role === "admin"; // strict — not "standard", Home stays admin-only while it's unfinished
  // Reaching this component at all already means the league is granted
  // (RequireAuth checked it before rendering HistoryLayout) — every nav
  // tab is visible, no further per-tab filtering.
  const visibleTabs = TABS;

  const load = () => {
    fetch(`/api/history/${LEAGUE}`).then(r => r.json()).then(d => {
      setTeams(applyDisplayNames(LEAGUE, applyOwnershipCorrections(LEAGUE, d.teams || [])));
      setMatchups(d.matchups || []);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  };
  useEffect(load, [LEAGUE]);

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
            <h1 style={{ margin:"2px 0 0", fontSize:28, fontWeight:800 }}>League History — {LEAGUE_LABELS[LEAGUE] || LEAGUE}</h1>
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
          {(LEAGUE === "koi" ? [HOME_TAB, ...visibleTabs] : visibleTabs).map(([slug, label]) => (
            <NavLink key={slug} to={`/league/${LEAGUE}/${slug}`}
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
            No history imported yet. {canEdit ? "Hit \"Refresh History\" above to pull it in." : "Ask Will to run a refresh."}
          </div>
        ) : (
          <Outlet context={context} />
        )}
      </div>
    </div>
  );
}
