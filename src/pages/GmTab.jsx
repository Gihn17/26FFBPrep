import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { pageShell, panelStyle, btnStyle, inp, ta, lbl } from "../theme.jsx";
import ChatPanel from "../ChatPanel.jsx";

// GM Tab — in-season state for the fantasy-gm agent system
// (/home/gihn/fantasy-gm). Will-only, gated at the route (main.jsx's
// <RequireAuth role="admin">) and again at the Landing.jsx tile level
// (deliberately NOT the normal canSee/TOOLS pattern — see Landing.jsx's
// comment on why "standard" role would otherwise see this by default).
//
// Reads/writes the same /api/gm/* routes fantasy-gm's agents call via
// scripts/gm_api_client.py — this page and the agents share one source
// of truth, no separate flat-file copy.
const LEAGUE = "koi"; // v1 scope — see the plan file
const SEASON = new Date().getFullYear();

function useGmData(path, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const reload = useCallback(() => {
    fetch(path)
      .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
      .then(setData)
      .catch(e => setError(e.message));
  }, [path]);
  useEffect(reload, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return [data, error, reload];
}

function KeeperNotesPanel({ playersById }) {
  const [notes, error, reload] = useGmData(`/api/gm/keeper-notes?league=${LEAGUE}&season=${SEASON}`);
  const [form, setForm] = useState({ playerId: "", leaning: "undecided", rationale: "", yearsKept: "", originalDraftPrice: "" });

  const save = () => {
    if (!form.playerId) return;
    fetch(`/api/gm/keeper-notes/${form.playerId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        league: LEAGUE, season: SEASON, leaning: form.leaning, rationale: form.rationale,
        yearsKept: form.yearsKept === "" ? null : Number(form.yearsKept),
        originalDraftPrice: form.originalDraftPrice === "" ? null : Number(form.originalDraftPrice),
      }),
    }).then(reload);
    setForm({ playerId: "", leaning: "undecided", rationale: "", yearsKept: "", originalDraftPrice: "" });
  };

  const remove = (playerId) => {
    fetch(`/api/gm/keeper-notes/${playerId}?league=${LEAGUE}&season=${SEASON}`, { method: "DELETE" }).then(reload);
  };

  return (
    <div style={panelStyle()}>
      <div style={{ fontWeight:700, marginBottom:10 }}>Keeper Notes — {LEAGUE} {SEASON}</div>
      {error && <div style={{ color:"#c0453f", fontSize:12 }}>{error}</div>}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12, alignItems:"flex-end" }}>
        <label style={lbl()}>Player ID (fp_pool)
          <input style={inp(110)} value={form.playerId} onChange={e=>setForm(f=>({...f, playerId:e.target.value}))} placeholder="e.g. 22955" />
        </label>
        <label style={lbl()}>Leaning
          <select style={inp(120)} value={form.leaning} onChange={e=>setForm(f=>({...f, leaning:e.target.value}))}>
            <option value="undecided">Undecided</option>
            <option value="keep">Keep</option>
            <option value="cut">Cut</option>
          </select>
        </label>
        <label style={lbl()}>Years kept
          <input style={inp(70)} value={form.yearsKept} onChange={e=>setForm(f=>({...f, yearsKept:e.target.value}))} />
        </label>
        <label style={lbl()}>Original draft $
          <input style={inp(90)} value={form.originalDraftPrice} onChange={e=>setForm(f=>({...f, originalDraftPrice:e.target.value}))} />
        </label>
        <label style={{...lbl(), flex:1, minWidth:200}}>Rationale
          <textarea style={ta()} value={form.rationale} onChange={e=>setForm(f=>({...f, rationale:e.target.value}))} />
        </label>
        <button onClick={save} style={btnStyle()}>Save note</button>
      </div>
      {(notes || []).length === 0 && <div style={{ fontSize:12, opacity:0.6 }}>No keeper notes yet.</div>}
      {(notes || []).map(n => (
        <div key={n.id} style={{ display:"flex", justifyContent:"space-between", gap:10, padding:"6px 0", borderTop:"1px solid #2a2c20", fontSize:12.5 }}>
          <div>
            <b>{playersById[n.player_id]?.name || `#${n.player_id}`}</b>
            {playersById[n.player_id] && <span style={{ opacity:0.6 }}> ({playersById[n.player_id].position})</span>}
            {" — "}<span style={{ textTransform:"capitalize" }}>{n.leaning || "undecided"}</span>
            {n.years_kept != null && <span style={{ opacity:0.6 }}> · {n.years_kept}yr kept</span>}
            {n.original_draft_price != null && <span style={{ opacity:0.6 }}> · orig ${n.original_draft_price}</span>}
            {n.rationale && <div style={{ opacity:0.75, marginTop:2 }}>{n.rationale}</div>}
          </div>
          <button onClick={()=>remove(n.player_id)} style={{...btnStyle("#3a1f1f","#c0453f"), fontSize:11, padding:"4px 8px", alignSelf:"flex-start"}}>Remove</button>
        </div>
      ))}
    </div>
  );
}

