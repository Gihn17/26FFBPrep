import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import {
  OUTLOOK_STYLE, POS_COLORS, LEAGUE_LABELS, btnStyle, panelStyle, lbl, lblSmall,
  pText, inp, ta, th, td, SortTh, badgeSup,
} from "./theme.jsx";

/* ============================================================
   DEFAULT ADJUSTABLE PARAMETERS
   Everything below drives the projections/VBD/tiers/auction math
   and is editable live from the "Calculations" tab.
   ============================================================ */
const DEFAULT_WEIGHTS = {
  koi:   { passYdsPerPt:25, passTD:4, intPenalty:2, rushYdsPerPt:10, rushTD:6, rec:0.5, recYdsPerPt:10, recTD:6, fumblePenalty:2 },
  final: { passYdsPerPt:25, passTD:6, intPenalty:4, rushYdsPerPt:10, rushTD:6, rec:1,   recYdsPerPt:10, recTD:6, fumblePenalty:2 },
  jordan:{ passYdsPerPt:25, passTD:6, intPenalty:4, rushYdsPerPt:10, rushTD:6, rec:1,   recYdsPerPt:10, recTD:6, fumblePenalty:2 },
};
// Fallback only — used before /api/leagues resolves (or if it fails).
// The real source of truth is server/leagues.js; keep these in sync with
// it so the fallback doesn't lie in the meantime.
const DEFAULT_REPLACEMENT = {
  koi:   { QB:15, RB:60, WR:66, TE:15, K:12, DEF:12 },
  final: { QB:15, RB:47, WR:55, TE:15, K:12, DEF:12 },
  jordan:{ QB:13, RB:47, WR:49, TE:13, K:10, DEF:10 },
};
const DEFAULT_TEAMS = { koi:12, final:12, jordan:10 };
const DEFAULT_ROSTER_SPOTS = { koi:15, final:15, jordan:16 };

/** /api/leagues rows use lowercase stat keys (qb/rb/wr/te/k/def, matching
 *  the db schema); App.jsx's replacement state uses uppercase (QB/RB/...). */
function replacementFromRow(row) {
  if (!row || !row.replacement) return null;
  const r = row.replacement;
  return { QB:r.qb, RB:r.rb, WR:r.wr, TE:r.te, K:r.k, DEF:r.def };
}
/** Per-league teams/rosterSpots/replacement, preferring the fetched
 *  /api/leagues config and falling back to the DEFAULT_* constants above
 *  for any league not yet loaded (or if the fetch failed). */
function baseLeagueParams(configs) {
  const teams = {}, rosterSpots = {}, replacement = {};
  for (const id of ["koi", "final", "jordan"]) {
    const row = configs[id];
    teams[id] = row?.teams ?? DEFAULT_TEAMS[id];
    rosterSpots[id] = row?.roster_spots ?? DEFAULT_ROSTER_SPOTS[id];
    replacement[id] = replacementFromRow(row) || DEFAULT_REPLACEMENT[id];
  }
  return { teams, rosterSpots, replacement };
}
const DEFAULT_TIER_PARAMS = { minGap:4, pctGap:0.14 };

/* ============================================================
   SCORING ENGINE — one formula, weights swapped per league
   ============================================================ */
function scorePoints(s, w) {
  // Every field defaults to 0 — an imported stat line only has the columns
  // its CSV actually contained (a QB export has no receiving columns, an
  // RB/WR export usually has no passing columns), so missing fields are
  // normal, not an error. Without these defaults, one undefined field
  // (undefined * weight = NaN) poisons the entire sum.
  return ((s.passYds||0) / w.passYdsPerPt) + ((s.passTD||0) * w.passTD) - ((s.INT||0) * w.intPenalty)
       + ((s.rushYds||0) / w.rushYdsPerPt) + ((s.rushTD||0) * w.rushTD)
       + ((s.rec||0) * w.rec) + ((s.recYds||0) / w.recYdsPerPt) + ((s.recTD||0) * w.recTD)
       - ((s.fumbles||0) * (w.fumblePenalty||0));
}

const NOTES = {
  "Josh Allen":["Complete QB1 package — elite arm plus 7-8 rushing TDs a year, the safest QB in the format.","","green"],
  "Joe Burrow":["Full seasons of Burrow have produced top-3 QB numbers with Chase/Higgins both healthy.","","green"],
  "Lamar Jackson":["Rushing floor alone makes him a locked-in top-3 QB most weeks.","","green"],
  "Dak Prescott":["Big arm, full weapons, should post QB1-tier counting stats again.","","yellow"],
  "Drake Maye":["Year 2 leap candidate with a legitimate rushing floor added to a live arm.","","yellow"],
  "Patrick Mahomes":["Still the standard for offensive execution when the pieces are healthy.","","green"],
  "Justin Herbert":["Elite arm talent finally has a real backfield/offense around him.","","green"],
  "Trevor Lawrence":["Full arsenal returns and he's shown flashes of true QB1 ceiling.","","yellow"],
  "Jayden Daniels":["Dual-threat production this explosive is basically a QB1 floor by itself.","","green"],
  "Jared Goff":["Efficient, high-volume passer in one of the league's best offenses.","","yellow"],
  "Jalen Hurts":["Best rushing TD floor at the position when the tush push stays live.","","green"],
  "Brock Purdy":["Full receiving corps and a great offensive infrastructure around him.","","yellow"],
  "Matthew Stafford":["Big arm still humming in a great offensive environment.","","yellow"],
  "Caleb Williams":["Year 2 with a real weapon upgrade and more rushing usage expected.","","yellow"],
  "Bo Nix":["Comfortable in Payton's system with real weapons finally around him.","","yellow"],
  "Jaxson Dart":["Rushing equity plus a full season as the starter gives real weekly floor.","","pink"],
  "Baker Mayfield":["Should again push for a top-10 passing-volume season in Tampa's offense.","","yellow"],
  "Jordan Love":["Full complement of weapons and a proven vertical arm.","","yellow"],
  "Sam Darnold":["Comfortable, low-mistake game manager in a talented Seattle offense.","","yellow"],
  "C.J. Stroud":["Talented enough to bounce back hard if the line holds up.","","yellow"],
  "Kyler Murray":["Rushing equity alone keeps the streaming floor respectable.","","yellow"],
  "Daniel Jones":["Rushing floor gives him streamer appeal in the right matchups.","","red"],
  "Bryce Young":["Better weapons and continuity finally give him a real shot.","","red"],

  "Jahmyr Gibbs":["Explosive, three-down workhorse now that Montgomery's been traded to Houston — no committee left to cap him.","","green"],
  "Bijan Robinson":["Full workhorse role now with receiving work added — elite floor and ceiling.","","green"],
  "Christian McCaffrey":["When healthy, still the most complete back in football with receiving work galore.","","yellow"],
  "Jonathan Taylor":["Bell-cow volume in a run-funnel offense — huge floor.","","green"],
  "De'Von Achane":["Home-run speed with real receiving work now — league-winner upside.","","green"],
  "Derrick Henry":["Still bulldozing at an ageless rate with a great offensive line.","","yellow"],
  "James Cook III":["Every-down role and goal-line usage in an explosive Buffalo offense.","","green"],
  "Ashton Jeanty":["Talented rookie workhorse, immediately the clear lead back in Vegas.","","yellow"],
  "Saquon Barkley":["Elite offensive line and a dominant offense make him a locked-in RB1.","","green"],
  "Omarion Hampton":["Explosive rookie who profiles as an immediate three-down back.","","yellow"],
  "Kenneth Walker III":["New offense/weapons around him should boost his efficiency further.","","yellow"],
  "Chase Brown":["Proven three-down producer now firmly entrenched as the lead back.","","green"],
  "Josh Jacobs":["Bell-cow workload in a good offensive situation again.","","yellow"],
  "Jeremiyah Love":["Explosive rookie talent that could take over the backfield fast.","","pink"],
  "Breece Hall":["Talent for a true three-down role if the Jets commit to him.","","yellow"],
  "Kyren Williams":["Proven, goal-line-friendly early-down producer in a good offense.","","yellow"],
  "Javonte Williams":["Fresh start with real early-down volume upside.","","yellow"],
  "Cam Skattebo":["Physical, three-down rookie profile that the Giants lean on early.","","pink"],
  "Travis Etienne Jr.":["Every-down role in an offense that should improve.","","yellow"],
  "D'Andre Swift":["Comfortable, receiving-friendly role in a decent offense.","","yellow"],
  "Bucky Irving":["Explosive, PPR-friendly role as a clear early-down/passing-down hybrid.","","green"],
  "Quinshon Judkins":["Powerful early-down rookie with real touchdown equity.","","yellow"],
  "David Montgomery":["Traded to Houston and projected as the presumptive lead back, with Mixon expected to be released.","","yellow"],
  "Bhayshul Tuten":["Explosive rookie speed threat who could quickly force touches.","","pink"],
  "TreVeyon Henderson":["Talented pass-catching complement in an ascending Pats offense.","","yellow"],
  "Jaylen Warren":["Proven, well-rounded back who produces whenever given volume.","","yellow"],
  "Alvin Kamara":["Still an every-down, target-monster floor whenever healthy.","","yellow"],
  "Tank Bigsby":["Change-of-pace back who could see a real bump in touches.","","red"],

  "Puka Nacua":["Elite target share in a pass-funnel offense — true WR1 upside.","","green"],
  "Ja'Marr Chase":["Best receiver in football when healthy, full target monopoly.","","green"],
  "Jaxon Smith-Njigba":["Emerged as a true alpha WR1 with a massive target share.","","green"],
  "Amon-Ra St. Brown":["Elite, high-floor target hog in an explosive offense.","","green"],
  "Drake London":["Full-time WR1 role with a big catch radius and target volume.","","green"],
  "CeeDee Lamb":["Bounce-back candidate as the clear top target in Dallas.","","green"],
  "Justin Jefferson":["Simply an elite, matchup-proof alpha receiver every week.","","green"],
  "A.J. Brown":["Elite talent, but reunited with familiar concerns about target share.","","yellow"],
  "George Pickens":["Big-play, high-catch-radius WR1 role in a new offense.","","yellow"],
  "Chris Olave":["Proven, high-target WR1 whenever the QB play is stable.","","yellow"],
  "Tee Higgins":["Elite big-play threat opposite Chase, huge TD equity.","","yellow"],
  "Nico Collins":["True alpha WR1 in a pass-heavy, explosive offense.","","green"],
  "Zay Flowers":["Emerging as the clear go-to target in Baltimore's passing game.","","yellow"],
  "Rashee Rice":["True target hog whenever available in a Mahomes-led offense.","","yellow"],
  "Garrett Wilson":["Full target monopoly regardless of QB play.","","yellow"],
  "DeVonta Smith":["Reliable, high-floor route runner in an explosive offense.","","yellow"],
  "Malik Nabers":["Elite target volume even in a rough offensive situation.","","green"],
  "Mike Evans":["Still a touchdown machine whenever on the field.","","yellow"],
  "DK Metcalf":["Fresh start with a real chance to reclaim true WR1 volume.","","yellow"],
  "Marvin Harrison Jr.":["Elite talent poised for a big Year 2 target-share jump.","","yellow"],

  "George Kittle":["Elite, matchup-proof TE1 whenever healthy and featured.","","green"],
  "David Njoku":["Proven high-volume producer now in a fresh situation.","","yellow"],
  "Brock Bowers":["Elite target hog at the position — locked-in TE1 with WR-level volume.","","green"],
  "Travis Kelce":["Still productive when the offense funnels through him.","","yellow"],
  "T.J. Hockenson":["Full recovery and a featured role make him a high-end TE1 bet.","","yellow"],
  "Sam LaPorta":["Proven, high-volume producer in the league's best offense.","","green"],
  "Brock Bowers2":[],
};

function noteFor(pos, name, rank) {
  if (NOTES[name] && NOTES[name].length === 3) return NOTES[name];
  const genericPos = {
    QB:"Late-round streamer/backup with situational spot-start appeal.",
    RB:"Depth back who's one injury away from relevance — cheap stash.",
    WR:"Bench/depth receiver — role hinges on camp battles and target competition.",
    TE:"Streaming-tier TE, matchup and target-share dependent week to week.",
    K:"Kicker — draft last, stream if needed. Job security is the only real variable.",
    DEF:"Matchup-dependent streaming defense; schedule matters more than talent.",
  }[pos];
  const genericNeg = ""; // Personal Notes — starts blank for everyone, filled in per-user on the board
  const color = rank <= 8 ? "yellow" : "red";
  return [genericPos, genericNeg, color];
}

