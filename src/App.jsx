import React, { useState, useEffect, useMemo, useCallback } from "react";

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


const OUTLOOK_STYLE = {
  green:  { bg:"#1c3a2a", border:"#3f9e5e", label:"Green — go get him" },
  yellow: { bg:"#3a3418", border:"#c9a227", label:"Yellow — proceed with caution" },
  red:    { bg:"#3a1f1f", border:"#c0453f", label:"Red — stay away" },
  pink:   { bg:"#3a1f30", border:"#d162a4", label:"Pink — late flyer" },
  purple: { bg:"#241a3a", border:"#8a63d1", label:"Purple — ignore" },
};
const POS_COLORS = { QB:"#d162a4", RB:"#3f9e5e", WR:"#4f8fd1", TE:"#c9a227", K:"#9a9a9a", DEF:"#c0453f" };
const LEAGUE_LABELS = { koi:"Koi", final:"Final Fantasy", jordan:"Jordan" };
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
const TAB_LABELS_SHORT = { koi: "Koi", final: "Final Fantasy", jordan: "Jordan", how: "Calculations", settings: "Settings" };

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
   PERSONAL NOTES — the one thing that stays per "Viewing as" user
   rather than in the single shared record everything else lives in
   (draft picks, league settings, and — importantly — the imported
   base notes themselves, which only Will can upload). A user's own
   inline edit/addition on a player's note sticks to their profile
   and survives Will re-uploading the shared base notes later.
   Hits /api/notes (per-user), not /api/storage (shared, see
   storagePolyfill.js) — same underlying user_kv table, different
   route so the two scopes can't get confused.
   ============================================================ */
