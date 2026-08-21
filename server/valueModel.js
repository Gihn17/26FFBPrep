// Server-side port of src/App.jsx's scorePoints/buildPool/computeLeagueFields/
// computeTiers/computeAuctionValues (lines 55, 187-306) — needed here because
// the GM Tab and Draft Prep chat assistant (server/chat.js) run in Node, not
// the browser, and that logic has no React/DOM dependency (confirmed when
// it was first ported to Python for fantasy-gm's scripts/value_model.py —
// see that file's own header for the cross-language verification this JS
// copy doesn't need, since it's the same language as the source).
//
// This is a manual copy, not a shared import — importing src/App.jsx
// directly would drag in JSX/Vite build tooling for zero benefit. Re-diff
// against the cited source lines if App.jsx's scoring ever changes.
import { db } from "./db.js";
import { getFpPool } from "./fantasypros.js";

export const KOI_WEIGHTS = {
  passYdsPerPt: 25, passTD: 4, intPenalty: 2,
  rushYdsPerPt: 10, rushTD: 6,
  rec: 0.5, recYdsPerPt: 10, recTD: 6,
  fumblePenalty: 2,
};
export const KOI_REPLACEMENT = { QB: 15, RB: 60, WR: 66, TE: 15, K: 12, DEF: 12 };
export const KOI_TEAMS = 12;
export const KOI_TIER_PARAMS = { minGap: 4, pctGap: 0.14 };

function fpStatsOverride(p) {
  if (p.position === "K" || p.position === "DEF") return null;
  return {
    passYds: p.pass_yd, passTD: p.pass_td, INT: p.pass_int,
    rushYds: p.rush_yd, rushTD: p.rush_td,
    rec: p.rec, recYds: p.rec_yd, recTD: p.rec_td,
    fumbles: p.fum_lost,
  };
}

export function scorePoints(s, w = KOI_WEIGHTS) {
  return ((s.passYds||0) / w.passYdsPerPt) + ((s.passTD||0) * w.passTD) - ((s.INT||0) * w.intPenalty)
       + ((s.rushYds||0) / w.rushYdsPerPt) + ((s.rushTD||0) * w.rushTD)
       + ((s.rec||0) * w.rec) + ((s.recYds||0) / w.recYdsPerPt) + ((s.recTD||0) * w.recTD)
       - ((s.fumbles||0) * (w.fumblePenalty||0));
}

export function buildPool(fpPoolRows) {
  return fpPoolRows.map(p => ({
    id: p.id, pos: p.position, name: p.name, team: p.team,
    stats: fpStatsOverride(p), flatPts: p.flat_pts ?? null,
  }));
}

export function computeLeagueFields(players, weights = KOI_WEIGHTS, rep = KOI_REPLACEMENT) {
  const byPos = {};
  for (const p of players) (byPos[p.pos] = byPos[p.pos] || []).push(p);
  const ptsById = {};
  for (const p of players) {
    if (p.pos === "K" || p.pos === "DEF") ptsById[p.id] = p.flatPts != null ? p.flatPts : null;
    else if (p.stats) ptsById[p.id] = Math.round(scorePoints(p.stats, weights)*10)/10;
    else ptsById[p.id] = null;
  }
  const out = {};
  for (const pos of Object.keys(byPos)) {
    const list = [...byPos[pos]].filter(p => ptsById[p.id] != null).sort((a,b) => ptsById[b.id]-ptsById[a.id]);
    const repIdx = Math.min(rep[pos]||1, list.length) - 1;
    const repPts = list.length ? (list[repIdx] ? ptsById[list[repIdx].id] : ptsById[list[list.length-1].id]) : null;
    list.forEach((p, i) => {
      const vbd = Math.round((ptsById[p.id]-repPts)*10)/10;
      out[p.id] = { posRank: i+1, vbd, pts: ptsById[p.id] };
    });
    for (const p of byPos[pos]) if (!(p.id in out)) out[p.id] = { posRank: null, vbd: null, pts: null };
  }
  return out;
}

export function computeTiers(players, fields, tierParams = KOI_TIER_PARAMS) {
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
    for (const p of byPos[pos]) if (!(p.id in tiers)) tiers[p.id] = null;
  }
  return tiers;
}

export function computeAuctionValues(players, fields, teams = KOI_TEAMS) {
  const totalPool = teams * 200;
  const draftable = players.filter(p => fields[p.id].vbd > 0);
  const sumVbd = draftable.reduce((s,p) => s + fields[p.id].vbd, 0) || 1;
  const remaining = Math.max(0, totalPool);
  const values = {};
  for (const p of players) {
    if (fields[p.id].vbd == null) { values[p.id] = null; continue; }
    values[p.id] = fields[p.id].vbd > 0 ? Math.max(1, Math.round(1 + (fields[p.id].vbd/sumVbd)*remaining)) : 1;
  }
  return values;
}

/** Full VBD/tier/auction-value pipeline for Koi, from live fp_pool.
 *  Returns {byId: {id: {name,pos,team,vbd,tier,pts,value}}}. */
export function buildKoiValueTable() {
  const pool = buildPool(getFpPool());
  const fields = computeLeagueFields(pool);
  const tiers = computeTiers(pool, fields);
  const values = computeAuctionValues(pool, fields);
  const byId = {};
  for (const p of pool) {
    byId[p.id] = {
      name: p.name, pos: p.pos, team: p.team,
      vbd: fields[p.id].vbd, tier: tiers[p.id], pts: fields[p.id].pts, value: values[p.id],
    };
  }
  return byId;
}

/** Live auction-inflation snapshot — a JS port of fantasy-gm's own
 *  scripts/resource_counter.py, same formula, same reasoning (see that
 *  file's header for why "genuinely new logic" — no version of this
 *  exists anywhere else). Reads draftByLeague straight from user_kv, so
 *  it reflects picks the moment they're entered on the live board, not a
 *  periodic snapshot. */
export function auctionInflationSnapshot(leagueId = "koi") {
  const table = buildKoiValueTable();
  const row = db.prepare("SELECT value FROM user_kv WHERE key = 'ffb-draft-state'").get();
  const state = row ? JSON.parse(row.value) : {};
  const draft = (state.draftByLeague || {})[leagueId] || {};

  const draftedIds = Object.keys(draft).filter(id => draft[id]?.drafted).map(Number);
  const spent = draftedIds.reduce((s, id) => s + Number(draft[id].paid || 0), 0);
  const staticValueDrafted = draftedIds.reduce((s, id) => s + (table[id]?.value || 0), 0);

  const totalPool = KOI_TEAMS * 200;
  const remainingBudget = totalPool - spent;
  const draftedSet = new Set(draftedIds);
  const undraftedStaticTotal = Object.entries(table)
    .filter(([id, v]) => !draftedSet.has(Number(id)) && v.value != null && v.value > 1)
    .reduce((s, [, v]) => s + v.value, 0);

  return {
    draftedCount: draftedIds.length,
    spent,
    staticValueOfDrafted: staticValueDrafted,
    inflationSoFar: staticValueDrafted ? Math.round((spent / staticValueDrafted) * 1000) / 1000 : null,
    remainingBudgetLeagueWide: remainingBudget,
    undraftedStaticValueTotal: undraftedStaticTotal,
    projectedRemainingInflation: undraftedStaticTotal ? Math.round((remainingBudget / undraftedStaticTotal) * 1000) / 1000 : null,
  };
}
