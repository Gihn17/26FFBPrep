// Keeper cost calculators.
//
// Two genuinely different models — confirmed directly by Will, and the
// Final Fantasy one cross-checked against his actual 2025 roster pulled
// from Sleeper (16 candidates, one ineligible: Lamar Jackson, a 2nd-round
// pick whose escalated cost would hit round 1).
//
// KOI (ESPN, auction):
//   cost = max(price_paid, original_draft_price) + $10 per year kept
//   Linear escalation, NO expiry — stays keepable indefinitely as long
//   as (projected value - cost) is still positive. A $0 waiver pickup
//   enters at $10.
//
// FINAL FANTASY (Sleeper, snake):
//   cost = original_round - (years_kept + 1)
//   Accelerating escalation (the "extra round each year" Will described:
//   8th -> 7th -> 5th -> 2nd, decrementing by 1, then 2, then 3...).
//   Waiver adds enter at an 8th-round cost. A player becomes ineligible
//   once his escalated cost would reach round 1 — confirmed explicitly:
//   round-1/round-2 picks are never keepable at all, since the first
//   escalation from round 2 already lands on round 1.
//
// Both leagues cap at 3 keepers per team (confirmed for both).

import { db } from "./db.js";

const WAIVER_ROUND_FF = 8;   // Final Fantasy: waiver pickups cost an 8th
const WAIVER_BONUS_KOI = 10; // Koi: a $0 waiver pickup keeps for $10

/** Koi: dollar-based keeper cost. No cap on years kept — eligibility is
 *  purely an economic question the caller (or the UI) decides by comparing
 *  this cost against projected auction value, not a hard rule enforced here. */
export function koiKeeperCost({ pricePaid, originalDraftPrice, isWaiverAdd, yearsKept }) {
  const years = yearsKept || 0;

  if (isWaiverAdd) {
    const basis = Math.max(pricePaid || 0, 0);
    return basis + WAIVER_BONUS_KOI + years * 10;
  }

  const basis = Math.max(pricePaid || 0, originalDraftPrice || 0);
  return basis + 10 + years * 10;
}

/** Final Fantasy: round-based keeper cost.
 *  Returns { round, eligible, yearsRemaining }.
 *  - round: the round this keeper costs THIS season (1 = most expensive).
 *  - eligible: false once escalation would reach round 1.
 *  - yearsRemaining: how many more seasons this player can still be kept
 *    after this one, given the accelerating escalation.
 */
export function ffKeeperCost({ originalRound, isWaiverAdd, yearsKept }) {
  const years = yearsKept || 0;

  // Waiver adds cost an 8th round pick on their FIRST keep (confirmed).
  // Modeled as an effective original round of 9, so the standard
  // escalation formula (R - 1 for the first keep) lands on 8 exactly,
  // rather than double-applying the escalation on top of "8".
  const R = isWaiverAdd ? WAIVER_ROUND_FF + 1 : originalRound;

  // escalation for keep-year k (1-indexed: this keep is year k) is k(k+1)/2
  const k = years; // consecutive keeps already applied BEFORE this season
  const nextK = k + 1; // the keep-year being computed right now
  const escalation = (nextK * (nextK + 1)) / 2;
  const round = R - escalation;

  return {
    round,
    eligible: round >= 2, // round 1 or below = not keepable
    // Years keepable AFTER this one — starts at nextK+1 because nextK
    // itself is the year already reflected in `round` above; counting
    // from nextK would double-count the current season.
    yearsRemaining: eligible_years_remaining(R, nextK + 1),
  };
}

function eligible_years_remaining(R, fromK) {
  let k = fromK;
  let years = 0;
  while (R - (k * (k + 1)) / 2 >= 2) {
    years += 1;
    k += 1;
  }
  return years;
}

/** Load Will's current keeper candidates for Final Fantasy from the
 *  players/keepers tables and compute this season's cost for each.
 *  Mirrors the jq pipeline run by hand during planning — this is that
 *  logic made permanent and re-runnable once projections are loaded. */
export function computeFinalFantasyKeeperBoard(season) {
  const rows = db.prepare(`
    SELECT k.*, p.full_name, p.position
    FROM keepers k JOIN players p ON p.id = k.player_id
    WHERE k.league_id = 'final' AND k.season = ?
  `).all(season);

  return rows.map((r) => {
    const result = ffKeeperCost({
      originalRound: r.original_round,
      isWaiverAdd: !!r.is_waiver_add,
      yearsKept: r.years_kept,
    });
    return {
      player: r.full_name,
      position: r.position,
      originalRound: r.original_round,
      isWaiverAdd: !!r.is_waiver_add,
      ...result,
    };
  }).sort((a, b) => (a.round ?? 99) - (b.round ?? 99));
}

/** Same, for Koi. Requires projected auction value to be joined in by the
 *  caller once UDK data + auction values are loaded — this function only
 *  computes cost, not the keep/cut decision, since that needs a value
 *  to compare against. */
export function computeKoiKeeperBoard(season) {
  const rows = db.prepare(`
    SELECT k.*, p.full_name, p.position
    FROM keepers k JOIN players p ON p.id = k.player_id
    WHERE k.league_id = 'koi' AND k.season = ?
  `).all(season);

  return rows.map((r) => ({
    player: r.full_name,
    position: r.position,
    cost: koiKeeperCost({
      pricePaid: r.original_cost,
      originalDraftPrice: r.original_cost,
      isWaiverAdd: !!r.is_waiver_add,
      yearsKept: r.years_kept,
    }),
  }));
}
