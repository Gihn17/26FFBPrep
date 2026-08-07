// Scoring engine — turns a raw stat line into fantasy points, per league.
//
// The existing scorePoints() in App.jsx is a single generic formula:
//   passYds/w.passYdsPerPt + passTD*w.passTD - INT*w.intPenalty
//   + rushYds/w.rushYdsPerPt + rushTD*w.rushTD
//   + rec*w.rec + recYds/w.recYdsPerPt + recTD*w.recTD
//   - fumbles*w.fumblePenalty
//
// That can express Koi's scoring correctly (confirmed against ESPN's raw
// statId map). It CANNOT express Final Fantasy's real settings, which
// include terms that formula has no field for:
//   - rush_att: 0.1        -- a point per CARRY, independent of yards.
//                              Worth +30 pts/season to a 300-carry back —
//                              not a rounding error, a real positional edge
//                              no public ranking source accounts for.
//   - per-game bonuses      -- +3 for a 100-yd rush/rec game, +1.5 for 200,
//                              +3/+1.5 for 300/400-yd passing games. These
//                              depend on game-by-game distribution, not a
//                              season total, so they're estimated (see
//                              estimateGameBonus below) rather than exact
//                              until real weekly logs are wired in later.
//
// Everything here operates on a STAT LINE (see db.js `projections` table),
// never on pre-computed points, so one imported UDK row scores correctly
// across leagues with completely different rules.

/** Per-league scoring rate tables, derived directly from each platform's
 *  own settings pull (ESPN mSettings for Koi, Sleeper scoring_settings
 *  for Final Fantasy) — not from generic PPR/half-PPR assumptions. */
export const SCORING_CONFIGS = {
  koi: {
    passYdRate: 0.04,     // 1 pt / 25 yds (ESPN statId 5: 0.2 per 5 yds)
    passTd: 4,
    passInt: -2,
    rushAttRate: 0,        // not used in Koi
    rushYdRate: 0.1,
    rushTd: 6,
    rec: 0.5,              // half-PPR
    recYdRate: 0.1,
    recTd: 6,
    fumLost: -2,
    twoPt: 2,               // pass/rush/rec 2pt conversions, all worth 2
    bigPlayBonus: 2,        // 50+ yd TD bonuses (pass/rush/rec) — not modeled, see note below
    perGameBonuses: null,   // Koi has none
  },

  final: {
    passYdRate: 1 / 30,     // 0.0333.. — CONFIRMED from Sleeper: 1 pt / 30 yds,
                              // not the more common 1/25. Easy to get wrong.
    passTd: 6,
    passInt: -4,
    rushAttRate: 0.1,        // *** the term the old engine is missing ***
    rushYdRate: 0.1,
    rushTd: 6,
    rec: 1.0,                // full PPR
    recYdRate: 0.1,
    recTd: 6,
    fumLost: -3,
    twoPt: 2,
    bigPlayBonus: 1,         // 40+/50+ yd bonuses vary 1-2 by type — not modeled, see note
    perGameBonuses: {
      rush100: 3, rush200: 1.5,   // additive: a 220-yd rush game gets both tiers? No —
      rec100: 3, rec200: 1.5,     // Sleeper's bonus_*_200 is typically in ADDITION to
      pass300: 3, pass400: 1.5,   // the _100/_300 tier. Confirm against a real Sleeper
                                    // scoreboard before trusting exact totals; see
                                    // estimateGameBonus() for how this is applied.
    },
  },

  // jordan: intentionally absent until its ESPN scoring settings are pulled.
  // getScoringConfig() below throws a clear error rather than silently
  // scoring Jordan players with the wrong league's rules.
};

export function getScoringConfig(leagueId) {
  const cfg = SCORING_CONFIGS[leagueId];
  if (!cfg) {
    throw new Error(
      `No scoring config for league "${leagueId}" yet. ` +
      `(Jordan's ESPN scoring settings haven't been pulled — do the same ` +
      `mSettings curl used for Koi, then add its entry to SCORING_CONFIGS.)`
    );
  }
  return cfg;
}

/** Core scorer: raw stat line -> fantasy points for one league.
 *  stat line fields match the `projections` table columns. */
export function scorePoints(stats, leagueId) {
  const c = getScoringConfig(leagueId);
  let pts = 0;

  pts += (stats.pass_yd || 0) * c.passYdRate;
  pts += (stats.pass_td || 0) * c.passTd;
  pts += (stats.pass_int || 0) * c.passInt;

  pts += (stats.rush_att || 0) * c.rushAttRate; // 0 for Koi, real for Final Fantasy
  pts += (stats.rush_yd || 0) * c.rushYdRate;
  pts += (stats.rush_td || 0) * c.rushTd;

  pts += (stats.rec || 0) * c.rec;
  pts += (stats.rec_yd || 0) * c.recYdRate;
  pts += (stats.rec_td || 0) * c.recTd;

  pts += (stats.fum_lost || 0) * c.fumLost;

  if (c.perGameBonuses) {
    pts += estimateGameBonus(stats, c);
  }

  return Math.round(pts * 100) / 100;
}

/** Per-game bonuses can't be derived exactly from a season total —
 *  a player with 1400 rush yards over 17 games might have zero 100-yd
 *  games (steady ~82/gm) or six of them (boom/bust usage), and Final
 *  Fantasy pays real points for the difference (+3 per 100-yd game).
 *
 *  This is a placeholder ESTIMATE: it assumes a roughly normal week-to-week
 *  distribution around the per-game average and infers an expected bonus
 *  count from that. It will UNDERSTATE bonus totals for genuinely spiky
 *  players and OVERSTATE them for very consistent ones.
 *
 *  Flagged in the UI as "estimated" rather than shown as a firm number.
 *  Phase 2 fix: pull real weekly game logs (nflverse) for comparable
 *  usage profiles and derive an empirical bonus rate instead of guessing
 *  at the distribution shape. Not needed before the 2026 draft; the
 *  season-total scoring above is accurate without it.
 */
function estimateGameBonus(stats, c) {
  const games = stats.games || 17;
  let bonus = 0;

  const rushPerGame = (stats.rush_yd || 0) / games;
  bonus += estimateTierCount(rushPerGame, games, 100) * c.perGameBonuses.rush100;
  bonus += estimateTierCount(rushPerGame, games, 200) * c.perGameBonuses.rush200;

  const recPerGame = (stats.rec_yd || 0) / games;
  bonus += estimateTierCount(recPerGame, games, 100) * c.perGameBonuses.rec100;
  bonus += estimateTierCount(recPerGame, games, 200) * c.perGameBonuses.rec200;

  const passPerGame = (stats.pass_yd || 0) / games;
  bonus += estimateTierCount(passPerGame, games, 300) * c.perGameBonuses.pass300;
  bonus += estimateTierCount(passPerGame, games, 400) * c.perGameBonuses.pass400;

  return bonus;
}

/** Crude placeholder: assumes ~35% game-to-game coefficient of variation
 *  and a roughly log-normal week distribution, then counts how many games
 *  are expected to clear the threshold. Deliberately conservative — this
 *  exists so the field isn't silently zero, not to be trusted precisely.
 *  Replace with an nflverse-derived rate in Phase 2. */
function estimateTierCount(perGameAvg, games, threshold) {
  if (perGameAvg <= 0) return 0;
  const cv = 0.35;
  const z = (threshold - perGameAvg) / (perGameAvg * cv);
  const pAboveThreshold = 1 - normalCdf(z);
  return Math.max(0, pAboveThreshold * games);
}

function normalCdf(z) {
  // Abramowitz & Stegun approximation — fine for this rough estimate.
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p;
}