/* ============================================================
   BUILD PLAYER POOL — from the live ADP pool (GET /api/players,
   see server/adp.js), not a hardcoded list. No synthetic stats
   either way: every player starts blank (stats/flatPts null) until
   a real projection is imported via the CSV import panel; see
   computeLeagueFields below for how that blank is carried through
   points/VBD/tier/auction.

   Player id comes straight from the server (Fantasy Football
   Calculator's own player_id) — stable across daily ADP refreshes,
   unlike an id assigned by array position, which would silently
   repoint every stored draft pick/note/import at a different player
   the moment rank order shifted.
   ============================================================ */
function buildPool(adpPool) {
  const players = [];
  for (const p of adpPool) {
    const [pos1, neg1, outlook1] = noteFor(p.position, p.name, p.adp_rank);
    players.push({
      id: p.id, pos: p.position, name: p.name, team: p.team, bye: p.bye, adpRank: p.adp_rank,
      stats: null, flatPts: null,
      note: { pos: pos1, neg: neg1, outlook: outlook1 },
    });
  }
  return players;
}

function computeLeagueFields(players, weights, rep, overrides) {
  const byPos = {};
  for (const p of players) (byPos[p.pos] = byPos[p.pos] || []).push(p);
  const ptsById = {};
  const importedById = {};
  for (const p of players) {
    const ov = overrides && overrides[p.id];
    if (ov && ov.points != null) {
      ptsById[p.id] = ov.points;
      importedById[p.id] = true;
    } else if (p.pos === "K" || p.pos === "DEF") {
      // No synthetic flat-points curve anymore — blank until a points column is imported.
      ptsById[p.id] = p.flatPts != null ? p.flatPts : null;
      importedById[p.id] = false;
    } else if (p.stats) {
      // Only reachable via an imported raw-stat line (statsOverride) — there's no
      // synthetic stat generator to fall back to anymore.
      ptsById[p.id] = Math.round(scorePoints(p.stats, weights)*10)/10;
      importedById[p.id] = false;
    } else {
      ptsById[p.id] = null;
      importedById[p.id] = false;
    }
  }
  const out = {};
  for (const pos of Object.keys(byPos)) {
    // Only players with a real projection participate in position rank/VBD/replacement —
    // a blank projection has no meaningful value yet, so it's excluded rather than
    // ranked last with a fabricated score.
    const list = [...byPos[pos]].filter(p => ptsById[p.id] != null).sort((a,b) => ptsById[b.id]-ptsById[a.id]);
    const repIdx = Math.min(rep[pos]||1, list.length) - 1;
    const repPts = list.length ? (list[repIdx] ? ptsById[list[repIdx].id] : ptsById[list[list.length-1].id]) : null;
    list.forEach((p, i) => {
      const vbd = Math.round((ptsById[p.id]-repPts)*10)/10;
      out[p.id] = { posRank: i+1, vbd, pts: ptsById[p.id], imported: importedById[p.id] };
    });
    for (const p of byPos[pos]) {
      if (!(p.id in out)) out[p.id] = { posRank: null, vbd: null, pts: null, imported: false };
    }
  }
  return out;
}

function computeTiers(players, fields, tierParams) {
  const byPos = {};
  for (const p of players) (byPos[p.pos] = byPos[p.pos] || []).push(p);
  const tiers = {};
  for (const pos of Object.keys(byPos)) {
    const list = [...byPos[pos]].filter(p => fields[p.id].vbd != null).sort((a,b) => fields[b.id].vbd - fields[a.id].vbd);
    let tier = 1;
    list.forEach((p, i) => {
      if (i > 0) {
        const prevVbd = fields[list[i-1].id].vbd;
        const curVbd = fields[p.id].vbd;
        const gap = prevVbd - curVbd;
        const threshold = Math.max(tierParams.minGap, Math.abs(prevVbd) * tierParams.pctGap);
        if (gap > threshold) tier++;
      }
      tiers[p.id] = tier;
    });
    for (const p of byPos[pos]) { if (!(p.id in tiers)) tiers[p.id] = null; }
  }
  return tiers;
}

function computeAuctionValues(players, fields, teams, rosterSpots, auctionOverrides) {
  const totalPool = teams * 200;
  const totalSpots = teams * rosterSpots;
  const hasOverride = (id) => auctionOverrides && auctionOverrides[id] != null;
  const importedTotal = players.reduce((s,p) => s + (hasOverride(p.id) ? auctionOverrides[p.id] : 0), 0);
  const importedSpots = players.filter(p => hasOverride(p.id)).length;
  const draftable = players.filter(p => !hasOverride(p.id) && fields[p.id].vbd > 0);
  const sumVbd = draftable.reduce((s,p) => s + fields[p.id].vbd, 0) || 1;
  const remaining = Math.max(0, totalPool - importedTotal - Math.max(0, totalSpots - importedSpots)*1);
  const values = {};
  for (const p of players) {
    if (hasOverride(p.id)) { values[p.id] = auctionOverrides[p.id]; continue; }
    if (fields[p.id].vbd == null) { values[p.id] = null; continue; }
    if (fields[p.id].vbd > 0) {
      values[p.id] = Math.max(1, Math.round(1 + (fields[p.id].vbd/sumVbd)*remaining));
    } else {
      values[p.id] = 1;
    }
  }
  return values;
}