function TradeProposalsPanel({ playersById }) {
  const [proposals, error, reload] = useGmData(`/api/gm/trade-proposals?league=${LEAGUE}`);

  const setStatus = (id, status) => {
    fetch(`/api/gm/trade-proposals/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).then(reload);
  };

  const names = (ids) => (JSON.parse(ids || "[]")).map(id => playersById[id]?.name || `#${id}`).join(", ") || "—";

  return (
    <div style={panelStyle()}>
      <div style={{ fontWeight:700, marginBottom:10 }}>Trade Proposals — {LEAGUE}</div>
      {error && <div style={{ color:"#c0453f", fontSize:12 }}>{error}</div>}
      {(proposals || []).length === 0 && <div style={{ fontSize:12, opacity:0.6 }}>None yet — created by the Trade Negotiator agent, or manually via the API.</div>}
      {(proposals || []).map(p => (
        <div key={p.id} style={{ padding:"8px 0", borderTop:"1px solid #2a2c20", fontSize:12.5 }}>
          <div><b>vs {p.counterparty || "?"}</b> — <span style={{ textTransform:"capitalize" }}>{p.status}</span></div>
          <div style={{ opacity:0.8 }}>Give: {names(p.give_player_ids)}</div>
          <div style={{ opacity:0.8 }}>Get: {names(p.get_player_ids)}</div>
          {p.analysis && <div style={{ opacity:0.75, marginTop:2 }}>{p.analysis}</div>}
          <div style={{ display:"flex", gap:6, marginTop:6 }}>
            {["draft","sent","countered","accepted","rejected"].map(s => (
              <button key={s} onClick={()=>setStatus(p.id, s)}
                style={{...btnStyle(s===p.status?"#2a2c20":"#181910"), fontSize:11, padding:"3px 8px"}}>{s}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TransactionsPanel({ playersById }) {
  const [txns, error] = useGmData(`/api/gm/transactions?league=${LEAGUE}`);
  return (
    <div style={panelStyle()}>
      <div style={{ fontWeight:700, marginBottom:10 }}>Transaction Log — {LEAGUE}</div>
      {error && <div style={{ color:"#c0453f", fontSize:12 }}>{error}</div>}
      {(txns || []).length === 0 && <div style={{ fontSize:12, opacity:0.6 }}>Nothing yet — populated by Transaction Manager's recommendations.</div>}
      {(txns || []).map(t => (
        <div key={t.id} style={{ padding:"6px 0", borderTop:"1px solid #2a2c20", fontSize:12.5 }}>
          <span style={{ opacity:0.6 }}>{t.created_at}</span>{" — "}
          <b>{t.event_type}</b>
          {t.player_id && <span> ({playersById[t.player_id]?.name || `#${t.player_id}`})</span>}
          {t.status && <span style={{ opacity:0.6 }}> · {t.status}</span>}
          {t.detail && <div style={{ opacity:0.8 }}>{t.detail}</div>}
        </div>
      ))}
    </div>
  );
}

function WaiverWirePanel() {
  const [wire, error, reload] = useGmData(`/api/gm/waiver-wire?league=${LEAGUE}`);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = () => {
    setRefreshing(true);
    fetch("/api/gm/waiver-wire/refresh", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league: LEAGUE, limit: 30 }),
    }).then(reload).finally(() => setRefreshing(false));
  };

  return (
    <div style={panelStyle()}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div style={{ fontWeight:700 }}>Waiver Wire — {LEAGUE}</div>
        <button onClick={refresh} disabled={refreshing} style={btnStyle()}>{refreshing ? "Refreshing…" : "Refresh from ESPN"}</button>
      </div>
      {error && <div style={{ color:"#c0453f", fontSize:12 }}>{error}</div>}
      {(wire || []).length === 0 && <div style={{ fontSize:12, opacity:0.6 }}>Empty — hit refresh to pull live free agents from ESPN.</div>}
      {(wire || []).map(w => (
        <div key={w.id} style={{ padding:"4px 0", borderTop:"1px solid #2a2c20", fontSize:12.5 }}>
          {w.name} <span style={{ opacity:0.6 }}>({w.position}{w.team ? `, ${w.team}` : ""})</span>
          {w.note && <span style={{ opacity:0.75 }}> — {w.note}</span>}
        </div>
      ))}
    </div>
  );
}

function RosterPanel() {
  const [roster, error] = useGmData(`/api/gm/roster?league=${LEAGUE}`);
  return (
    <div style={panelStyle()}>
      <div style={{ fontWeight:700, marginBottom:10 }}>Current Roster — {LEAGUE} (live from ESPN)</div>
      {error && <div style={{ color:"#c0453f", fontSize:12 }}>{error}</div>}
      {(roster || []).map(p => (
        <div key={p.espnPlayerId} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderTop:"1px solid #2a2c20", fontSize:12.5 }}>
          <span>{p.name} <span style={{ opacity:0.6 }}>({p.position})</span></span>
          <span style={{ opacity:0.6 }}>{p.acquisitionType}{p.injuryStatus && p.injuryStatus !== "NORMAL" ? ` · ${p.injuryStatus}` : ""}</span>
        </div>
      ))}
      {(roster || []).length === 0 && !error && <div style={{ fontSize:12, opacity:0.6 }}>Loading…</div>}
    </div>
  );
}

export default function GmTab() {
  const [playersById, setPlayersById] = useState({});

  useEffect(() => {
    fetch("/api/players")
      .then(res => res.ok ? res.json() : [])
      .then(rows => {
        const byId = {};
        for (const p of rows) byId[p.id] = p;
        setPlayersById(byId);
      })
      .catch(() => {});
  }, []);

  return (
    <div style={pageShell()}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div>
            <div style={{ fontSize:11, letterSpacing:3, color:"#c9a227", fontWeight:700 }}>Bowen FFB</div>
            <h1 style={{ margin:"2px 0", fontSize:28, fontWeight:800 }}>GM Tab</h1>
            <div style={{ fontSize:12, opacity:0.6 }}>
              In-season management — shared with the fantasy-gm agent system. Koi only, v1.
            </div>
          </div>
          <Link to="/" style={{ ...btnStyle(), textDecoration:"none" }}>← Home</Link>
        </div>
        <div style={{ marginBottom: 14 }}><ChatPanel /></div>
        <RosterPanel />
        <KeeperNotesPanel playersById={playersById} />
        <TradeProposalsPanel playersById={playersById} />
        <TransactionsPanel playersById={playersById} />
        <WaiverWirePanel />
      </div>
    </div>
  );
}
