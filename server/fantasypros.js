// FantasyPros API client — becomes the canonical player pool (see
// server/db.js's fp_pool table), replacing Fantasy Football Calculator in
// that role. FFC (server/adp.js) stays alive purely as an ADP-number
// source, matched onto this pool by name+position — see getFpPoolWithAdp()
// below. Verified against the REAL API (the official OpenAPI spec at
// https://api.fantasypros.com/public/v2/docs/fantasypros_v2_public.yml,
// not docs guesses) before building this:
//   - /nfl/{season}/consensus-rankings?position=OP&type=DRAFT — 491 players,
//     91 experts, real tier/pos_rank/bye/ECR min-max-avg-std. "type=ST" (an
//     earlier guess) isn't a real enum value — silently defaulted; DRAFT is
//     the documented one.
//   - /nfl/{season}/projections?position=ALL&week=0 — 605 players, full raw
//     stat lines. The premium tier removed the free tier's 10-row cap
//     (public_api_limited/limit fields are gone entirely once upgraded).
//   - No auction-value endpoint exists anywhere in the spec — confirmed by
//     grepping all ~5000 lines for "auction", zero hits. Stays UDK-only.
//   - No ADP here either in any usable form (type=ADP returns 0 players,
//     2025 and 2026 both tested) — that's why FFC stays the ADP source.
import { db } from "./db.js";
import { getSetting } from "./settings.js";

const FP_BASE = "https://api.fantasypros.com/public/v2/json/nfl";
// 1 req/sec, 500/day per Will's plan — a refresh is only 2 calls, so the
// daily cap is never in real danger; the per-second floor is what actually
// matters and what we enforce here.
const MIN_GAP_MS = 1100;