async function getPersonalNotes(user) {
  try {
    const res = await fetch(`/api/notes/ffb-notes-overrides?user=${encodeURIComponent(user)}`);
    if (!res.ok) return null;
    return await res.json(); // {key, value}
  } catch (e) { return null; }
}
async function setPersonalNotes(user, value) {
  try {
    await fetch(`/api/notes/ffb-notes-overrides?user=${encodeURIComponent(user)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
  } catch (e) { /* best effort — local state already updated for this session */ }
}

export default function DraftPrepApp() {
  const [users, setUsers] = useState([{ name: "Will" }]); // [{id,name}] — who can be picked in the header
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
  const [expanded, setExpanded] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/users").then(res => (res.ok ? res.json() : null)).then(list => {
      if (list && list.length) setUsers(list);
    }).catch(() => {}); // never blocks the app — solo/"Will" use works with no server round-trip
  }, []);

  useEffect(() => {
    fetch("/api/players").then(res => (res.ok ? res.json() : null)).then(list => {
      if (list && list.length) setAdpPool(list);
    }).catch(() => {}); // board just shows empty until the server's next successful ADP refresh
  }, []);

  // Who's currently signed in (see "Viewing as" below) and which tabs
  // they're allowed to see. Defaults to all tabs — for the built-in "Will"
  // user before /api/users resolves, and for anyone with no restriction set.
  const currentUserName = (typeof localStorage !== "undefined" && localStorage.getItem("ffb-user")) || "Will";
  const currentUser = users.find(u => u.name === currentUserName);
  const allowedTabs = (currentUser && currentUser.allowedTabs && currentUser.allowedTabs.length)
    ? currentUser.allowedTabs : ALL_TABS;

  // If the active tab isn't (or is no longer) allowed for this user, bump
  // them to their first allowed tab instead of showing a tab they can't see.
  useEffect(() => {
    if (!allowedTabs.includes(view)) setView(allowedTabs[0] || "koi");
  }, [allowedTabs, view]);

  const updateUserTabs = useCallback(async (userId, tabs) => {
    setUsers(list => list.map(u => u.id === userId ? { ...u, allowedTabs: tabs } : u));
    try {
      await fetch(`/api/users/${userId}/tabs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabs }),
      });
    } catch (e) { /* local state already updated for this session; server may retry on next load */ }
  }, []);
  const toggleUserTab = useCallback((user, tabKey) => {
    const current = (user.allowedTabs && user.allowedTabs.length) ? user.allowedTabs : ALL_TABS;
    const has = current.includes(tabKey);
    if (has && current.length === 1) return; // at least one tab has to stay visible
    const next = has ? current.filter(t => t !== tabKey) : [...current, tabKey];
    updateUserTabs(user.id, next.length === ALL_TABS.length ? null : next);
  }, [updateUserTabs]);

  useEffect(() => {
    (async () => {
      const [d, leagueRows, personalNotes] = await Promise.all([
        window.storage.get("ffb-draft-state").catch(() => null),
        fetch("/api/leagues").then(res => (res.ok ? res.json() : [])).catch(() => []),
        getPersonalNotes(currentUserName),
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
            setPersonalNotes(currentUserName, JSON.stringify(parsed.notesOverride));
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
      weights, replacement, tierParams, playerImports,
    });
    window.storage.set("ffb-draft-state", payload).catch(() => {});
  }, [draftByLeague, managersByLeague, teamsByLeague, rosterSpotsByLeague, weights, replacement, tierParams, playerImports, loaded]);

  // Personal notes save separately, per "Viewing as" user — see getPersonalNotes/
  // setPersonalNotes above for why this isn't part of the shared payload.
  useEffect(() => {
    if (!loaded) return;
    setPersonalNotes(currentUserName, JSON.stringify(notesOverride));
  }, [notesOverride, loaded, currentUserName]);

  const pool = useMemo(() => buildPool(adpPool), [adpPool]);
  const poolFinal = useMemo(() => pool.map(p => {
    const imp = playerImports[p.id];
    if (!imp) return p;
    const hasImport = !!(imp.statsOverride || imp.flatPtsOverride != null || imp.koiPoints != null || imp.finalPoints != null
      || imp.tier != null || imp.posRank != null || imp.risk != null || imp.upside != null || imp.outlook != null || imp.bye != null);
    return {
      ...p,
      stats: imp.statsOverride ? { ...(p.stats || {}), ...imp.statsOverride } : p.stats,
      flatPts: imp.flatPtsOverride != null ? imp.flatPtsOverride : p.flatPts,
      note: imp.outlook != null ? { ...p.note, pos: imp.outlook } : p.note,
      tierOverride: imp.tier != null ? imp.tier : null,
      posRankOverride: imp.posRank != null ? imp.posRank : null,
      risk: imp.risk != null ? imp.risk : null,
      upside: imp.upside != null ? imp.upside : null,
      outlookImported: imp.outlook != null,
      bye: imp.bye != null ? imp.bye : p.bye,
      byeImported: imp.bye != null,
      imported: hasImport,
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
      posRankImported: p.posRankOverride != null,
      tier: p.tierOverride != null ? p.tierOverride : tiers[p.id],
      tierImported: p.tierOverride != null,
      auction: auctionValues[p.id],
      auctionImported: koiAuctionOverrides[p.id] != null,
      pts: fields[p.id].pts,
      ptsImported: !!p.imported,
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
  // Sleeper sync always targets Final Fantasy specifically, regardless of
  // which tab is currently active — unlike setDraftField above, which
  // closes over whichever league the user is currently viewing.
  const mergeSyncedFinalPicks = useCallback((patchMap) => {
    setDraftByLeague(all => {
      const cur = all.final || {};
      const merged = { ...cur };
      for (const id in patchMap) {
        merged[id] = { ...(merged[id] || {drafted:false,manager:"",paid:""}), ...patchMap[id] };
      }
      return { ...all, final: merged };
    });
  }, []);
  const addManagersForFinal = useCallback((names) => {
    if (!names.length) return;
    setManagersByLeague(all => {
      const merged = [...new Set([...(all.final || []), ...names])];
      return { ...all, final: merged };
    });
    setManagersTextByLeague(all => {
      const curList = (all.final || "").split(",").map(s=>s.trim()).filter(Boolean);
      const merged = [...new Set([...curList, ...names])];
      return { ...all, final: merged.join(", ") };
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
          <div style={{ fontSize:11, letterSpacing:3, color:"#c9a227", fontWeight:700 }}>WILL'S FANTASY FOOTBALL</div>
          <h1 style={{ margin:"2px 0 0", fontSize:32, fontWeight:800, letterSpacing:0.5 }}>Draft Prep Board — 2026</h1>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
          <label style={{...lbl(), flexDirection:"row", alignItems:"center", gap:6}}>
            <span style={{opacity:0.65}}>Viewing as</span>
            <select
              value={(typeof localStorage !== "undefined" && localStorage.getItem("ffb-user")) || "Will"}
              onChange={async e => {
                const val = e.target.value;
                let name = val;
                if (val === "__new__") {
                  name = (prompt("New user's name?") || "").trim();
                  if (!name) return;
                  try {
                    await fetch("/api/users", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name }),
                    });
                  } catch (err) { /* server get-or-creates it on the next request anyway */ }
                }
                localStorage.setItem("ffb-user", name);
                window.location.reload(); // simplest correct way to re-run every load effect against the new user
              }}
              style={inp(140)}
            >
              {users.map(u => <option key={u.id ?? u.name} value={u.name}>{u.name}</option>)}
              <option value="__new__">+ New user…</option>
            </select>
          </label>
          {BOARD_TABS.includes(view) && (
            <div style={{ display:"flex", gap:8 }}>
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
          onMergePicks={mergeSyncedFinalPicks}
          onAddManagers={addManagersForFinal}
        />
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
          currentUserName={currentUserName}
        />
      ) : view === "settings" ? (
        <SettingsTab
          users={users} toggleUserTab={toggleUserTab}
          teamsByLeague={teamsByLeague} rosterSpotsByLeague={rosterSpotsByLeague}
          setTeamsFor={setTeamsFor} setRosterSpotsFor={setRosterSpotsFor}
          managersTextByLeague={managersTextByLeague} setManagersForLeague={setManagersForLeague}
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
                  {league==="koi" && <th style={th()}>Paid</th>}
                  <th style={th()}>Manager</th>
                  <SortTh label="Risk" col="risk" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Upside" col="upside" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Outlook" col="outlook" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const style = OUTLOOK_STYLE[r.noteData.outlook] || OUTLOOK_STYLE.yellow;
                  const isOpen = expanded === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <tr style={{ opacity: r.d.drafted ? 0.45 : 1, cursor:"pointer" }}
                          onClick={()=>setExpanded(isOpen ? null : r.id)}>
                        <td style={td()} onClick={e=>e.stopPropagation()}>
                          <input type="checkbox" checked={!!r.d.drafted}
                            onChange={e=>setDraftField(r.id,{drafted:e.target.checked})} />
                        </td>
                        <td style={td()}>{r.tier ?? "—"}{r.tierImported && <sup style={badgeSup()}>FFB</sup>}</td>
                        <td style={{...td(), color:POS_COLORS[r.pos], fontWeight:700}}>{r.pos}</td>
                        <td style={{...td("left"), fontWeight:600}}>{r.name}</td>
                        <td style={td()}>{r.team}</td>
                        <td style={td()}>{r.bye}{r.byeImported && <sup style={badgeSup()}>FFB</sup>}</td>
                        <td style={td()}>{r.adpRank}</td>
                        <td style={td()}>{r.posRank == null ? "—" : (/[A-Za-z]/.test(String(r.posRank)) ? r.posRank : `${r.pos}${r.posRank}`)}{r.posRankImported && <sup style={badgeSup()}>FFB</sup>}</td>
                        <td style={td()}>{r.pts != null ? r.pts.toFixed(1) : "—"}{r.ptsImported && <sup style={badgeSup()}>FFB</sup>}</td>
                        <td style={{...td(), color: r.vbd == null ? "#7c7a6d" : (r.vbd>=0 ? "#7fd18f" : "#e08a8a")}}>{r.vbd != null ? r.vbd.toFixed(1) : "—"}</td>
                        {league==="koi" && <td style={{...td(), fontWeight:700}}>{r.auction != null ? `$${r.auction}` : "—"}{r.auctionImported && <sup style={badgeSup()}>FFB</sup>}</td>}
                        {league==="koi" && (
                          <td style={td()} onClick={e=>e.stopPropagation()}>
                            <input type="number" placeholder="$" value={r.d.paid}
                              onChange={e=>setDraftField(r.id,{paid:e.target.value})} style={inp(50)} />
                          </td>
                        )}
                        <td style={td()} onClick={e=>e.stopPropagation()}>
                          <select value={r.d.manager} onChange={e=>setDraftField(r.id,{manager:e.target.value})} style={inp(100)}>
                            <option value=""></option>
                            {managers.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                          {league==="final" && r.d.syncedFromSleeper && <sup style={badgeSup()} title="Auto-filled from Sleeper">SLP</sup>}
                        </td>
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
                                <div style={lblSmall("#7fd18f")}>Expert Notes{r.outlookImported && <sup style={badgeSup()}>FFB</sup>}</div>
                                <textarea value={r.noteData.pos} onChange={e=>setNote(r.id,{pos:e.target.value}, r.note)}
                                  style={ta()} rows={2} />
                              </div>
                              <div style={{ flex:"1 1 320px" }}>
                                <div style={lblSmall("#e08a8a")}>Personal Notes</div>
                                <textarea value={r.noteData.neg} onChange={e=>setNote(r.id,{neg:e.target.value}, r.note)}
                                  style={ta()} rows={2} />
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

const SLEEPER_API = "https://api.sleeper.app/v1";

/** Read-only, advisory sync against Sleeper's live Final Fantasy draft —
 *  see PROJECT_CONTEXT.md's "Platform sync strategy" and the design notes
 *  above reconcileSleeperPicks(). Never blocks manual entry: every fetch
 *  is caught and degrades to a status message, nothing throws upward. */
function SleeperSyncPanel({ sourceLeagueId, pool, draft, onMergePicks, onAddManagers }) {
  const [draftId, setDraftId] = useState(null);
  const [managerByRoster, setManagerByRoster] = useState(new Map());
  const [status, setStatus] = useState("idle"); // 'idle' | 'loading' | 'error'
  const [error, setError] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
  const [unmatched, setUnmatched] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [autoSync, setAutoSync] = useState(true);

  // Resolve the current draft_id + manager names once we know the league.
  useEffect(() => {
    if (!sourceLeagueId) return;
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
  }, [sourceLeagueId]);

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
    if (!draftId || !autoSync) return;
    sync();
    const interval = setInterval(sync, 15000);
    return () => clearInterval(interval);
  }, [draftId, autoSync, sync]);

  const statusText = !sourceLeagueId ? "Waiting on league config…"
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
        <div style={{ fontSize:12, opacity:0.75 }}>{statusText}</div>
        <button onClick={sync} disabled={!draftId} style={btnStyle()}>Sync now</button>
        <label style={{ fontSize:12, display:"flex", alignItems:"center", gap:4, opacity:0.85 }}>
          <input type="checkbox" checked={autoSync} onChange={e=>setAutoSync(e.target.checked)} /> auto (15s)
        </label>
      </div>
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
function SettingsTab({ users, toggleUserTab, teamsByLeague, rosterSpotsByLeague, setTeamsFor, setRosterSpotsFor, managersTextByLeague, setManagersForLeague }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={panelStyle()}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
          Tab Access — which boards each person can see
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {users.filter(u => u.id != null).map(u => {
            const active = (u.allowedTabs && u.allowedTabs.length) ? u.allowedTabs : ALL_TABS;
            return (
              <div key={u.id} style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
                <div style={{ width:90, fontWeight:700 }}>{u.name}</div>
                {ALL_TABS.map(t => (
                  <label key={t} style={{ display:"flex", alignItems:"center", gap:5, fontSize:12 }}>
                    <input type="checkbox" checked={active.includes(t)} onChange={()=>toggleUserTab(u, t)} />
                    {TAB_LABELS_SHORT[t]}
                  </label>
                ))}
              </div>
            );
          })}
        </div>
        <div style={{ fontSize:11, opacity:0.55, marginTop:10 }}>
          At least one tab has to stay checked per person. If someone's current tab gets unchecked, they're
          moved to their next allowed tab automatically the next time the app loads for them.
        </div>
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

      <div style={{ fontSize:12, opacity:0.65, lineHeight:1.5 }}>
        Want to see or tweak the actual VBD/scoring/projection math? Open the
        <b style={{color:"#f0d97a"}}> "Calculations"</b> tab instead.
      </div>
    </div>
  );
}

function MethodologyTab({ weights, setWeight, replacement, setRep, tierParams, setTierParams, teams, rosterSpots, onReset, pool, playerImports, onApplyImport, onClearImport, currentUserName }) {
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
          canEdit={currentUserName === "Will"} />
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
        not through import, and each person's own edits there stay on their profile even after a re-import. Imported
        fields show a small <b style={{color:"#7fd1c9"}}>FFB</b> tag on the board.
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




function btnStyle(bg="#20211a", border="#c9a227") {
  return { padding:"8px 14px", borderRadius:8, border:`1px solid ${border}`, background:bg, color:"#e9e6dd", fontSize:13, fontWeight:600 };
}
function panelStyle() {
  return { background:"#181910", border:"1px solid #2a2c20", borderRadius:10, padding:14, marginBottom:14 };
}
function lbl() {
  return { display:"flex", flexDirection:"column", gap:4, fontSize:11, opacity:0.75 };
}
function lblSmall(color) {
  return { fontSize:11, fontWeight:700, color, marginBottom:4, textTransform:"uppercase", letterSpacing:0.5 };
}
function pText() {
  return { fontSize:12.5, opacity:0.8, lineHeight:1.6, maxWidth:900, marginBottom:14 };
}
function inp(w) {
  return { width:w, background:"#0f100b", border:"1px solid #33362a", borderRadius:6, color:"#e9e6dd", padding:"6px 8px", fontSize:13 };
}
function ta() {
  return { width:"100%", background:"#0f100b", border:"1px solid #33362a", borderRadius:6, color:"#e9e6dd", padding:"8px", fontSize:13, resize:"vertical" };
}
function SortTh({ label, col, sortKey, sortDir, onSort, align }) {
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
function th(align="center") {
  return { padding:"10px 8px", textAlign:align, borderBottom:"1px solid #2a2c20" };
}
function td(align="center") {
  return { padding:"7px 8px", textAlign:align, borderBottom:"1px solid #1e2018", fontSize:13 };
}
function badgeSup() {
  return { marginLeft:4, fontSize:9, fontWeight:800, color:"#7fd1c9", letterSpacing:0.5 };
}