/* ============================================================
   CSV IMPORT — for real projections/auction values from an
   external source (e.g. an exported UDK CSV)
   ============================================================ */
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else { inQuotes = false; } }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i+1] === "\n") i++;
        row.push(field); field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function normName(s) {
  return String(s || "").toLowerCase()
    .replace(/[.']/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ============================================================
   SLEEPER LIVE-DRAFT SYNC (Final Fantasy only) — read-only,
   advisory sync against the manually-entered draft board.
   There's no player-ID crosswalk yet (blocked on Will's UDK
   export, see PROJECT_CONTEXT.md), so matching is by normalized
   name + position — the same normName() already used for CSV-
   import matching. DEF picks match by team abbreviation instead
   (Sleeper's DEF pick metadata.team is already the same code the
   pool uses, e.g. "BAL" — verified against real Sleeper data).
   ============================================================ */
function buildPoolMatchIndex(pool) {
  const byNamePos = new Map();
  const byDefTeam = new Map();
  for (const p of pool) {
    if (p.pos === "DEF") byDefTeam.set(p.team, p.id);
    else byNamePos.set(normName(p.name) + "|" + p.pos, p.id);
  }
  return { byNamePos, byDefTeam };
}
function matchSleeperPick(pick, index) {
  const meta = pick.metadata || {};
  if (meta.position === "DEF") return index.byDefTeam.get(meta.team) ?? null;
  const name = `${meta.first_name || ""} ${meta.last_name || ""}`.trim();
  return index.byNamePos.get(normName(name) + "|" + meta.position) ?? null;
}
/** Compares fetched Sleeper picks against the current Final Fantasy draft
 *  board. Never mutates anything — returns what the caller should do with
 *  it, so this is testable independent of the polling/UI component. */
function reconcileSleeperPicks(picks, index, currentDraft, managerNameFor, nameById) {
  const patchMap = {};
  const unmatched = [];
  const conflicts = [];
  for (const pick of picks) {
    const id = matchSleeperPick(pick, index);
    const managerName = managerNameFor(pick.roster_id) || `Sleeper roster ${pick.roster_id}`;
    if (id == null) {
      const meta = pick.metadata || {};
      unmatched.push({ name: `${meta.first_name || ""} ${meta.last_name || ""}`.trim(), pos: meta.position, pickNo: pick.pick_no });
      continue;
    }
    const existing = currentDraft[id];
    if (!existing || !existing.drafted) {
      patchMap[id] = { drafted:true, manager:managerName, paid:"", sleeperPickNo:pick.pick_no, sleeperRound:pick.round, syncedFromSleeper:true };
    } else if (existing.syncedFromSleeper || existing.manager === managerName) {
      if (existing.sleeperPickNo !== pick.pick_no || existing.manager !== managerName) {
        patchMap[id] = { manager:managerName, sleeperPickNo:pick.pick_no, sleeperRound:pick.round, syncedFromSleeper:true };
      }
    } else {
      conflicts.push({ id, name: (nameById && nameById[id]) || id, localManager: existing.manager, sleeperManager: managerName });
    }
  }
  return { patchMap, unmatched, conflicts };
}


// The three actual draft boards — used to gate board-only UI (Export CSV,
// Reset Draft, the drafted/spent counter, Sleeper sync) and to fall back
// "league" to a real board whenever the active tab isn't one (how/settings).
const BOARD_TABS = ["koi", "final", "jordan"];
// Keep in sync with VALID_TABS in server/db.js — that's the server-side
// copy used to validate/store a user's allowed_tabs.
const ALL_TABS = [...BOARD_TABS, "how", "settings"];
const TAB_LABELS = {
  koi: "Koi — $200 Auction · Half-PPR", final: "Final Fantasy · Full PPR",
  jordan: "Jordan", how: "Calculations", settings: "Settings",
};

/** A textarea that grows to fit its full content — used for Expert/Personal
 *  Notes so opening a player's row always shows the whole note, not a
 *  clipped 2-line box you have to scroll inside. Re-measures on every
 *  value change (typing, or switching to a different player's note). */
function AutoGrowTextarea({ value, onChange, style, minRows = 3 }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [value]);
  return (
    <textarea ref={ref} value={value} onChange={onChange} rows={minRows}
      style={{ ...style, overflow:"hidden", resize:"none" }} />
  );
}
function NumField({ label, value, onChange, step }) {
  return (
    <label style={{ display:"flex", flexDirection:"column", gap:2, fontSize:11, opacity:0.85, width:118 }}>
      <span style={{ opacity:0.65 }}>{label}</span>
      <input type="number" step={step || "any"} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ background:"#0f100b", border:"1px solid #33362a", borderRadius:6, color:"#e9e6dd", padding:"5px 6px", fontSize:12 }} />
    </label>
  );
}
function CurveCard({ title, desc, fields, values, onSet }) {
  return (
    <div style={{ background:"#15160f", border:"1px solid #262819", borderRadius:10, padding:12, flex:"1 1 320px", minWidth:300 }}>
      <div style={{ fontWeight:700, fontSize:13, color:"#f0d97a", marginBottom:2 }}>{title}</div>
      {desc && <div style={{ fontSize:11.5, opacity:0.65, marginBottom:10, lineHeight:1.4 }}>{desc}</div>}
      <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
        {fields.map(([key,label,step]) => (
          <NumField key={key} label={label} step={step} value={values[key]}
            onChange={v => onSet(key, v)} />
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   PERSONAL NOTES — the one thing that stays per signed-in account rather
   than in the single shared record everything else lives in (draft picks,
   league settings, and — importantly — the imported base notes
   themselves, which only an admin can upload). A user's own inline
   edit/addition on a player's note sticks to their account and survives
   the shared base notes being re-uploaded later. Hits /api/notes
   (per-user, identity read from the session cookie server-side — nothing
   client-supplied), not /api/storage (shared, see storagePolyfill.js) —
   same underlying user_kv table, different route so the two scopes can't
   get confused.
   ============================================================ */
async function getPersonalNotes() {
  try {
    const res = await fetch(`/api/notes/ffb-notes-overrides`);
    if (!res.ok) return null;
    return await res.json(); // {key, value}
  } catch (e) { return null; }
}
async function setPersonalNotes(value) {
  try {
    await fetch(`/api/notes/ffb-notes-overrides`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
  } catch (e) { /* best effort — local state already updated for this session */ }
}

export default function DraftPrepApp() {
  const [adpPool, setAdpPool] = useState([]); // live pool from GET /api/players (server/adp.js), refreshed daily
  const [view, setView] = useState("koi"); // "koi" | "final" | "jordan" | "how"
  const [posFilter, setPosFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("vbd");
  const [sortDir, setSortDir] = useState("desc");
  const [draftByLeague, setDraftByLeague] = useState({ koi:{}, final:{}, jordan:{} });
  const [notesOverride, setNotesOverride] = useState({});
  const [managersByLeague, setManagersByLeague] = useState({ koi:["Will"], final:["Will"], jordan:["Will"] });
  const [managersTextByLeague, setManagersTextByLeague] = useState({ koi:"Will", final:"Will", jordan:"Will" });
  const [leagueConfigs, setLeagueConfigs] = useState({}); // id -> row from /api/leagues
  const [teamsByLeague, setTeamsByLeague] = useState(DEFAULT_TEAMS);
  const [rosterSpotsByLeague, setRosterSpotsByLeague] = useState(DEFAULT_ROSTER_SPOTS);
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [replacement, setReplacement] = useState(DEFAULT_REPLACEMENT);
  const [tierParams, setTierParams] = useState(DEFAULT_TIER_PARAMS);
  const [playerImports, setPlayerImports] = useState({}); // id -> {statsOverride, flatPtsOverride, koiPoints, finalPoints, auction}
  // Persistent (shared, not per-browser) — was previously a local checkbox
  // that silently reset to "on" every time you left and came back to the
  // Final Fantasy tab, so it kept hitting Sleeper's API outside draft time
  // no matter what you'd chosen last. Now it actually stays off.
  const [sleeperSyncPaused, setSleeperSyncPaused] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [showBudgets, setShowBudgets] = useState(false);
  const [loaded, setLoaded] = useState(false);


  useEffect(() => {
    fetch("/api/players").then(res => (res.ok ? res.json() : null)).then(list => {
      if (list && list.length) setAdpPool(list);
    }).catch(() => {}); // board just shows empty until the server's next successful ADP refresh
  }, []);

  // Who's actually signed in (real session, see AuthContext — this
  // replaces the old free-text "Viewing as" picker entirely) and which of
  // this board's tabs they can see. Admin and standard both get every tab;
  // a "limited" account only sees whatever's checked for them in the Admin
  // panel — no implicit "all tabs" fallback for limited, since the whole
  // point of per-area permissions is that nothing's visible until it's
  // explicitly granted. isAdmin stays the true admin role only — keeper
  // import, ESPN cookie edits, and the base-notes upload are elevated
  // actions that standard doesn't get just for having full view access.
  const { user: authUser, logout } = useAuth();
  const currentUserName = authUser?.username || "";
  const isAdmin = authUser?.role === "admin";
  const hasFullDraftAccess = isAdmin || authUser?.role === "standard";
  const allowedTabs = hasFullDraftAccess ? ALL_TABS : (authUser?.draftTabs || []);

  // If the active tab isn't (or is no longer) allowed for this user, bump
  // them to their first allowed tab instead of showing a tab they can't see.
  useEffect(() => {
    if (allowedTabs.length && !allowedTabs.includes(view)) setView(allowedTabs[0]);
  }, [allowedTabs, view]);

  useEffect(() => {
    (async () => {
      const [d, leagueRows, personalNotes] = await Promise.all([
        window.storage.get("ffb-draft-state").catch(() => null),
        fetch("/api/leagues").then(res => (res.ok ? res.json() : [])).catch(() => []),
        getPersonalNotes(),
      ]);
      try {
        setNotesOverride(personalNotes && personalNotes.value ? JSON.parse(personalNotes.value) : {});
      } catch (e) { setNotesOverride({}); }

      const configs = {};
      for (const row of leagueRows || []) configs[row.id] = row;
      setLeagueConfigs(configs);
      const base = baseLeagueParams(configs);

      let teamsOverride = null, rosterSpotsOverride = null, replacementOverride = null;
      try {
        if (d && d.value) {
          const parsed = JSON.parse(d.value);
          let dbl = parsed.draftByLeague;
          if (!dbl && parsed.draft) dbl = { koi: parsed.draft, final: {} };
          dbl = dbl || {};
          setDraftByLeague({ koi:{}, final:{}, jordan:{}, ...dbl });
          // notesOverride is loaded separately above (getPersonalNotes) — it's
          // per-user, not part of this shared blob. parsed.notesOverride is
          // read here only as a one-time migration for anyone whose personal
          // edits are still sitting in the old shared location.
          if (!personalNotes && parsed.notesOverride && Object.keys(parsed.notesOverride).length) {
            setNotesOverride(parsed.notesOverride);
            setPersonalNotes(JSON.stringify(parsed.notesOverride));
          }
          let mbl = parsed.managersByLeague;
          if (!mbl && parsed.managers) mbl = { koi: parsed.managers, final: parsed.managers };
          mbl = { koi:["Will"], final:["Will"], jordan:["Will"], ...(mbl || {}) };
          setManagersByLeague(mbl);
          setManagersTextByLeague({
            koi:(mbl.koi||["Will"]).join(", "),
            final:(mbl.final||["Will"]).join(", "),
            jordan:(mbl.jordan||["Will"]).join(", "),
          });
          teamsOverride = parsed.teamsByLeague
            // migrate from the old global teams/rosterSpots format — only Koi's
            // settings panel ever exposed editing these, so a saved flat value
            // becomes a Koi-specific override.
            || (parsed.teams != null ? { koi: parsed.teams } : null);
          rosterSpotsOverride = parsed.rosterSpotsByLeague
            || (parsed.rosterSpots != null ? { koi: parsed.rosterSpots } : null);
          replacementOverride = parsed.replacement || null;
          setWeights({
            koi: { ...DEFAULT_WEIGHTS.koi, ...((parsed.weights||{}).koi||{}) },
            final: { ...DEFAULT_WEIGHTS.final, ...((parsed.weights||{}).final||{}) },
            jordan: { ...DEFAULT_WEIGHTS.jordan, ...((parsed.weights||{}).jordan||{}) },
          });
          setTierParams(parsed.tierParams || DEFAULT_TIER_PARAMS);
          let pImp = parsed.playerImports;
          if (!pImp && parsed.importsByLeague) {
            // migrate from the old per-league import format
            pImp = {};
            const koiOld = parsed.importsByLeague.koi || {};
            const finalOld = parsed.importsByLeague.final || {};
            for (const id of new Set([...Object.keys(koiOld), ...Object.keys(finalOld)])) {
              pImp[id] = {};
              if (koiOld[id] && koiOld[id].points != null) pImp[id].koiPoints = koiOld[id].points;
              if (koiOld[id] && koiOld[id].auction != null) pImp[id].auction = koiOld[id].auction;
              if (finalOld[id] && finalOld[id].points != null) pImp[id].finalPoints = finalOld[id].points;
            }
          }
          setPlayerImports(pImp || {});
          setSleeperSyncPaused(!!parsed.sleeperSyncPaused);
        }
      } catch (e) { /* first run, no saved state */ }

      setTeamsByLeague({ ...base.teams, ...(teamsOverride || {}) });
      setRosterSpotsByLeague({ ...base.rosterSpots, ...(rosterSpotsOverride || {}) });
      setReplacement({
        koi: { ...base.replacement.koi, ...((replacementOverride||{}).koi||{}) },
        final: { ...base.replacement.final, ...((replacementOverride||{}).final||{}) },
        jordan: { ...base.replacement.jordan, ...((replacementOverride||{}).jordan||{}) },
      });
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const payload = JSON.stringify({
      draftByLeague, managersByLeague, teamsByLeague, rosterSpotsByLeague,
      weights, replacement, tierParams, playerImports, sleeperSyncPaused,
    });
    window.storage.set("ffb-draft-state", payload).catch(() => {});
  }, [draftByLeague, managersByLeague, teamsByLeague, rosterSpotsByLeague, weights, replacement, tierParams, playerImports, sleeperSyncPaused, loaded]);

  // Personal notes save separately, per signed-in account — see
  // getPersonalNotes/setPersonalNotes above for why this isn't part of
  // the shared payload.
  useEffect(() => {
    if (!loaded) return;
    setPersonalNotes(JSON.stringify(notesOverride));
  }, [notesOverride, loaded]);

  const pool = useMemo(() => buildPool(adpPool), [adpPool]);
  const poolFinal = useMemo(() => pool.map(p => {
    const imp = playerImports[p.id];
    if (!imp) return p;
    return {
      ...p,
      stats: imp.statsOverride ? { ...(p.stats || {}), ...imp.statsOverride } : p.stats,
      flatPts: imp.flatPtsOverride != null ? imp.flatPtsOverride : p.flatPts,
      note: imp.outlook != null ? { ...p.note, pos: imp.outlook } : p.note,
      tierOverride: imp.tier != null ? imp.tier : null,
      posRankOverride: imp.posRank != null ? imp.posRank : null,
      risk: imp.risk != null ? imp.risk : null,
      upside: imp.upside != null ? imp.upside : null,
      bye: imp.bye != null ? imp.bye : p.bye,
      importSources: imp.sources || [],
    };
  }), [pool, playerImports]);
  const koiPointOverrides = useMemo(() => {
    const o = {};
    for (const id in playerImports) { if (playerImports[id].koiPoints != null) o[id] = { points: playerImports[id].koiPoints }; }
    return o;
  }, [playerImports]);
  const finalPointOverrides = useMemo(() => {
    const o = {};
    for (const id in playerImports) { if (playerImports[id].finalPoints != null) o[id] = { points: playerImports[id].finalPoints }; }
    return o;
  }, [playerImports]);
  const koiFields = useMemo(() => computeLeagueFields(poolFinal, weights.koi, replacement.koi, koiPointOverrides), [poolFinal, weights.koi, replacement.koi, koiPointOverrides]);
  const finalFields = useMemo(() => computeLeagueFields(poolFinal, weights.final, replacement.final, finalPointOverrides), [poolFinal, weights.final, replacement.final, finalPointOverrides]);
  const jordanFields = useMemo(() => computeLeagueFields(poolFinal, weights.jordan, replacement.jordan, {}), [poolFinal, weights.jordan, replacement.jordan]);
  const koiTiers = useMemo(() => computeTiers(poolFinal, koiFields, tierParams), [poolFinal, koiFields, tierParams]);
  const finalTiers = useMemo(() => computeTiers(poolFinal, finalFields, tierParams), [poolFinal, finalFields, tierParams]);
  const jordanTiers = useMemo(() => computeTiers(poolFinal, jordanFields, tierParams), [poolFinal, jordanFields, tierParams]);
  const koiAuctionOverrides = useMemo(() => {
    const o = {};
    for (const id in playerImports) { if (playerImports[id].auction != null) o[id] = playerImports[id].auction; }
    return o;
  }, [playerImports]);
  // Koi's is the only board with an auction, so its teams/rosterSpots are
  // always what drive the $200/team pool math, regardless of which tab is active.
  const auctionValues = useMemo(() => computeAuctionValues(poolFinal, koiFields, teamsByLeague.koi, rosterSpotsByLeague.koi, koiAuctionOverrides), [poolFinal, koiFields, teamsByLeague.koi, rosterSpotsByLeague.koi, koiAuctionOverrides]);

  const league = BOARD_TABS.includes(view) ? view : "koi";
  const teams = teamsByLeague[league];
  const rosterSpots = rosterSpotsByLeague[league];
  const fields = league === "koi" ? koiFields : league === "jordan" ? jordanFields : finalFields;
  const tiers = league === "koi" ? koiTiers : league === "jordan" ? jordanTiers : finalTiers;
  const draft = draftByLeague[league] || {};
  const managers = managersByLeague[league] || ["Will"];
  const managersText = managersTextByLeague[league] || "";

  const rows = useMemo(() => {
    let list = poolFinal.map(p => ({
      ...p,
      vbd: fields[p.id].vbd,
      posRank: p.posRankOverride != null ? p.posRankOverride : fields[p.id].posRank,
      tier: p.tierOverride != null ? p.tierOverride : tiers[p.id],
      auction: auctionValues[p.id],
      pts: fields[p.id].pts,
      d: draft[p.id] || { drafted:false, manager:"", paid:"" },
      noteData: notesOverride[p.id] || p.note,
    }));
    if (posFilter !== "ALL") list = list.filter(p => p.pos === posFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(s) || p.team.toLowerCase().includes(s));
    }
    const sortVal = (r, key) => {
      switch (key) {
        case "tier": return r.tier;
        case "pos": return r.pos;
        case "name": return r.name;
        case "team": return r.team;
        case "bye": return r.bye;
        case "adp": return r.adpRank;
        case "posRank": return parseInt(String(r.posRank).replace(/[^0-9]/g,""), 10) || 0;
        case "pts": return r.pts;
        case "vbd": return r.vbd;
        case "auction": return r.auction;
        case "risk": return r.risk || "";
        case "upside": return r.upside || "";
        case "outlook": return r.noteData.outlook;
        default: return r.vbd;
      }
    };
    list.sort((a, b) => {
      const av = sortVal(a, sortKey), bv = sortVal(b, sortKey);
      // Blank projections (null) always sort last, regardless of direction —
      // there's nothing to rank them by.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = (typeof av === "string" || typeof bv === "string")
        ? String(av).localeCompare(String(bv))
        : av - bv;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [poolFinal, fields, tiers, auctionValues, koiAuctionOverrides, draft, notesOverride, posFilter, search, sortKey, sortDir]);

  const SORT_DEFAULT_DIR = { tier:"asc", pos:"asc", name:"asc", team:"asc", bye:"asc", adp:"asc",
    posRank:"asc", pts:"desc", vbd:"desc", auction:"desc", risk:"asc", upside:"asc", outlook:"asc" };
  const handleSort = useCallback((key) => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => d === "asc" ? "desc" : "asc"); return prev; }
      setSortDir(SORT_DEFAULT_DIR[key] || "desc");
      return key;
    });
  }, []);

  const setDraftField = useCallback((id, patch) => {
    setDraftByLeague(all => {
      const cur = all[league] || {};
      return { ...all, [league]: { ...cur, [id]: { ...(cur[id]||{drafted:false,manager:"",paid:""}), ...patch } } };
    });
  }, [league]);
  // Takes an explicit league now (not closed over the active tab) — managers
  // are edited from the Settings tab, which shows all three leagues at once.
  const setManagersForLeague = useCallback((lg, text) => {
    setManagersTextByLeague(all => ({ ...all, [lg]: text }));
    setManagersByLeague(all => ({ ...all, [lg]: text.split(",").map(s=>s.trim()).filter(Boolean) }));
  }, []);
  // Takes an explicit league (not closed over the active tab) — used by
  // Sleeper sync (always targets Final Fantasy, regardless of which tab is
  // active) and by the Keeper import on the Settings tab (targets whichever
  // league the import is scoped to, shown all at once there like managers).
  const mergePicksForLeague = useCallback((lg, patchMap) => {
    setDraftByLeague(all => {
      const cur = all[lg] || {};
      const merged = { ...cur };
      for (const id in patchMap) {
        merged[id] = { ...(merged[id] || {drafted:false,manager:"",paid:""}), ...patchMap[id] };
      }
      return { ...all, [lg]: merged };
    });
  }, []);
  const addManagersForLeague = useCallback((lg, names) => {
    if (!names.length) return;
    setManagersByLeague(all => {
      const merged = [...new Set([...(all[lg] || []), ...names])];
      return { ...all, [lg]: merged };
    });
    setManagersTextByLeague(all => {
      const curList = (all[lg] || "").split(",").map(s=>s.trim()).filter(Boolean);
      const merged = [...new Set([...curList, ...names])];
      return { ...all, [lg]: merged.join(", ") };
    });
  }, []);
  const setNote = useCallback((id, patch, base) => {
    setNotesOverride(n => ({ ...n, [id]: { ...(n[id]||base), ...patch } }));
  }, []);
  const setWeight = useCallback((lg, key, value) => {
    setWeights(w => ({ ...w, [lg]: { ...w[lg], [key]: value } }));
  }, []);
  const setRep = useCallback((lg, key, value) => {
    setReplacement(r => ({ ...r, [lg]: { ...r[lg], [key]: value } }));
  }, []);
  const setTeamsFor = useCallback((lg, value) => {
    setTeamsByLeague(t => ({ ...t, [lg]: value }));
  }, []);
  const setRosterSpotsFor = useCallback((lg, value) => {
    setRosterSpotsByLeague(r => ({ ...r, [lg]: value }));
  }, []);
  const applyImport = useCallback((overridesById) => {
    setPlayerImports(all => {
      const merged = { ...all };
      for (const id in overridesById) {
        const prior = merged[id] || {};
        const incoming = overridesById[id];
        merged[id] = {
          ...prior, ...incoming,
          statsOverride: (prior.statsOverride || incoming.statsOverride)
            ? { ...(prior.statsOverride||{}), ...(incoming.statsOverride||{}) }
            : undefined,
          sources: [...(prior.sources || []), ...(incoming.sources || [])],
        };
      }
      return merged;
    });
  }, []);
  const clearImport = useCallback(() => {
    setPlayerImports({});
  }, []);
  const resetAllCalcParams = () => {
    if (confirm("Reset all scoring weights, replacement levels, and team/roster settings back to defaults? This won't clear imported data.")) {
      const base = baseLeagueParams(leagueConfigs);
      setWeights(DEFAULT_WEIGHTS);
      setReplacement(base.replacement); setTierParams(DEFAULT_TIER_PARAMS);
      setTeamsByLeague(base.teams); setRosterSpotsByLeague(base.rosterSpots);
    }
  };

  const exportCSV = () => {
    const header = ["ADP","Tier","Pos","Player","Team","Bye","PosRank","Proj Pts","VBD"]
      .concat(league==="koi" ? ["Auction $"] : [])
      .concat(["Drafted","Manager","Paid","Risk","Upside","Outlook","Expert Notes","Personal Notes"]);
    const lines = [header.join(",")];
    for (const r of rows) {
      const row = [r.adpRank, r.tier, r.pos, `"${r.name}"`, r.team, r.bye, r.posRank, r.pts, r.vbd]
        .concat(league==="koi" ? [r.auction] : [])
        .concat([r.d.drafted?"Y":"N", `"${r.d.manager||""}"`, r.d.paid||"", `"${r.risk||""}"`, `"${r.upside||""}"`, r.noteData.outlook,
                 `"${r.noteData.pos}"`, `"${r.noteData.neg}"`]);
      lines.push(row.join(","));
    }
    const blob = new Blob([lines.join("\n")], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ffb-${league}-board.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const resetDraft = () => {
    const label = league === "koi" ? "Koi" : league === "jordan" ? "Jordan" : "Final Fantasy";
    if (confirm(`Clear all drafted/manager/paid marks for the ${label} board? This can't be undone.`)) {
      setDraftByLeague(all => ({ ...all, [league]: {} }));
    }
  };

  const draftedCount = Object.values(draft).filter(d => d && d.drafted).length;
  const spent = Object.values(draft).filter(d => d && d.drafted && d.paid).reduce((s,d)=>s+Number(d.paid||0),0);

  return (
    <div style={{
      fontFamily: "'Bahnschrift','Segoe UI',Arial,sans-serif",
      background: "#12130f", color: "#e9e6dd", minHeight: "100%", padding: "20px",
      backgroundImage: "radial-gradient(circle at 10% 0%, #1a2418 0%, #12130f 55%)",
    }}>
      <style>{`
        * { box-sizing: border-box; }
        input, select, textarea, button { font-family: inherit; }
        table { border-collapse: collapse; width: 100%; }
        th { position: sticky; top: 0; background: #1b1d15; z-index: 2; }
        tr:hover td { background: #1c1e16 !important; }
        ::-webkit-scrollbar { height: 10px; width: 10px; }
        ::-webkit-scrollbar-thumb { background: #3a3d2c; border-radius: 6px; }
        button { cursor: pointer; }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.6; }
      `}</style>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", flexWrap:"wrap", gap:12, marginBottom:16 }}>
        <div>
          <Link to="/" style={{ fontSize:11, color:"#9c998e", textDecoration:"none" }}>&larr; Fantasy HQ</Link>
          <div style={{ fontSize:11, letterSpacing:3, color:"#c9a227", fontWeight:700, marginTop:4 }}>Bowen FFB</div>
          <h1 style={{ margin:"2px 0 0", fontSize:32, fontWeight:800, letterSpacing:0.5 }}>Draft Prep Board — 2026</h1>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
          <div style={{ fontSize:12.5, opacity:0.65, alignSelf:"center" }}>
            Signed in as <b style={{opacity:0.9}}>{currentUserName}</b>
          </div>
          <button onClick={logout} style={btnStyle()}>Log out</button>
          {BOARD_TABS.includes(view) && (
            <div style={{ display:"flex", gap:8 }}>
              {view === "koi" && <button onClick={()=>setShowBudgets(s=>!s)} style={btnStyle()}>Team Budgets</button>}
              <button onClick={exportCSV} style={btnStyle()}>Export CSV</button>
              <button onClick={resetDraft} style={btnStyle("#3a1f1f","#c0453f")}>Reset Draft</button>
            </div>
          )}
        </div>
      </div>

      {view === "final" && (
        <SleeperSyncPanel
          sourceLeagueId={leagueConfigs.final && leagueConfigs.final.source_league_id}
          pool={poolFinal}
          draft={draftByLeague.final || {}}
          onMergePicks={(patchMap) => mergePicksForLeague("final", patchMap)}
          onAddManagers={(names) => addManagersForLeague("final", names)}
          paused={sleeperSyncPaused}
          onTogglePause={() => setSleeperSyncPaused(p => !p)}
        />
      )}

      {view === "koi" && showBudgets && (
        <TeamBudgetsPanel managers={managers} draft={draft} pool={pool} rosterSpots={rosterSpots} />
      )}

      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
        {ALL_TABS.filter(k => allowedTabs.includes(k)).map(k => [k, TAB_LABELS[k]]).map(([k,label]) => (
          <button key={k} onClick={()=>setView(k)} style={{
            padding:"10px 18px", borderRadius:8, border:"1px solid " + (view===k ? "#c9a227" : "#33362a"),
            background: view===k ? "#2a2a18" : "#181910", color: view===k ? "#f0d97a" : "#c9c6ba",
            fontWeight:700, fontSize:14,
          }}>{label}</button>
        ))}
        {BOARD_TABS.includes(view) && (
          <div style={{ marginLeft:"auto", fontSize:13, opacity:0.75, alignSelf:"center" }}>
            Drafted: {draftedCount} {league==="koi" && <> · Spent: ${spent} / ${teams*200}</>}
          </div>
        )}
      </div>

      {view === "how" ? (
        <MethodologyTab
          weights={weights} setWeight={setWeight}
          replacement={replacement} setRep={setRep}
          tierParams={tierParams} setTierParams={setTierParams}
          teams={teams} rosterSpots={rosterSpots}
          onReset={resetAllCalcParams}
          pool={pool}
          playerImports={playerImports}
          onApplyImport={applyImport}
          onClearImport={clearImport}
          isAdmin={isAdmin}
        />
      ) : view === "settings" ? (
        <SettingsTab
          teamsByLeague={teamsByLeague} rosterSpotsByLeague={rosterSpotsByLeague}
          setTeamsFor={setTeamsFor} setRosterSpotsFor={setRosterSpotsFor}
          managersTextByLeague={managersTextByLeague} setManagersForLeague={setManagersForLeague}
          pool={pool} draftByLeague={draftByLeague}
          onApplyKeepers={(lg, patchMap, newManagers) => { mergePicksForLeague(lg, patchMap); addManagersForLeague(lg, newManagers); }}
          canEditKeepers={isAdmin}
          canEditEspnAccess={isAdmin}
        />
      ) : (
        <>
          <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
            {["ALL","QB","RB","WR","TE","K","DEF"].map(p => (
              <button key={p} onClick={()=>setPosFilter(p)} style={{
                padding:"6px 12px", borderRadius:20, fontSize:12, fontWeight:700,
                border:"1px solid " + (posFilter===p ? (POS_COLORS[p]||"#c9a227") : "#33362a"),
                background: posFilter===p ? "#20211a" : "transparent",
                color: posFilter===p ? (POS_COLORS[p]||"#f0d97a") : "#9c998e",
              }}>{p}</button>
            ))}
            <input placeholder="Search player or team..." value={search} onChange={e=>setSearch(e.target.value)}
              style={{...inp(220), marginLeft:8}} />
            <span style={{ fontSize:11, opacity:0.5 }}>Click a column header to sort</span>
          </div>

          <div style={{ border:"1px solid #2a2c20", borderRadius:10, overflow:"auto", maxHeight:"70vh" }}>
            <table>
              <thead>
                <tr style={{ fontSize:11, textTransform:"uppercase", letterSpacing:0.6, color:"#a9a795" }}>
                  <th style={th()}>Drafted</th>
                  {league==="koi" && <th style={th()}>Paid</th>}
                  {league==="koi" && <th style={th()}>Manager</th>}
                  <SortTh label="Tier" col="tier" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Pos" col="pos" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Player" col="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
                  <SortTh label="Team" col="team" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Bye" col="bye" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="ADP" col="adp" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Pos Rk" col="posRank" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Proj Pts" col="pts" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="VBD" col="vbd" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  {league==="koi" && <SortTh label="Auction $" col="auction" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                  {league!=="koi" && <th style={th()}>Manager</th>}
                  <SortTh label="Risk" col="risk" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Upside" col="upside" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Outlook" col="outlook" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const style = OUTLOOK_STYLE[r.noteData.outlook] || OUTLOOK_STYLE.yellow;
                  const isOpen = expanded === r.id;
                  const managerCell = (
                    <td style={td()} onClick={e=>e.stopPropagation()}>
                      <select value={r.d.manager} onChange={e=>setDraftField(r.id,{manager:e.target.value})} style={inp(100)}>
                        <option value=""></option>
                        {managers.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      {league==="final" && r.d.syncedFromSleeper && <sup style={badgeSup()} title="Auto-filled from Sleeper">SLP</sup>}
                      {r.d.viaKeeper && <sup style={badgeSup()} title="Assigned via keeper import">KEEP</sup>}
                    </td>
                  );
                  return (
                    <React.Fragment key={r.id}>
                      <tr style={{ opacity: r.d.drafted ? 0.45 : 1, cursor:"pointer" }}
                          onClick={()=>setExpanded(isOpen ? null : r.id)}>
                        <td style={td()} onClick={e=>e.stopPropagation()}>
                          <input type="checkbox" checked={!!r.d.drafted}
                            onChange={e=>setDraftField(r.id,{drafted:e.target.checked})} />
                        </td>
                        {league==="koi" && (
                          <td style={td()} onClick={e=>e.stopPropagation()}>
                            <input type="number" placeholder="$" value={r.d.paid}
                              onChange={e=>setDraftField(r.id,{paid:e.target.value})} style={inp(50)} />
                          </td>
                        )}
                        {league==="koi" && managerCell}
                        <td style={td()}>{r.tier ?? "—"}</td>
                        <td style={{...td(), color:POS_COLORS[r.pos], fontWeight:700}}>{r.pos}</td>
                        <td style={{...td("left"), fontWeight:600}}>{r.name}</td>
                        <td style={td()}>{r.team}</td>
                        <td style={td()}>{r.bye}</td>
                        <td style={td()}>{r.adpRank}</td>
                        <td style={td()}>{r.posRank == null ? "—" : (/[A-Za-z]/.test(String(r.posRank)) ? r.posRank : `${r.pos}${r.posRank}`)}</td>
                        <td style={td()}>{r.pts != null ? r.pts.toFixed(1) : "—"}</td>
                        <td style={{...td(), color: r.vbd == null ? "#7c7a6d" : (r.vbd>=0 ? "#7fd18f" : "#e08a8a")}}>{r.vbd != null ? r.vbd.toFixed(1) : "—"}</td>
                        {league==="koi" && <td style={{...td(), fontWeight:700}}>{r.auction != null ? `$${r.auction}` : "—"}</td>}
                        {league!=="koi" && managerCell}
                        <td style={td()}>{r.risk || ""}</td>
                        <td style={td()}>{r.upside || ""}</td>
                        <td style={td()}>
                          <span style={{ padding:"3px 8px", borderRadius:6, fontSize:11, fontWeight:700,
                            background:style.bg, border:`1px solid ${style.border}`, color:style.border }}>
                            {r.noteData.outlook}
                          </span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={league==="koi" ? 16 : 14} style={{ background:"#181910", padding:"14px 18px" }}>
                            <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
                              <div style={{ flex:"1 1 320px" }}>
                                <div style={lblSmall("#7fd18f")}>Expert Notes</div>
                                <AutoGrowTextarea value={r.noteData.pos} onChange={e=>setNote(r.id,{pos:e.target.value}, r.note)}
                                  style={ta()} />
                              </div>
                              <div style={{ flex:"1 1 320px" }}>
                                <div style={lblSmall("#e08a8a")}>Personal Notes</div>
                                <AutoGrowTextarea value={r.noteData.neg} onChange={e=>setNote(r.id,{neg:e.target.value}, r.note)}
                                  style={ta()} />
                              </div>
                              <div style={{ flex:"0 0 160px" }}>
                                <div style={lblSmall("#f0d97a")}>Outlook</div>
                                <select value={r.noteData.outlook} onChange={e=>setNote(r.id,{outlook:e.target.value}, r.note)} style={inp("100%")}>
                                  {Object.keys(OUTLOOK_STYLE).map(k => <option key={k} value={k}>{OUTLOOK_STYLE[k].label}</option>)}
                                </select>
                              </div>
                            </div>
                            <div style={{ fontSize:11, opacity:0.55, marginTop:8 }}>
                              {r.pos!=="K" && r.pos!=="DEF"
                                ? (r.stats ? `Raw projection — ${Object.entries(r.stats).filter(([,v])=>v).map(([k,v])=>`${k}: ${v}`).join(" · ")}` : "No projection imported yet — update via the Import Real Data tab.")
                                : (r.pts != null ? "Flat position score (imported)" : "No projection imported yet — update via the Import Real Data tab.")}
                            </div>
                            {r.importSources && r.importSources.length > 0 && (
                              <div style={{ fontSize:11, opacity:0.55, marginTop:4 }}>
                                Imported from: {r.importSources.map((s, i) => (
                                  <span key={i}>
                                    {i > 0 && " · "}
                                    <b style={{color:"#7fd1c9"}}>{s.label}</b>
                                    {s.fields && s.fields.length > 0 ? ` (${s.fields.join(", ")})` : ""}
                                    {" — "}{new Date(s.date).toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" })}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize:11, opacity:0.5, marginTop:14, lineHeight:1.6 }}>
            ADP order and player pool are live half-PPR consensus data from Fantasy Football Calculator, refreshed
            daily. Points, Pos Rk, VBD, and
            Auction $ show <b>—</b> until real projection data is imported for that player — there's no synthetic
            fallback. Import CSVs on the "Calculations" tab's "Import Real Data" section. Owners, drafted marks,
            and prices are tracked separately per board.
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   TEAM BUDGETS — Koi's $200 auction only (the only board with a
   budget to track); read live off draftByLeague. Nothing computed
   here is stored — it's a summary view over the same drafted/
   manager/paid data the table already shows per player, just
   grouped the other way.
   ============================================================ */
function TeamBudgetsPanel({ managers, draft, pool, rosterSpots }) {
  const posById = useMemo(() => {
    const m = {};
    for (const p of pool) m[p.id] = p.pos;
    return m;
  }, [pool]);

  const rows = useMemo(() => {
    return managers.map(manager => {
      const picks = Object.entries(draft).filter(([, d]) => d && d.drafted && d.manager === manager);
      const spent = picks.reduce((s, [, d]) => s + Number(d.paid || 0), 0);
      const filled = picks.length;
      const spotsLeft = Math.max(0, rosterSpots - filled);
      // Max bid = what's left after reserving $1 for every OTHER open spot —
      // the number that actually matters mid-auction, not raw remaining budget.
      const remaining = Math.max(0, 200 - spent);
      const maxBid = Math.max(0, remaining - Math.max(0, spotsLeft - 1));
      const posCounts = {};
      for (const [id] of picks) {
        const pos = posById[id];
        if (pos) posCounts[pos] = (posCounts[pos] || 0) + 1;
      }
      return { manager, spent, filled, spotsLeft, remaining, maxBid, posCounts };
    }).sort((a, b) => b.remaining - a.remaining);
  }, [managers, draft, posById, rosterSpots]);

  return (
    <div style={panelStyle()}>
      <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
        Team Budgets
      </div>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", fontSize:12.5, whiteSpace:"nowrap" }}>
          <thead>
            <tr style={{ opacity:0.65, textAlign:"left" }}>
              <th style={{padding:"4px 10px"}}>Manager</th>
              <th style={{padding:"4px 10px"}}>Spent</th>
              <th style={{padding:"4px 10px"}}>Remaining</th>
              <th style={{padding:"4px 10px"}}>Max Bid</th>
              <th style={{padding:"4px 10px"}}>Roster</th>
              {["QB","RB","WR","TE","K","DEF"].map(pos => <th key={pos} style={{padding:"4px 10px", color:POS_COLORS[pos]}}>{pos}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.manager}>
                <td style={{padding:"4px 10px", fontWeight:700}}>{r.manager}</td>
                <td style={{padding:"4px 10px"}}>${r.spent}</td>
                <td style={{padding:"4px 10px", color: r.remaining <= 20 ? "#e08a8a" : "#7fd18f"}}>${r.remaining}</td>
                <td style={{padding:"4px 10px", fontWeight:700}}>${r.maxBid}</td>
                <td style={{padding:"4px 10px"}}>{r.filled} / {rosterSpots}</td>
                {["QB","RB","WR","TE","K","DEF"].map(pos => (
                  <td key={pos} style={{padding:"4px 10px", opacity: r.posCounts[pos] ? 1 : 0.35}}>{r.posCounts[pos]||0}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize:11, opacity:0.55, marginTop:10 }}>
        Max Bid = remaining budget minus $1 reserved for every other open roster spot — what a team could
        actually spend on one player right now, not just raw dollars left.
      </div>
    </div>
  );
}

const SLEEPER_API = "https://api.sleeper.app/v1";

/** Read-only, advisory sync against Sleeper's live Final Fantasy draft —
 *  see PROJECT_CONTEXT.md's "Platform sync strategy" and the design notes
 *  above reconcileSleeperPicks(). Never blocks manual entry: every fetch
 *  is caught and degrades to a status message, nothing throws upward. */
function SleeperSyncPanel({ sourceLeagueId, pool, draft, onMergePicks, onAddManagers, paused, onTogglePause }) {
  const [draftId, setDraftId] = useState(null);
  const [managerByRoster, setManagerByRoster] = useState(new Map());
  const [status, setStatus] = useState("idle"); // 'idle' | 'loading' | 'error'
  const [error, setError] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
  const [unmatched, setUnmatched] = useState([]);
  const [conflicts, setConflicts] = useState([]);

  // Resolve the current draft_id + manager names once we know the league —
  // skipped entirely while paused, not just the recurring poll below, so
  // pausing actually stops every Sleeper API call, not just the 15s timer.
  useEffect(() => {
    if (!sourceLeagueId || paused) return;
    let cancelled = false;
    (async () => {
      try {
        const [drafts, rosters, users] = await Promise.all([
          fetch(`${SLEEPER_API}/league/${sourceLeagueId}/drafts`).then(r => r.json()),
          fetch(`${SLEEPER_API}/league/${sourceLeagueId}/rosters`).then(r => r.json()),
          fetch(`${SLEEPER_API}/league/${sourceLeagueId}/users`).then(r => r.json()),
        ]);
        if (cancelled) return;
        const userById = new Map((users || []).map(u => [u.user_id, u]));
        const byRoster = new Map();
        for (const r of rosters || []) {
          const u = userById.get(r.owner_id);
          const name = (u && (u.metadata?.team_name || u.display_name)) || `Sleeper roster ${r.roster_id}`;
          byRoster.set(r.roster_id, name);
        }
        setManagerByRoster(byRoster);
        onAddManagers([...new Set(byRoster.values())]);
        const d = Array.isArray(drafts) ? drafts[0] : null;
        setDraftId(d ? d.draft_id : null);
        if (!d) setError("No draft found for this league yet");
      } catch (e) {
        if (!cancelled) setError("Couldn't reach Sleeper (league setup): " + e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [sourceLeagueId, paused]);

  const sync = useCallback(async () => {
    if (!draftId) return;
    setStatus("loading");
    try {
      const picks = await fetch(`${SLEEPER_API}/draft/${draftId}/picks`).then(r => r.json());
      const index = buildPoolMatchIndex(pool);
      const nameById = {};
      for (const p of pool) nameById[p.id] = p.name;
      const { patchMap, unmatched, conflicts } = reconcileSleeperPicks(
        Array.isArray(picks) ? picks : [], index, draft, (rid) => managerByRoster.get(rid), nameById
      );
      if (Object.keys(patchMap).length) onMergePicks(patchMap);
      setUnmatched(unmatched);
      setConflicts(conflicts);
      setLastSynced(new Date());
      setStatus("idle");
      setError(null);
    } catch (e) {
      setStatus("error");
      setError("Sync failed: " + e.message);
    }
  }, [draftId, pool, draft, managerByRoster, onMergePicks]);

  useEffect(() => {
    if (!draftId || paused) return;
    sync();
    const interval = setInterval(sync, 15000);
    return () => clearInterval(interval);
  }, [draftId, paused, sync]);

  const statusText = paused ? "Sync paused"
    : !sourceLeagueId ? "Waiting on league config…"
    : !draftId ? (error || "Resolving draft…")
    : status === "loading" ? "Syncing…"
    : error ? error
    : lastSynced ? `Last synced ${lastSynced.toLocaleTimeString()}` : "Not synced yet";

  return (
    <div style={{...panelStyle(), marginBottom:14, display:"flex", flexDirection:"column", gap:8}}>
      <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", textTransform:"uppercase" }}>
          Sleeper Sync
        </div>
        <div style={{ fontSize:12, opacity: paused ? 0.5 : 0.75 }}>{statusText}</div>
        <button onClick={onTogglePause} style={btnStyle(paused ? "#20211a" : "#3a1f1f", paused ? "#c9a227" : "#c0453f")}>
          {paused ? "Resume Sync" : "Pause Sync"}
        </button>
        {!paused && <button onClick={sync} disabled={!draftId} style={btnStyle()}>Sync now</button>}
      </div>
      {paused && (
        <div style={{ fontSize:11, opacity:0.55 }}>
          No requests are being made to Sleeper while paused — turn this back on closer to draft day.
        </div>
      )}
      {conflicts.length > 0 && (
        <div style={{ fontSize:12, color:"#e08a8a" }}>
          {conflicts.length} conflict{conflicts.length>1?"s":""} — Sleeper disagrees with a manual entry, not overwritten:{" "}
          {conflicts.map(c => `${c.name} (local: ${c.localManager || "—"}, Sleeper: ${c.sleeperManager})`).join("; ")}
        </div>
      )}
      {unmatched.length > 0 && (
        <div style={{ fontSize:12, color:"#c9a227" }}>
          {unmatched.length} Sleeper pick{unmatched.length>1?"s":""} couldn't be auto-matched — mark manually:{" "}
          {unmatched.map(u => `${u.name || "?"} (${u.pos})`).join(", ")}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   SETTINGS TAB — its own page (Tab Access + per-league board
   settings), deliberately separate from the draft/research board
   so opening it never shifts or clutters that view.
   ============================================================ */
function SettingsTab({ teamsByLeague, rosterSpotsByLeague, setTeamsFor, setRosterSpotsFor, managersTextByLeague, setManagersForLeague, pool, draftByLeague, onApplyKeepers, canEditKeepers, canEditEspnAccess }) {
  const [keeperLeague, setKeeperLeague] = useState("koi");
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ fontSize:12, opacity:0.65 }}>
        Who can see this board at all, and which of its tabs — is now managed from the{" "}
        <Link to="/admin" style={{ color:"#f0d97a" }}>Admin panel</Link> (gear icon on the landing page), not here.
      </div>

      {BOARD_TABS.map(lg => {
        const teams = teamsByLeague[lg];
        const rosterSpots = rosterSpotsByLeague[lg];
        return (
          <div key={lg} style={panelStyle()}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
              {lg === "koi" ? "Koi — $200 Auction Settings" : `${LEAGUE_LABELS[lg] || lg} — Standard Draft Settings`}
            </div>
            <div style={{ display:"flex", gap:24, flexWrap:"wrap" }}>
              {lg === "koi" && (
                <>
                  <label style={lbl()}>Koi teams
                    <input type="number" min="4" max="20" value={teams}
                      onChange={e=>setTeamsFor("koi", Math.max(4,Number(e.target.value)||DEFAULT_TEAMS.koi))} style={inp(60)} />
                  </label>
                  <label style={lbl()}>Roster spots/team
                    <input type="number" min="10" max="30" value={rosterSpots}
                      onChange={e=>setRosterSpotsFor("koi", Math.max(10,Number(e.target.value)||DEFAULT_ROSTER_SPOTS.koi))} style={inp(60)} />
                  </label>
                  <label style={lbl()}>Auction pool
                    <div style={{...inp(90), display:"flex", alignItems:"center"}}>${teams*200}</div>
                  </label>
                </>
              )}
              <div style={{flex:1, minWidth:220}}>
                <div style={{fontSize:11, opacity:0.7, marginBottom:4}}>
                  {LEAGUE_LABELS[lg] || lg} owners (comma separated)
                </div>
                <input value={managersTextByLeague[lg] || ""}
                  onChange={e=>setManagersForLeague(lg, e.target.value)}
                  style={{...inp("100%"), width:"100%"}} />
              </div>
            </div>
            {lg !== "koi" && (
              <div style={{ fontSize:12, opacity:0.7, marginTop:10 }}>
                Standard snake draft — no auction pool or price tracking here. Mark players drafted and assign
                the owner as picks happen; the Paid column only shows up on the Koi board.
              </div>
            )}
          </div>
        );
      })}

      <div style={panelStyle()}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
          Keepers — bulk-apply a preseason keeper list to a board
        </div>
        <KeeperImportPanel
          league={keeperLeague} setLeague={setKeeperLeague}
          pool={pool} draftByLeague={draftByLeague}
          onApplyKeepers={onApplyKeepers} canEdit={canEditKeepers}
        />
      </div>

      <div style={panelStyle()}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
          ESPN Access — for League History and Game Day (Koi, and Jordan once its league ID is on file)
        </div>
        <EspnAccessPanel canEdit={canEditEspnAccess} />
      </div>

      <div style={{ fontSize:12, opacity:0.65, lineHeight:1.5 }}>
        Want to see or tweak the actual VBD/scoring/projection math? Open the
        <b style={{color:"#f0d97a"}}> "Calculations"</b> tab instead.
      </div>
    </div>
  );
}

function MethodologyTab({ weights, setWeight, replacement, setRep, tierParams, setTierParams, teams, rosterSpots, onReset, pool, playerImports, onApplyImport, onClearImport, isAdmin }) {
  const [section, setSection] = useState("import");
  const totalPool = teams * 200;
  const totalSpots = teams * rosterSpots;
  const sections = [
    ["import","Import Real Data"],
    ["scoring","Scoring formulas"],
    ["replacement","VBD replacement levels"],
    ["tiers","Tier grouping"],
    ["auction","Auction values"],
  ];
  return (
    <div style={{ background:"#15160f", border:"1px solid #262819", borderRadius:12, padding:18 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10, marginBottom:14 }}>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {sections.map(([k,label]) => (
            <button key={k} onClick={()=>setSection(k)} style={{
              padding:"6px 12px", borderRadius:20, fontSize:12, fontWeight:700,
              border:"1px solid " + (section===k ? "#c9a227" : "#33362a"),
              background: section===k ? "#2a2a18" : "transparent", color: section===k ? "#f0d97a" : "#9c998e",
            }}>{label}</button>
          ))}
        </div>
        <button onClick={onReset} style={btnStyle("#3a1f1f","#c0453f")}>Reset all to defaults</button>
      </div>

      {section === "import" && (
        <ImportPanel pool={pool} playerImports={playerImports} onApplyImport={onApplyImport} onClearImport={onClearImport}
          canEdit={isAdmin} />
      )}

      {section === "scoring" && (
        <div>
          <p style={pText()}>
            Every skill-position player (QB/RB/WR/TE) scores off the same formula; only the weights change
            per league. Points = passYds ÷ passYdsPerPt + passTD × passTD − INT × intPenalty + rushYds ÷
            rushYdsPerPt + rushTD × rushTD + rec × recPts + recYds ÷ recYdsPerPt + recTD × recTD −
            fumbles × fumblePenalty. This only applies once a raw stat line has been imported for a player —
            there's no synthetic stat generator anymore, so an unimported player shows blank points rather than
            a fabricated projection. Kickers and defenses skip this formula entirely and take a flat points
            total straight from an import.
          </p>
          <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
            <CurveCard title="Koi (Half-PPR)" values={weights.koi} onSet={(k,v)=>setWeight("koi",k,v)}
              fields={[["passYdsPerPt","Pass yds / pt"],["passTD","Pass TD pts"],["intPenalty","INT penalty"],
                       ["rushYdsPerPt","Rush yds / pt"],["rushTD","Rush TD pts"],["rec","Points / catch"],
                       ["recYdsPerPt","Rec yds / pt"],["recTD","Rec TD pts"],["fumblePenalty","Fumble penalty"]]} />
            <CurveCard title="Final Fantasy (Full PPR)" values={weights.final} onSet={(k,v)=>setWeight("final",k,v)}
              fields={[["passYdsPerPt","Pass yds / pt"],["passTD","Pass TD pts"],["intPenalty","INT penalty"],
                       ["rushYdsPerPt","Rush yds / pt"],["rushTD","Rush TD pts"],["rec","Points / catch"],
                       ["recYdsPerPt","Rec yds / pt"],["recTD","Rec TD pts"],["fumblePenalty","Fumble penalty"]]} />
            <CurveCard title="Jordan" values={weights.jordan} onSet={(k,v)=>setWeight("jordan",k,v)}
              fields={[["passYdsPerPt","Pass yds / pt"],["passTD","Pass TD pts"],["intPenalty","INT penalty"],
                       ["rushYdsPerPt","Rush yds / pt"],["rushTD","Rush TD pts"],["rec","Points / catch"],
                       ["recYdsPerPt","Rec yds / pt"],["recTD","Rec TD pts"],["fumblePenalty","Fumble penalty"]]} />
          </div>
        </div>
      )}

      {section === "replacement" && (
        <div>
          <p style={pText()}>
            VBD (Value Based Drafting) = a player's projected points minus the points of the last "replacement
            level" player at that position — the guy you could still get for free/cheap at the position's floor.
            A shallower number (fewer starters counted) makes a position scarcer and pushes its VBD — and
            therefore its tier breaks and auction dollars — higher.
          </p>
          <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
            <CurveCard title="Koi replacement rank" values={replacement.koi} onSet={(k,v)=>setRep("koi",k,v)}
              fields={[["QB","QB",1],["RB","RB",1],["WR","WR",1],["TE","TE",1],["K","K",1],["DEF","DEF",1]]} />
            <CurveCard title="Final Fantasy replacement rank" values={replacement.final} onSet={(k,v)=>setRep("final",k,v)}
              fields={[["QB","QB",1],["RB","RB",1],["WR","WR",1],["TE","TE",1],["K","K",1],["DEF","DEF",1]]} />
            <CurveCard title="Jordan replacement rank" values={replacement.jordan} onSet={(k,v)=>setRep("jordan",k,v)}
              fields={[["QB","QB",1],["RB","RB",1],["WR","WR",1],["TE","TE",1],["K","K",1],["DEF","DEF",1]]} />
          </div>
        </div>
      )}

      {section === "tiers" && (
        <div>
          <p style={pText()}>
            Within each position, players are sorted by VBD. A new tier starts whenever the VBD gap to the next
            player exceeds <b>max(minGap, |previous player's VBD| × pctGap)</b> — so tier breaks scale with how
            valuable the position is at that point in the board, not a single flat number.
          </p>
          <CurveCard title="Tier threshold" values={tierParams}
            onSet={(k,v)=>setTierParams(t=>({...t,[k]:v}))}
            fields={[["minGap","Min VBD gap"],["pctGap","% of prev VBD",0.01]]} />
        </div>
      )}

      {section === "auction" && (
        <div>
          <p style={pText()}>
            Koi-only. Total pool = teams × $200 = <b>${totalPool}</b>. Every roster spot needs at least a $1 bid,
            so <b>${totalSpots}</b> ({teams} teams × {rosterSpots} spots) is reserved off the top, leaving
            <b> ${Math.max(0,totalPool-totalSpots)}</b> to distribute. Any player with a real projection and VBD
            ≤ 0 is a $1 player. Everyone else with a projection gets: <b>$ = 1 + (player VBD ÷ sum of VBD across
            all VBD&gt;0 players) × remaining pool</b>. A player with no imported projection at all shows a blank
            $ rather than $1 — there's a real difference between "worth the floor" and "not evaluated yet."
            Change teams/roster spots from the Koi board's Settings panel — that's what actually drives this pool.
          </p>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   KEEPER IMPORT — bulk-apply a preseason keeper list (player,
   manager, value) to a specific league's draft board. Reuses the
   exact same draftByLeague shape as manual entry and Sleeper sync
   (drafted/manager/paid) — a keeper is just a pick that happened
   before the draft, pre-filled rather than typed in live. This
   doesn't compute what a keeper SHOULD cost (server/keepers.js has
   that formula, not wired to a UI yet) — it applies costs you've
   already decided.
   ============================================================ */
function KeeperImportPanel({ league, setLeague, pool, draftByLeague, onApplyKeepers, canEdit }) {
  const [pasteText, setPasteText] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [map, setMap] = useState({ name: -1, manager: -1, value: -1 });
  const [result, setResult] = useState(null);

  const nameIndex = useMemo(() => {
    const idx = {};
    for (const p of pool) idx[normName(p.name)] = p;
    return idx;
  }, [pool]);

  const loadText = (text) => {
    const parsed = parseCSV(text).filter(r => r.some(c => c.trim() !== ""));
    if (!parsed.length) return;
    const hdrs = parsed[0];
    const findCol = (patterns) => hdrs.findIndex(h => patterns.some(p => h.toLowerCase().replace(/[^a-z0-9]/g,"").includes(p)));
    setHeaders(hdrs);
    setRows(parsed.slice(1));
    setMap({
      name: findCol(["player","name"]),
      manager: findCol(["manager","owner","team"]),
      value: findCol(["value","price","paid","cost","amount","$"]),
    });
    setResult(null);
  };
  const addFile = (fileList) => {
    const file = fileList[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => loadText(String(e.target.result || ""));
    reader.readAsText(file);
  };
  const updateMap = (key, value) => setMap(m => ({ ...m, [key]: value }));

  const preview = useMemo(() => {
    if (map.name < 0) return [];
    const leagueDraft = draftByLeague[league] || {};
    return rows.map(row => {
      const rawName = row[map.name];
      const player = rawName ? nameIndex[normName(rawName)] : null;
      const manager = map.manager >= 0 ? String(row[map.manager] || "").trim() : "";
      const valueRaw = map.value >= 0 ? row[map.value] : null;
      const value = valueRaw != null && String(valueRaw).trim() !== ""
        ? parseFloat(String(valueRaw).replace(/[^0-9.\-]/g,"")) : null;
      const existing = player ? leagueDraft[player.id] : null;
      return { rawName, player, manager, value, alreadyDrafted: !!(existing && existing.drafted && !existing.viaKeeper) };
    });
  }, [rows, map, nameIndex, draftByLeague, league]);

  const validRows = preview.filter(r => r.player && r.manager);
  const unmatchedRows = preview.filter(r => rows.length && !r.player && (map.name >= 0));
  const conflictRows = validRows.filter(r => r.alreadyDrafted);

  const apply = () => {
    const patchMap = {};
    const newManagers = [];
    for (const r of validRows) {
      patchMap[r.player.id] = {
        drafted: true, manager: r.manager,
        paid: r.value != null ? String(r.value) : "",
        viaKeeper: true,
      };
      if (!newManagers.includes(r.manager)) newManagers.push(r.manager);
    }
    onApplyKeepers(league, patchMap, newManagers);
    setResult({ applied: validRows.length });
    setPasteText(""); setHeaders([]); setRows([]);
  };

  return (
    <div>
      <p style={pText()}>
        Import a preseason keeper list — one row per kept player, with who they belong to and what they cost
        (dollar value for Koi, whatever your league tracks for a snake draft — it's stored either way, just
        only shown as a $ on the Koi board). <b>Apply Keepers</b> marks each matched player drafted, assigns
        the manager, sets the price, and adds any new manager names to this league's owner list — exactly as
        if you'd entered them by hand. This is for applying costs you've already decided, not calculating them.
      </p>

      <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:14, flexWrap:"wrap" }}>
        <label style={lbl()}>League
          <select value={league} onChange={e=>setLeague(e.target.value)} style={inp(160)}>
            <option value="koi">Koi</option>
            <option value="final">Final Fantasy</option>
            <option value="jordan">Jordan</option>
          </select>
        </label>
      </div>

      {!canEdit && (
        <div style={{ ...pText(), background:"#181910", border:"1px solid #2a2c20", borderRadius:8, padding:12, marginBottom:14 }}>
          Only <b style={{color:"#f0d97a"}}>Will</b> can apply a keeper list — everyone else sees the resulting
          board once it's applied.
        </div>
      )}

      {canEdit && (
        <>
          <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap", marginBottom:14 }}>
            <label style={{...btnStyle("#20211a","#c9a227"), display:"inline-block", cursor:"pointer"}}>
              + Add file
              <input type="file" accept=".csv,text/csv" onChange={e => e.target.files.length && addFile(e.target.files)}
                style={{ display:"none" }} />
            </label>
            <span style={{ fontSize:11, opacity:0.5 }}>or paste CSV below</span>
          </div>
          <div style={{ display:"flex", gap:8, marginBottom:18 }}>
            <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)}
              placeholder="Player,Manager,Value&#10;Nico Collins,Will,42&#10;Kyren Williams,Sarah,38"
              rows={3} style={{...ta(), flex:1}} />
            <button onClick={()=>{ if (pasteText.trim()) loadText(pasteText); }} style={btnStyle()}>Load</button>
          </div>

          {headers.length > 0 && (
            <div style={{ background:"#0f100b", border:"1px solid #262819", borderRadius:8, padding:12, marginBottom:14 }}>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:12 }}>
                <ColMap label="Player name" value={map.name} set={v=>updateMap("name",v)} headers={headers} compact />
                <ColMap label="Manager" value={map.manager} set={v=>updateMap("manager",v)} headers={headers} compact />
                <ColMap label="Value" value={map.value} set={v=>updateMap("value",v)} headers={headers} compact />
              </div>

              <div style={{ fontSize:12, marginBottom:8 }}>
                <b style={{color:"#7fd18f"}}>{validRows.length}</b> matched
                {unmatchedRows.length > 0 && <> · <b style={{color:"#e08a8a"}}>{unmatchedRows.length}</b> unmatched:{" "}
                  {unmatchedRows.map(r=>r.rawName).join(", ")}</>}
              </div>
              {conflictRows.length > 0 && (
                <div style={{ fontSize:12, color:"#c9a227", marginBottom:8 }}>
                  {conflictRows.length} already marked drafted by someone else — applying will overwrite:{" "}
                  {conflictRows.map(r=>`${r.player.name} (currently ${draftByLeague[league][r.player.id].manager || "?"})`).join(", ")}
                </div>
              )}
              <table style={{ width:"100%", fontSize:12, marginBottom:12 }}>
                <thead>
                  <tr style={{ opacity:0.6, textAlign:"left" }}>
                    <th style={{padding:"2px 6px"}}>Player</th><th style={{padding:"2px 6px"}}>Manager</th><th style={{padding:"2px 6px"}}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r,i) => (
                    <tr key={i} style={{ opacity: r.player && r.manager ? 1 : 0.5 }}>
                      <td style={{padding:"2px 6px"}}>{r.player ? r.player.name : `${r.rawName} (no match)`}</td>
                      <td style={{padding:"2px 6px"}}>{r.manager || "—"}</td>
                      <td style={{padding:"2px 6px"}}>{r.value != null ? r.value : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={apply} disabled={!validRows.length} style={btnStyle("#20211a","#c9a227")}>
                Apply Keepers ({validRows.length})
              </button>
            </div>
          )}
        </>
      )}

      {result && (
        <div style={{ fontSize:12.5, color:"#7fd18f", fontWeight:700 }}>
          Applied {result.applied} keeper{result.applied===1?"":"s"} to the {LEAGUE_LABELS[league] || league} board.
        </div>
      )}
    </div>
  );
}

/* ============================================================
   ESPN ACCESS — espn_s2/SWID cookies for League History (server/espn.js)
   and the ESPN side of Game Day. Stored via the same shared /api/storage
   mechanism as everything else in this app (window.storage — always
   resolves to a single shared record, see storagePolyfill.js), read
   directly by the server for its own outbound ESPN calls. Only ever
   needed for seasons ESPN gates behind auth even on a public league
   (verified: 2018-2023 for Koi) — recent seasons work with nothing set.
   ============================================================ */
function EspnAccessPanel({ canEdit }) {
  const [espnS2, setEspnS2] = useState("");
  const [swid, setSwid] = useState("");
  const [hasStored, setHasStored] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.storage.get("espn-cookies").then(res => {
      if (!res || !res.value) return;
      try {
        const parsed = JSON.parse(res.value);
        setHasStored(!!(parsed.espn_s2 && parsed.swid));
      } catch (e) { /* ignore */ }
    });
  }, []);

  const save = () => {
    if (!espnS2.trim() || !swid.trim()) return;
    window.storage.set("espn-cookies", JSON.stringify({ espn_s2: espnS2.trim(), swid: swid.trim() })).then(() => {
      setHasStored(true);
      setSaved(true);
      setEspnS2(""); setSwid("");
    });
  };

  return (
    <div>
      <p style={pText()}>
        These are your ESPN session cookies (<code>espn_s2</code> and <code>SWID</code>) — grab them from your
        browser's dev tools (Application/Storage → Cookies → espn.com) while logged into ESPN. Only needed for
        older seasons; recent Koi history and live scores already work without them since the league is
        currently public.
      </p>
      <div style={{ fontSize:12, marginBottom:12 }}>
        Status: <b style={{ color: hasStored ? "#7fd18f" : "#9c998e" }}>{hasStored ? "Cookies are set" : "Not set"}</b>
      </div>
      {!canEdit ? (
        <div style={{ ...pText(), background:"#181910", border:"1px solid #2a2c20", borderRadius:8, padding:12, marginBottom:0 }}>
          Only <b style={{color:"#f0d97a"}}>Will</b> can set these.
        </div>
      ) : (
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-end" }}>
          <label style={lbl()}>espn_s2
            <input type="password" value={espnS2} onChange={e=>{ setEspnS2(e.target.value); setSaved(false); }}
              placeholder={hasStored ? "•••••••• (set — paste to replace)" : "paste value"} style={inp(320)} />
          </label>
          <label style={lbl()}>SWID
            <input type="password" value={swid} onChange={e=>{ setSwid(e.target.value); setSaved(false); }}
              placeholder={hasStored ? "•••••••• (set — paste to replace)" : "{XXXXXXXX-XXXX-...}"} style={inp(220)} />
          </label>
          <button onClick={save} disabled={!espnS2.trim() || !swid.trim()} style={btnStyle("#20211a","#c9a227")}>Save</button>
          {saved && <span style={{ fontSize:12, color:"#7fd18f" }}>Saved.</span>}
        </div>
      )}
    </div>
  );
}

function ImportPanel({ pool, playerImports, onApplyImport, onClearImport, canEdit }) {
  const [batches, setBatches] = useState([]); // {id, label, headers, data, map:{...}}
  const [pasteText, setPasteText] = useState("");
  const [result, setResult] = useState(null); // {matched, unmatched: []}

  const nameIndex = useMemo(() => {
    const idx = {};
    for (const p of pool) idx[normName(p.name)] = p;
    return idx;
  }, [pool]);

  const guessMap = (headers) => {
    const findCol = (patterns) => {
      return headers.findIndex(h => patterns.some(p => h.toLowerCase().replace(/[^a-z0-9]/g,"").includes(p)));
    };
    return {
      name: findCol(["player","name"]),
      passYds: findCol(["passyds","passingyds","pyds"]),
      passTD: findCol(["passtd","passingtd","ptd"]),
      INT: findCol(["int","interception"]),
      rushYds: findCol(["rushyds","rushingyds","ryds"]),
      rushTD: findCol(["rushtd","rushingtd","rtd"]),
      rec: findCol(["receptions","rec","catches"]),
      recYds: findCol(["recyds","receivingyds","reyds"]),
      recTD: findCol(["rectd","receivingtd","retd"]),
      fumbles: findCol(["fumbleslost","fuml","fumbles"]),
      koiPoints: findCol(["halfppr","koi"]),
      finalPoints: findCol(["fullppr","pprpts","fpts","fantasypoints","points","proj"]),
      auction: findCol(["auction","dollar","aav","$"]),
      tier: findCol(["tier"]),
      posRank: findCol(["posrank","positionrank","posrk"]),
      risk: findCol(["risk"]),
      upside: findCol(["upside","ceiling"]),
      outlook: findCol(["writeup","outlook","blurb","summary","analysis","notes","comment"]),
      bye: findCol(["byeweek","bye"]),
    };
  };

  const addBatchFromText = (text, label) => {
    const rows = parseCSV(text).filter(r => r.some(c => c.trim() !== ""));
    if (!rows.length) return;
    const headers = rows[0];
    const data = rows.slice(1);
    setBatches(b => [...b, { id: `${Date.now()}-${Math.random()}`, label, headers, data, map: guessMap(headers) }]);
  };

  const addFiles = (fileList) => {
    Array.from(fileList).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => addBatchFromText(String(e.target.result || ""), file.name);
      reader.readAsText(file);
    });
  };

  const updateBatchMap = (id, key, value) => {
    setBatches(b => b.map(x => x.id === id ? { ...x, map: { ...x.map, [key]: value } } : x));
  };
  const removeBatch = (id) => setBatches(b => b.filter(x => x.id !== id));

  const applyAll = () => {
    const overrides = {};
    const unmatched = [];
    let matched = 0;
    const importTimestamp = new Date().toISOString();
    for (const batch of batches) {
      const nameCol = batch.map.name;
      if (nameCol == null || nameCol < 0) continue;
      const cols = batch.map;
      const num = (row, i) => {
        if (i < 0 || row[i] == null) return null;
        const v = parseFloat(String(row[i]).replace(/[^0-9.\-]/g,""));
        return isNaN(v) ? null : v;
      };
      const str = (row, i) => {
        if (i < 0 || row[i] == null) return null;
        const s = String(row[i]).trim();
        return s === "" ? null : s;
      };
      for (const row of batch.data) {
        const rawName = row[nameCol];
        if (!rawName || !rawName.trim()) continue;
        const player = nameIndex[normName(rawName)];
        if (!player) { unmatched.push(`${rawName} (${batch.label})`); continue; }

        const statsFields = {};
        ["passYds","passTD","INT","rushYds","rushTD","rec","recYds","recTD","fumbles"].forEach(k => {
          const v = num(row, cols[k]);
          if (v != null) statsFields[k] = v;
        });
        const koiPts = num(row, cols.koiPoints);
        const finalPts = num(row, cols.finalPoints);
        const auc = num(row, cols.auction);
        const tierVal = num(row, cols.tier);
        const posRankVal = str(row, cols.posRank);
        const riskVal = str(row, cols.risk);
        const upsideVal = str(row, cols.upside);
        const outlookVal = str(row, cols.outlook);
        const byeVal = num(row, cols.bye);

        const entry = {};
        if (player.pos === "K" || player.pos === "DEF") {
          const flat = koiPts != null ? koiPts : finalPts;
          if (flat != null) entry.flatPtsOverride = flat;
        } else {
          if (Object.keys(statsFields).length) entry.statsOverride = statsFields;
          if (koiPts != null) entry.koiPoints = koiPts;
          if (finalPts != null) entry.finalPoints = finalPts;
        }
        if (auc != null) entry.auction = auc;
        if (tierVal != null) entry.tier = tierVal;
        if (posRankVal != null) entry.posRank = posRankVal;
        if (riskVal != null) entry.risk = riskVal;
        if (upsideVal != null) entry.upside = upsideVal;
        if (outlookVal != null) entry.outlook = outlookVal;
        if (byeVal != null) entry.bye = byeVal;
        if (!Object.keys(entry).length) continue;
        const fieldsTouched = Object.keys(entry).filter(k => k !== "statsOverride")
          .concat(entry.statsOverride ? Object.keys(entry.statsOverride) : []);

        // merge across batches so a QB file and (say) a K/DEF file both feeding the same run don't clobber each other
        const prior = overrides[player.id] || {};
        overrides[player.id] = {
          ...prior, ...entry,
          statsOverride: (prior.statsOverride || entry.statsOverride)
            ? { ...(prior.statsOverride||{}), ...(entry.statsOverride||{}) }
            : undefined,
          sources: [...(prior.sources || []), { label: batch.label, date: importTimestamp, fields: fieldsTouched }],
        };
        matched++;
      }
    }
    onApplyImport(overrides);
    setResult({ matched, unmatched });
    setBatches([]);
  };

  const importCount = Object.keys(playerImports).length;

  return (
    <div>
      <p style={pText()}>
        Drop in as many files as you want — one per position, or however your export is split — without merging
        them yourself first. Each file gets its own column mapping (a QB file and a WR file won't share columns),
        then <b>Apply All Imports</b> matches every row across every file by player name and merges it all into
        the same universal player pool. Raw stats (pass/rush/rec yards, TDs, INT, receptions, fumbles lost) drive both Koi and
        Final Fantasy through their own scoring formulas; point-total columns are a fallback if a file doesn't
        have raw stats. You can also import a separate rankings/write-up file per position — map its Tier,
        Position Rank, Risk, Upside, Bye Week, and Write-up columns and they'll combine with whatever you already imported
        from a projections file for the same player. Imported tiers/ranks/bye weeks take priority over the model's
        computed or default values, and an imported write-up replaces the shared <b>Expert Notes</b> field for
        everyone. <b>Personal Notes</b> works differently — it's blank by default and edited directly on the board,
        not through import, and each person's own edits there stay on their profile even after a re-import.
      </p>

      {!canEdit && (
        <div style={{ ...pText(), background:"#181910", border:"1px solid #2a2c20", borderRadius:8, padding:12, marginBottom:14 }}>
          Only <b style={{color:"#f0d97a"}}>Will</b> can upload or clear projection files — everyone else sees
          whatever's currently imported (it drives the points/VBD/tiers/auction values on every board already),
          but the upload controls only show up when you're viewing as Will.
        </div>
      )}

      <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:14, flexWrap:"wrap" }}>
        <span style={{ fontSize:11, opacity:0.6 }}>
          {importCount > 0 ? `${importCount} players currently have imported data` : "No import applied yet"}
        </span>
        {canEdit && importCount > 0 && (
          <button onClick={()=>{ onClearImport(); setResult(null); }} style={btnStyle("#3a1f1f","#c0453f")}>Clear all imports</button>
        )}
      </div>

      {canEdit && (
      <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap", marginBottom:14 }}>
        <label style={{...btnStyle("#20211a","#c9a227"), display:"inline-block", cursor:"pointer"}}>
          + Add file(s)
          <input type="file" accept=".csv,text/csv" multiple onChange={e => e.target.files.length && addFiles(e.target.files)}
            style={{ display:"none" }} />
        </label>
        <span style={{ fontSize:11, opacity:0.5 }}>or paste one CSV below and add it as a file</span>
      </div>
      )}

      {canEdit && (
      <div style={{ display:"flex", gap:8, marginBottom:18 }}>
        <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)}
          placeholder="Paste one file's CSV text here (e.g. just the RB export)..."
          rows={3} style={{...ta(), flex:1}} />
        <button onClick={()=>{ if (pasteText.trim()) { addBatchFromText(pasteText, `Pasted ${batches.length+1}`); setPasteText(""); } }}
          style={btnStyle()}>Add as file</button>
      </div>
      )}

      {canEdit && batches.length > 0 && (
        <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:14 }}>
          {batches.map(batch => (
            <div key={batch.id} style={{ background:"#0f100b", border:"1px solid #262819", borderRadius:8, padding:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#f0d97a" }}>
                  {batch.label} — {batch.data.length} rows
                </div>
                <button onClick={()=>removeBatch(batch.id)} style={btnStyle("#3a1f1f","#c0453f")}>Remove</button>
              </div>
              <ColMap label="Player name (required)" value={batch.map.name} set={v=>updateBatchMap(batch.id,"name",v)} headers={batch.headers} />
              <div style={{ fontSize:11, fontWeight:700, opacity:0.7, margin:"10px 0 4px" }}>Raw stats (drives both leagues)</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                <ColMap label="Pass yds" value={batch.map.passYds} set={v=>updateBatchMap(batch.id,"passYds",v)} headers={batch.headers} compact />
                <ColMap label="Pass TD" value={batch.map.passTD} set={v=>updateBatchMap(batch.id,"passTD",v)} headers={batch.headers} compact />
                <ColMap label="INT" value={batch.map.INT} set={v=>updateBatchMap(batch.id,"INT",v)} headers={batch.headers} compact />
                <ColMap label="Rush yds" value={batch.map.rushYds} set={v=>updateBatchMap(batch.id,"rushYds",v)} headers={batch.headers} compact />
                <ColMap label="Rush TD" value={batch.map.rushTD} set={v=>updateBatchMap(batch.id,"rushTD",v)} headers={batch.headers} compact />
                <ColMap label="Receptions" value={batch.map.rec} set={v=>updateBatchMap(batch.id,"rec",v)} headers={batch.headers} compact />
                <ColMap label="Rec yds" value={batch.map.recYds} set={v=>updateBatchMap(batch.id,"recYds",v)} headers={batch.headers} compact />
                <ColMap label="Rec TD" value={batch.map.recTD} set={v=>updateBatchMap(batch.id,"recTD",v)} headers={batch.headers} compact />
                <ColMap label="Fumbles lost" value={batch.map.fumbles} set={v=>updateBatchMap(batch.id,"fumbles",v)} headers={batch.headers} compact />
              </div>
              <div style={{ fontSize:11, fontWeight:700, opacity:0.7, margin:"10px 0 4px" }}>
                Fallback: direct point totals (also drives K/DEF)
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                <ColMap label="Half-PPR / Koi pts" value={batch.map.koiPoints} set={v=>updateBatchMap(batch.id,"koiPoints",v)} headers={batch.headers} compact />
                <ColMap label="Full PPR / Final pts" value={batch.map.finalPoints} set={v=>updateBatchMap(batch.id,"finalPoints",v)} headers={batch.headers} compact />
              </div>
              <div style={{ fontSize:11, fontWeight:700, opacity:0.7, margin:"10px 0 4px" }}>Koi auction $ (optional)</div>
              <ColMap label="Auction $" value={batch.map.auction} set={v=>updateBatchMap(batch.id,"auction",v)} headers={batch.headers} compact />
              <div style={{ fontSize:11, fontWeight:700, opacity:0.7, margin:"10px 0 4px" }}>
                Rankings & write-up (optional — e.g. a separate FFB rankings export)
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                <ColMap label="Tier" value={batch.map.tier} set={v=>updateBatchMap(batch.id,"tier",v)} headers={batch.headers} compact />
                <ColMap label="Position rank" value={batch.map.posRank} set={v=>updateBatchMap(batch.id,"posRank",v)} headers={batch.headers} compact />
                <ColMap label="Risk" value={batch.map.risk} set={v=>updateBatchMap(batch.id,"risk",v)} headers={batch.headers} compact />
                <ColMap label="Upside" value={batch.map.upside} set={v=>updateBatchMap(batch.id,"upside",v)} headers={batch.headers} compact />
                <ColMap label="Write-up / outlook" value={batch.map.outlook} set={v=>updateBatchMap(batch.id,"outlook",v)} headers={batch.headers} compact />
                <ColMap label="Bye week" value={batch.map.bye} set={v=>updateBatchMap(batch.id,"bye",v)} headers={batch.headers} compact />
              </div>
            </div>
          ))}
          <button onClick={applyAll} style={{...btnStyle("#20211a","#c9a227"), alignSelf:"flex-start"}}>
            Apply All Imports ({batches.length} file{batches.length===1?"":"s"})
          </button>
        </div>
      )}

      {result && (
        <div style={{ marginTop:6, fontSize:12.5 }}>
          <div style={{ color:"#7fd18f", fontWeight:700, marginBottom:4 }}>Matched {result.matched} rows across all files.</div>
          {result.unmatched.length > 0 && (
            <div style={{ opacity:0.75 }}>
              Unmatched ({result.unmatched.length}): {result.unmatched.slice(0,40).join(", ")}
              {result.unmatched.length > 40 ? "…" : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
function ColMap({ label, value, set, headers, compact }) {
  const counts = {};
  for (const h of headers) counts[h] = (counts[h] || 0) + 1;
  const seen = {};
  return (
    <label style={{ display:"flex", flexDirection:"column", gap:2, fontSize:11, opacity:0.85, width: compact ? 150 : "100%", marginBottom: compact ? 0 : 6 }}>
      <span style={{ opacity:0.65 }}>{label}</span>
      <select value={value != null && value >= 0 ? value : ""} onChange={e=>set(e.target.value === "" ? -1 : Number(e.target.value))} style={inp("100%")}>
        <option value="">— none —</option>
        {headers.map((h, i) => {
          seen[h] = (seen[h] || 0) + 1;
          const displayLabel = counts[h] > 1 ? `${h} (col ${i + 1}, "${h}" #${seen[h]})` : h;
          return <option key={i} value={i}>{displayLabel}</option>;
        })}
      </select>
    </label>
  );
}




// btnStyle/panelStyle/lbl/lblSmall/pText/inp/ta/th/td/SortTh/badgeSup now
// live in ./theme.jsx (shared with the other pages — landing/gameday/history).