db.exec(`
CREATE TABLE IF NOT EXISTS fp_pool (
  id            INTEGER PRIMARY KEY,   -- FantasyPros' own player id (fpid) — the new canonical id
  name          TEXT NOT NULL,
  position      TEXT NOT NULL,         -- QB/RB/WR/TE/K/DEF (FantasyPros' "DST" mapped to "DEF")
  team          TEXT,
  bye           INTEGER,
  rank_ecr      INTEGER,                -- overall expert consensus rank
  rank_ecr_pos  TEXT,                   -- e.g. "QB1" (FantasyPros' pos_rank string, as-is)
  tier          INTEGER,
  ecr_min       INTEGER,
  ecr_max       INTEGER,
  ecr_avg       REAL,
  ecr_std       REAL,
  total_experts INTEGER,
  pass_yd       REAL DEFAULT 0,
  pass_td       REAL DEFAULT 0,
  pass_int      REAL DEFAULT 0,
  rush_att      REAL DEFAULT 0,
  rush_yd       REAL DEFAULT 0,
  rush_td       REAL DEFAULT 0,
  rec           REAL DEFAULT 0,
  rec_yd        REAL DEFAULT 0,
  rec_td        REAL DEFAULT 0,
  fum_lost      REAL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

let lastRefreshAt = null;
let lastRefreshError = null;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function normPos(pos) {
  return pos === "DST" ? "DEF" : pos;
}

async function fpFetch(path) {
  const key = getSetting("fantasypros-api-key");
  if (!key) throw new Error("no FantasyPros API key set — add one in Settings");
  const res = await fetch(`${FP_BASE}${path}`, { headers: { "x-api-key": key } });
  if (!res.ok) throw new Error(`FantasyPros API returned HTTP ${res.status} for ${path}`);
  return res.json();
}

/** Consensus rankings — tier, positional rank, bye week, and how much
 *  experts agree (min/max/avg/std). scoring=HALF splits the difference
 *  between Koi (half-PPR) and Final (full PPR); ECR ordering barely moves
 *  by format, this is just the tier-line/spread signal, not the stat line.
 *  Deliberately NOT passing experts=show — verified live that doing so
 *  swaps `tier` out of every player entirely in favor of a raw per-expert
 *  {expertId: rank} breakdown we don't need; omitting it keeps `tier`.
 *  `total_experts` is a top-level field on the response, not per-player —
 *  returned separately here and applied to every row in refreshFpPool. */
async function fetchRankings(season) {
  const data = await fpFetch(`/${season}/consensus-rankings?position=OP&type=DRAFT&scoring=HALF`);
  return { players: Array.isArray(data.players) ? data.players : [], totalExperts: data.total_experts ?? null };
}

/** Season-long raw stat-line projections. week=0 = full season. Only the
 *  raw stats are used (pass_yds/rush_yds/etc) — the pre-computed points_*
 *  fields are ignored, since this app computes its own points per league
 *  from raw stats via scorePoints() in App.jsx, exactly like a UDK CSV
 *  import already does. That also means one call covers every league
 *  regardless of scoring format. */
async function fetchProjections(season) {
  const data = await fpFetch(`/${season}/projections?position=ALL&week=0`);
  return Array.isArray(data.players) ? data.players : [];
}

/** Pulls rankings + projections and upserts the joined result into
 *  fp_pool. Players present in one fetch but not the other still get a
 *  row (e.g. a deep-bench player projections has but consensus rankings
 *  doesn't rank yet) — never dropped just because one side is missing. */
export async function refreshFpPool() {
  const season = new Date().getFullYear();
  const { players: rankings, totalExperts } = await fetchRankings(season);
  await sleep(MIN_GAP_MS);
  const projections = await fetchProjections(season);

  const byId = new Map();
  for (const r of rankings) {
    byId.set(r.player_id, {
      id: r.player_id, name: r.player_name, position: normPos(r.player_position_id),
      team: r.player_team_id || null, bye: r.player_bye_week ? Number(r.player_bye_week) : null,
      rank_ecr: r.rank_ecr ?? null, rank_ecr_pos: r.pos_rank ?? null, tier: r.tier ?? null,
      ecr_min: r.rank_min != null ? Number(r.rank_min) : null, ecr_max: r.rank_max != null ? Number(r.rank_max) : null,
      ecr_avg: r.rank_ave != null ? Number(r.rank_ave) : null, ecr_std: r.rank_std != null ? Number(r.rank_std) : null,
      total_experts: totalExperts,
      pass_yd: 0, pass_td: 0, pass_int: 0, rush_att: 0, rush_yd: 0, rush_td: 0, rec: 0, rec_yd: 0, rec_td: 0, fum_lost: 0,
    });
  }
  for (const p of projections) {
    const s = p.stats || {};
    const existing = byId.get(p.fpid);
    const base = existing || {
      id: p.fpid, name: p.name, position: normPos(p.position_id), team: p.team_id || null, bye: null,
      rank_ecr: null, rank_ecr_pos: null, tier: null, ecr_min: null, ecr_max: null, ecr_avg: null, ecr_std: null, total_experts: null,
    };
    byId.set(p.fpid, {
      ...base,
      pass_yd: s.pass_yds ?? 0, pass_td: s.pass_tds ?? 0, pass_int: s.pass_ints ?? 0,
      rush_att: s.rush_att ?? 0, rush_yd: s.rush_yds ?? 0, rush_td: s.rush_tds ?? 0,
      rec: s.rec_rec ?? 0, rec_yd: s.rec_yds ?? 0, rec_td: s.rec_tds ?? 0,
      fum_lost: s.fumbles ?? 0,
    });
  }

  const upsert = db.prepare(`
    INSERT INTO fp_pool (id, name, position, team, bye, rank_ecr, rank_ecr_pos, tier, ecr_min, ecr_max, ecr_avg, ecr_std, total_experts,
      pass_yd, pass_td, pass_int, rush_att, rush_yd, rush_td, rec, rec_yd, rec_td, fum_lost, updated_at)
    VALUES (@id, @name, @position, @team, @bye, @rank_ecr, @rank_ecr_pos, @tier, @ecr_min, @ecr_max, @ecr_avg, @ecr_std, @total_experts,
      @pass_yd, @pass_td, @pass_int, @rush_att, @rush_yd, @rush_td, @rec, @rec_yd, @rec_td, @fum_lost, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, position=excluded.position, team=excluded.team, bye=excluded.bye,
      rank_ecr=excluded.rank_ecr, rank_ecr_pos=excluded.rank_ecr_pos, tier=excluded.tier,
      ecr_min=excluded.ecr_min, ecr_max=excluded.ecr_max, ecr_avg=excluded.ecr_avg, ecr_std=excluded.ecr_std, total_experts=excluded.total_experts,
      pass_yd=excluded.pass_yd, pass_td=excluded.pass_td, pass_int=excluded.pass_int,
      rush_att=excluded.rush_att, rush_yd=excluded.rush_yd, rush_td=excluded.rush_td,
      rec=excluded.rec, rec_yd=excluded.rec_yd, rec_td=excluded.rec_td, fum_lost=excluded.fum_lost, updated_at=excluded.updated_at
  `);
  const seenIds = [];
  const txn = db.transaction(() => {
    for (const row of byId.values()) { seenIds.push(row.id); upsert.run(row); }
    if (seenIds.length) {
      const placeholders = seenIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM fp_pool WHERE id NOT IN (${placeholders})`).run(...seenIds);
    }
  });
  txn();

  lastRefreshAt = new Date().toISOString();
  lastRefreshError = null;
  return seenIds.length;
}

