import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { pageShell, panelStyle, btnStyle, inp, lbl } from "../theme.jsx";
import { useAuth } from "../AuthContext.jsx";

const SLEEPER_API = "https://api.sleeper.app/v1";
const LEAGUE_OPTIONS = [
  { id: "koi", label: "Koi", source: "espn" },
  { id: "final", label: "Final Fantasy", source: "sleeper" },
  { id: "jordan", label: "Jordan", source: "espn" },
];
// ESPN needs a real season/week to have happened to be worth polling often;
// Sleeper's own community guidance is 5-10 min. Different cadences, not
// just a stylistic choice — matches server/espn.js's live-field caveat.
const POLL_MS = { espn: 2 * 60 * 1000, sleeper: 5 * 60 * 1000 };

export default function GameDay() {
  const { user } = useAuth();
  const [league, setLeague] = useState("koi");
  const [leagueConfigs, setLeagueConfigs] = useState({});
  const [matchups, setMatchups] = useState([]);
  const [week, setWeek] = useState(null);
  const [weekInput, setWeekInput] = useState("");
  // Admin-only test affordance — points ESPN fetches at a past, settled
  // season/week (e.g. 2025 week 17) instead of the real current one, since
  // a genuinely live week only exists while games are being played.
  const [yearInput, setYearInput] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    fetch("/api/leagues").then(r => r.json()).then(rows => {
      const m = {}; for (const r of rows) m[r.id] = r;
      setLeagueConfigs(m);
    }).catch(() => {});
  }, []);

  const cfg = leagueConfigs[league];
  const source = LEAGUE_OPTIONS.find(l => l.id === league)?.source;
  const requestedWeek = weekInput.trim() ? Number(weekInput) : null;
  const requestedYear = (user?.role === "admin" && yearInput.trim()) ? Number(yearInput) : null;

  const fetchEspn = useCallback(async () => {
    if (!cfg || cfg.source_platform !== "espn" || !cfg.source_league_id) {
      setError(`${league} has no ESPN league id on file yet`); setStatus("error"); return;
    }
    setStatus("loading");
    try {
      const params = new URLSearchParams();
      if (requestedWeek) params.set("week", requestedWeek);
      if (requestedYear) params.set("year", requestedYear);
      const qs = params.toString();
      const res = await fetch(`/api/gameday/${league}${qs ? `?${qs}` : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMatchups(data.matchups || []);
      setWeek(data.week || null);
      setLastSynced(new Date());
      setStatus("idle"); setError(null);
    } catch (e) {
      setStatus("error"); setError(e.message);
    }
  }, [cfg, league, requestedWeek, requestedYear]);

  const fetchSleeper = useCallback(async () => {
    if (!cfg || !cfg.source_league_id) { setError("Final Fantasy league not configured yet"); setStatus("error"); return; }
    setStatus("loading");
    try {
      const [nflState, rosters, users] = await Promise.all([
        fetch(`${SLEEPER_API}/state/nfl`).then(r => r.json()),
        fetch(`${SLEEPER_API}/league/${cfg.source_league_id}/rosters`).then(r => r.json()),
        fetch(`${SLEEPER_API}/league/${cfg.source_league_id}/users`).then(r => r.json()),
      ]);
      const targetWeek = requestedWeek || nflState.week || 1;
      const matchupData = await fetch(`${SLEEPER_API}/league/${cfg.source_league_id}/matchups/${targetWeek}`).then(r => r.json());
      const userById = new Map((users || []).map(u => [u.user_id, u]));
      const ownerOfRoster = new Map((rosters || []).map(r => [r.roster_id, r.owner_id]));
      const nameForRoster = (rid) => {
        const u = userById.get(ownerOfRoster.get(rid));
        return (u && (u.metadata?.team_name || u.display_name)) || `Roster ${rid}`;
      };
      const byMatchupId = new Map();
      for (const m of matchupData || []) {
        if (!byMatchupId.has(m.matchup_id)) byMatchupId.set(m.matchup_id, []);
        byMatchupId.get(m.matchup_id).push(m);
      }
      const built = [...byMatchupId.values()].map(([a, b]) => ({
        home: a ? { teamName: nameForRoster(a.roster_id), points: a.points || 0 } : null,
        away: b ? { teamName: nameForRoster(b.roster_id), points: b.points || 0 } : null,
      }));
      setMatchups(built);
      setWeek(targetWeek);
      setLastSynced(new Date());
      setStatus("idle"); setError(null);
    } catch (e) {
      setStatus("error"); setError(e.message);
    }
  }, [cfg, requestedWeek]);

  const sync = useCallback(() => (source === "sleeper" ? fetchSleeper() : fetchEspn()), [source, fetchSleeper, fetchEspn]);

  useEffect(() => { setMatchups([]); setWeek(null); setError(null); }, [league]);

  useEffect(() => {
    if (paused || !cfg) return;
    sync();
    const interval = setInterval(sync, POLL_MS[source] || POLL_MS.espn);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, cfg, source, requestedWeek, requestedYear]);

  const statusText = paused ? "Paused"
    : status === "loading" ? "Syncing…"
    : error ? error
    : lastSynced ? `Last synced ${lastSynced.toLocaleTimeString()}` : "Not synced yet";

  return (
    <div style={pageShell()}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <Link to="/" style={{ fontSize:11, color:"#9c998e", textDecoration:"none" }}>&larr; Fantasy HQ</Link>
        <h1 style={{ margin:"2px 0 16px", fontSize:28, fontWeight:800 }}>Game Day</h1>

        <div style={{ ...panelStyle(), display:"flex", gap:16, alignItems:"flex-end", flexWrap:"wrap" }}>
          <label style={lbl()}>League
            <select value={league} onChange={e=>setLeague(e.target.value)} style={inp(160)}>
              {LEAGUE_OPTIONS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </label>
          <label style={lbl()}>Week (blank = current)
            <input type="number" min="1" max="18" value={weekInput} onChange={e=>setWeekInput(e.target.value)}
              placeholder="auto" style={inp(90)} />
          </label>
          {user?.role === "admin" && source === "espn" && (
            <label style={lbl()} title="Testing only — pulls a past, settled season instead of the real current one, since a genuinely live week only exists while games are being played.">
              Year (blank = current, admin test)
              <input type="number" min="2011" max="2100" value={yearInput} onChange={e=>setYearInput(e.target.value)}
                placeholder="auto" style={inp(90)} />
            </label>
          )}
          <button onClick={()=>setPaused(p=>!p)} style={btnStyle(paused ? "#20211a" : "#3a1f1f", paused ? "#c9a227" : "#c0453f")}>
            {paused ? "Resume" : "Pause"}
          </button>
          {!paused && <button onClick={sync} style={btnStyle()}>Sync now</button>}
          <div style={{ fontSize:12, opacity: paused ? 0.5 : 0.75 }}>{statusText}{week ? ` · Week ${week}` : ""}</div>
        </div>

        {source === "espn" && (!cfg || !cfg.source_league_id) && (
          <div style={panelStyle()}>{league} has no ESPN league id on file yet — nothing to sync.</div>
        )}

        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {matchups.map((m, i) => {
            const homeWinning = m.home && m.away && m.home.points >= m.away.points;
            return (
              <div key={i} style={{...panelStyle(), marginBottom:0, display:"flex", justifyContent:"space-between", alignItems:"center", gap:16, flexWrap:"wrap"}}>
                <div style={{ flex:1, fontWeight: homeWinning ? 700 : 400, color: homeWinning ? "#f0d97a" : undefined }}>
                  {m.home ? m.home.teamName : "BYE"}
                </div>
                <div style={{ fontSize:20, fontWeight:800, display:"flex", gap:12 }}>
                  <span style={{ color: homeWinning ? "#7fd18f" : undefined }}>{m.home ? m.home.points.toFixed(1) : "—"}</span>
                  <span style={{ opacity:0.4 }}>–</span>
                  <span style={{ color: !homeWinning && m.away ? "#7fd18f" : undefined }}>{m.away ? m.away.points.toFixed(1) : "—"}</span>
                </div>
                <div style={{ flex:1, textAlign:"right", fontWeight: !homeWinning ? 700 : 400, color: !homeWinning ? "#f0d97a" : undefined }}>
                  {m.away ? m.away.teamName : "BYE"}
                </div>
              </div>
            );
          })}
          {matchups.length === 0 && status !== "loading" && !error && cfg && (
            <div style={panelStyle()}>No matchups yet for this week — nothing scheduled, or the season hasn't started.</div>
          )}
        </div>

        <div style={{ fontSize:11, opacity:0.5, marginTop:16, lineHeight:1.6 }}>
          Final Fantasy scores come from Sleeper directly (public API, no setup needed). Koi/Jordan come through
          this app's ESPN client — live in-game accuracy hasn't been verified yet against an actual live week
          (built during the preseason); if scores look stale, use "Sync now" and check back once games are underway.
        </div>
      </div>
    </div>
  );
}