export function getFpPool() {
  return db.prepare("SELECT * FROM fp_pool ORDER BY position, rank_ecr").all();
}

// Server-side copy of App.jsx's normName() (src/App.jsx:306-312) — same
// manual-sync convention already used for VALID_TABS/ALL_TABS across
// files. Only used here for the ADP name+position match below. Adds
// diacritic-stripping on top of the client version — verified live this
// was a real miss (FFC's "Eddy Piñeiro" vs FantasyPros' accent-free "Eddy
// Pineiro"), not present in the original since App.jsx's CSV/keeper/
// Sleeper matching hasn't hit this case yet. Worth carrying back to the
// client copy too if it ever does.
function normName(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[.']/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Matches Fantasy Football Calculator's ADP (server/adp.js's adp_pool —
 *  still the real ADP source, per Will's call; only the canonical id/pool
 *  is moving to FantasyPros) onto the FantasyPros-keyed pool by name +
 *  position — except DEF, matched by team code instead (verified live:
 *  FFC names defenses "Seattle Defense" while FantasyPros uses the real
 *  team name "Seattle Seahawks" — name matching misses 25 of 32 team
 *  defenses; both sides carry the same 3-letter team code, so that's the
 *  reliable key here, same idea as the Sleeper sync's DEF-by-team-code
 *  matching in App.jsx's buildPoolMatchIndex). Computed fresh per call,
 *  never persisted — same "recompute, don't cache" philosophy the
 *  CSV-import nameIndex in App.jsx already uses. A fp_pool player FFC
 *  doesn't carry just gets no adp/adp_rank field at all, never an error. */
// FantasyPros and FFC disagree on Jacksonville's code (JAC vs JAX) —
// verified live, the only team-code mismatch between the two out of 25
// FFC-tracked defenses. Normalize both sides through this before matching.
function normTeam(t) {
  return t === "JAX" ? "JAC" : t;
}

export function attachAdp(fpPoolRows, adpRows) {
  const byNamePos = new Map();
  const byDefTeam = new Map();
  for (const a of adpRows) {
    if (a.position === "DEF") byDefTeam.set(normTeam(a.team), a);
    else byNamePos.set(normName(a.name) + "|" + a.position, a);
  }
  return fpPoolRows.map((p) => {
    const match = p.position === "DEF" ? byDefTeam.get(normTeam(p.team)) : byNamePos.get(normName(p.name) + "|" + p.position);
    return match ? { ...p, adp: match.adp, adp_rank: match.adp_rank } : p;
  });
}

export function getFpStatus() {
  const count = db.prepare("SELECT COUNT(*) as c FROM fp_pool").get().c;
  return { count, lastRefreshAt, lastRefreshError };
}
