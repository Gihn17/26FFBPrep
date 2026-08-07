# Will's FFB Draft Prep — Full Project Context

This document captures everything decided across an extended planning
conversation, for a Claude Code session picking up the build. It's meant
to stand alone — read this instead of needing the original chat.

Repo: `ffb-docker` on the homelab server (GitHub: `Gihn17/26FFBPrep`).
Six server-side files and `HANDOFF.md` have already been added and
tested — see "Build status" at the bottom for exactly what's done.

---

## The goal

A self-hosted (Docker, homelab, LAN-shared with his wife) fantasy
football draft-prep tool covering three real leagues for the 2026
season. Not a generic fantasy app — every number in it needs to be
correct for these three specific leagues' actual rules, which differ
from each other and from any off-the-shelf ranking site's defaults.

Core capabilities: custom scoring per league, value-based drafting
(VBD) with per-league replacement levels, auction value calculation
with live inflation, a keeper cost/decision calculator (two different
rule sets), a fast live-draft entry board (snake and auction), and
optional platform sync (Sleeper works well; ESPN does not, and both
leagues on ESPN are manual-entry by design, not by limitation).

Rookie dynasty drafts are an explicit future feature (next spring) —
not in scope now, but the architecture should not preclude it later
(a `draft_type` enum, pluggable valuation, is enough to leave room).

Timeline: Final Fantasy (Sleeper) drafts **late August 2026** — this
is the near-term deadline. Koi (ESPN) drafts second; exact date TBD.
Jordan (ESPN) also TBD. Keeper deadlines for Koi and Final Fantasy are
still unconfirmed — **Will is tracking this himself**, not something
for a coding session to chase. His experience: these usually don't
come in until draft day itself or a few days before, so the keeper
calculator needs to be correct and ready well ahead of time, but the
actual deadline date isn't expected to be knowable far in advance.

---

## The three leagues — full confirmed specs

### Koi (auction, ESPN)

- **Platform:** ESPN, league ID `722037`, Will's team ID `11`
- **Teams:** 12
- **Roster:** 1 QB, 2 RB, 1 RB/WR flex (not TE-eligible), 2 WR, 1 TE,
  1 D/ST, 1 K, 6 bench = **15 spots/team, 180 total league-wide**
- **Auction budget:** $200/team = **$2,400 total pool**
- **Distributable pool:** `$2,400 − (180 × $1 reserve) = $2,220`
- **Scoring** (confirmed directly against ESPN's raw `statId` map via
  `?view=mSettings`, not assumed from "half-PPR" defaults):
  - Passing yards: 0.04/yd (1 pt per 25 — ESPN stores this as statId 5,
    "0.2 per 5 yards," which is easy to misread as 0.2/yd — it isn't)
  - Pass TD: 4, INT: −2
  - Rush yards: 0.1/yd, Rush TD: 6
  - Reception: 0.5 (half-PPR), Rec yards: 0.1/yd, Rec TD: 6
  - Fumble lost: −2
  - 2pt conversions (pass/rush/rec): 2 each
  - 50+ yard TD bonuses (pass/rush/rec): 2 each — **not modeled**, no
    projection source provides long-TD counts; worth ~2-6 pts/season,
    inside projection noise
- **Replacement levels:** QB 15 / RB 60 / WR 66 / TE 15 / K 12 / DEF 12
  — **sums to exactly 180**, confirming the underlying rule: replacement
  = "last player who'd be rostered at all" (not last starter). This
  sum-check is the validation method — see Final Fantasy/Jordan below,
  where it currently fails and is flagged, not silently fixed.
- **Keepers:** max 3/team. Cost = `max(price_paid, original_draft_price)
  + $10` per year kept, **compounding** (a $10 keeper becomes $20 next
  year if kept again, $30 the year after). **No cap on years kept** —
  stays keepable indefinitely as long as it's still worth it
  economically. A $0 waiver pickup enters at $10.
- **Live inflation:** since kept players remove more *value* from the
  pool than *dollars* (a $30-value player kept for $10), remaining
  auction values inflate. `inflation = remaining_budget /
  remaining_projected_value`, recomputed live as the auction runs.
  Rough estimate with ~30 keepers league-wide: **~45-50% inflation** —
  this is the single largest factor in Koi's pricing, bigger than any
  difference between projection sources. Static auction values without
  this adjustment will be badly wrong.

### Final Fantasy (snake, Sleeper — drafts first, late August)

- **Platform:** Sleeper, league ID `1380768612914073600`, Will's
  username `Gihn` (team "Life of a Slow Guy"), roster_id `5`
- **League history chain (for keeper reconstruction):**
  2023 (`league=933600438950125568 draft=933600439847714816`) →
  2024 (`league=1115393306218942464 draft=1115393306218942465`) →
  2025 (`league=1212960813250265088 draft=1212960813258645505`) →
  2026 (`league=1380768612914073600 draft=1380768612922458112`).
  Chain terminates at 2023 — anything kept from before that predates
  Sleeper and needs manual entry (should be rare/none by now).
- **Teams:** 12
- **Roster:** QB, 2 RB, 2 WR, TE, 1 FLEX (RB/WR/**TE**-eligible, unlike
  Koi's flex), K, DEF, 6 bench = **15 spots/team, 180 total**
- **Scoring** (confirmed directly from Sleeper's `scoring_settings`,
  and NOT plain "Full PPR, 6pt pass TD, -4 INT" as originally assumed
  — materially more customized):
  - Passing yards: **1/30 (0.0333...)**, not the common 1/25 — easy to
    get wrong, double-check any engine against this exact rate
  - Pass TD: 6, INT: −4
  - **Rush attempts: 0.1/carry** — a genuine point per carry, separate
    from yards. Worth **+30 pts/season** to a 300-carry workhorse vs.
    a 110-carry passing-down back with identical yards/TDs (~+19 pt
    swing between two such backs, confirmed by direct calculation).
    **No public ranking/ADP source accounts for this** — it's real
    in-league edge if modeled correctly.
  - Rush yards: 0.1/yd, Rush TD: 6
  - Reception: 1.0 (full PPR), Rec yards: 0.1/yd, Rec TD: 6
  - Fumble lost: −3
  - 2pt conversions: 2 each
  - **Per-game bonuses** (not season totals): +3 for a 100-yd rush game,
    +1.5 additional for 200; +3/+1.5 same tiers for receiving; +3/+1.5
    for 300/400-yd passing games. These can't be derived from a season
    total alone (two players with identical yardage totals score
    differently depending on game-to-game distribution) — currently
    estimated via a normal-distribution approximation, flagged as
    "estimated" rather than exact. Real fix (Phase 2, not urgent) is
    pulling actual weekly game logs from nflverse to derive an
    empirical bonus rate instead of guessing at the distribution shape.
  - 40+/50+ yard TD bonuses: small, **not modeled** (same reasoning as
    Koi's — no projection source supports it, low point impact)
  - Kickers scored by FG distance (0.1/yd) with XP worth 2 — scores
    noticeably higher than a standard league; K replacement level
    matters more here than usual
- **Replacement levels (as given):** QB 15 / RB 47 / WR 55 / TE 15 /
  K 12 / DEF 12 — **sums to 156, not 180**. Flagged, not auto-corrected:
  Koi's identical-size league validated exactly at 180 under the "sums
  to rostered players" rule, so this gap is worth confirming with Will
  directly — deliberate methodology difference, or leftover from
  before the roster size was finalized at 15. Do not silently rescale.
- **Keepers:** max 3/team. Cost = `original_round − (years_kept + 1) ×
  (years_kept + 2) / 2` — i.e., **accelerating** escalation: a round-8
  pick costs a 7th the first year kept, a 5th the second consecutive
  year, a 2nd the third (confirmed verbatim by Will's own worked
  example: "drafted 8th in 2024, kept as 7th in 2025, would be 5th in
  2026"). **A player becomes ineligible once the escalated cost would
  reach round 1** — confirmed explicitly: a round-1 or round-2 pick can
  never be kept even once, since round 2's first escalation already
  lands on round 1. Waiver pickups enter at an **effective round 9**
  (so their first-keep cost computes to round 8, matching Will's
  stated rule literally — "waiver pickups cost an 8th round pick").
  Formula validated line-by-line against Will's actual 2025 roster (see
  "Confirmed 2026 keeper candidates" below) and against the worked
  example, with two calculation bugs caught and fixed during testing
  (see "Known bugs already fixed" below) — don't reintroduce either.
- **Keeper deadline:** not yet confirmed. Keepers were NOT locked as
  of the planning conversation (`draft_id` picks endpoint returned 0
  keeper picks, and every roster showed prior-season carryover size).
  This is a live, open decision, not historical data to import — and
  Will is tracking the actual date himself (see Timeline above).

#### Confirmed 2026 keeper candidates (Will's roster, all first-time keeps)

Pulled directly from Sleeper's 2025 draft picks for roster_id 5. All
16 players show `is_keeper: false` in 2025 — meaning **none are on a
prior keep streak**, every cost below is a first-year keep cost.

| Player | Pos | 2025 rd | 2026 cost | Years remaining after |
|---|---|---|---|---|
| Lamar Jackson | QB | 2 | **1 — ineligible, cannot be kept** | — |
| Nico Collins | WR | 6 | 5th | 1 (2 total) |
| Kyren Williams | RB | 6 | 5th | 1 (2 total) |
| Bucky Irving | RB | 8 | 7th | 2 (3 total) |
| Brian Thomas | WR | 9 | 8th | 2 (3 total) |
| Stefon Diggs | WR | 9 | 8th | 2 (3 total) |
| Khalil Shakir | WR | 9 | 8th | 2 (3 total) |
| Tucker Kraft | TE | 11 | 10th | 2 (3 total) |
| Trey Benson | RB | 12 | 11th | 3 (4 total) |
| Tre' Harris | WR | 12 | 11th | 3 (4 total) |
| DET (DEF) | DEF | 12 | 11th | 3 (4 total) |
| Chase McLaughlin | K | 13 | 12th | 3 (4 total) |
| Jawhar Jordan | RB | waiver | 8th | 2 (3 total) |
| Kimani Vidal | RB | waiver | 8th | 2 (3 total) |
| Jacoby Brissett | QB | waiver | 8th | 2 (3 total) |
| Taysom Hill | TE | waiver | 8th | 2 (3 total) |

Only 3 keeper slots available. DET/McLaughlin/Brissett are obvious
cuts regardless of projections (DEF/K/backup QB are always replaceable
cheaply in-draft). Realistic shortlist is Collins, Williams, Irving,
Thomas, Kraft vs. the tier below (Shakir, Diggs, Benson, Harris). Final
ranking needs UDK projections + keeper-adjusted ADP — not resolved yet,
intentionally: **do not fabricate a recommendation without real 2026
projection data.** Will explicitly declined to have this decided from
memory/estimate rather than real data.

### Jordan's (snake, ESPN — mostly unconfirmed)

- **Platform:** ESPN. **League ID not yet pulled** — same process as
  Koi (grab `espn_s2`/`SWID` cookies, curl `?view=mSettings&view=mTeam`)
- **Teams:** 10
- **Roster/scoring:** unconfirmed, pending the ESPN pull above
- **Replacement levels (as given):** QB 13 / RB 47 / WR 49 / TE 13 /
  K 10 / DEF 10 — sums to 142 over 10 teams = 14.2/team, non-integer.
  Flagged, not corrected — recheck once roster size is confirmed.
- **Keepers: none** — only Koi and Final Fantasy have keeper options
  (Jordan not mentioned as having them; treat as no keepers unless
  told otherwise)
- Do not build anything Jordan-specific (scoring config, keeper rules)
  until its league ID is pulled and confirmed the same rigorous way
  Koi and Final Fantasy were — no guessing from the Final Fantasy clone
  it originally started from.

---

## Platform sync strategy

Sync is an **optional accelerator over a manual-first core**, never
the primary input path — confirmed by the platform mix itself: 2 of 3
leagues (Koi, Jordan) are on ESPN, whose live draft feed is unreliable
even for the industry's best commercial tools (FantasyPros' own Draft
Wizard only offers *manual* assistance for ESPN, requiring a browser
extension for anything closer to live, and has no live auction
assistance at all on any platform). So manual entry is the **majority
path**, not a fallback — build the fast keyboard-entry flow as a
first-class feature, not an afterthought.

- **Final Fantasy (Sleeper):** live sync viable and worth building.
  Sleeper is free, unauthenticated, rate limit is generous (1000
  calls/min), and `/draft/{draft_id}/picks` includes auction amounts
  (not relevant here since Final Fantasy is snake) and an `is_keeper`
  flag per pick (which is what makes the keeper-history reconstruction
  fully automatic — no manual entry required for anything except
  pre-2023 history, which shouldn't exist by now).
- **Koi (ESPN, auction):** manual entry, by design. ESPN's REST
  `mDraftDetail` view is non-live-reliable; worth polling during the
  draft as a *backfill assist* (reconcile against manual entries,
  auto-fill pricing gaps) but never as the primary input.
- **Jordan (ESPN, snake):** same as Koi — manual primary, ESPN polling
  as backfill-only.
- **Design principle for any sync adapter:** sync is advisory, the
  local event log is truth. A synced pick is *proposed*, reconciled
  against the manual log; direct conflicts stop and flag for the user
  rather than silently overwriting. Sync failure must never block
  manual entry — if a sync adapter dies mid-draft, the room keeps
  working with typed entry and nothing else changes.

**Auction entry design (Koi, solo-drafted — no second person doing
live entry):** two-tier input, because a 12-team auction is ~180
picks entered solo while also bidding:
- **Tier 1 (must be instant):** player is gone — one keystroke, no
  price/manager required yet. This is the only thing that can't be
  wrong mid-bid ("who's still available").
- **Tier 2 (can lag):** price + manager attribution — backfill during
  nomination lulls. Budget/max-bid tolerate being briefly stale; pool
  accuracy does not.
- If time runs short before Koi: the acceptable scope cut is dropping
  *opponent* budget tracking while keeping the pool accurate and
  Will's own budget precise — not the reverse.

---

## Architecture decisions

- **Node-only, no Python sidecar.** Everything on the critical path
  (Sleeper, ESPN, FFC ADP, UDK CSV, DynastyProcess crosswalk) is JSON
  or CSV, not parquet-only. The one place Python would help — nflverse
  historical game logs, for the Final Fantasy per-game bonus estimate
  — is explicitly Phase 2, not urgent, and the sidecar (if ever added)
  would be pure offline batch work talking through SQLite, so adding
  it later costs the same as adding it now. No reason to pay the
  ops-complexity cost today. (DuckDB has a Node parquet reader if it's
  ever needed without a second runtime.)
- **SQLite (better-sqlite3, WAL mode), not JSON-blob-only storage.**
  The existing `storage.json` KV store (via `window.storage` polyfill
  in the frontend, Express routes in `server/index.js`) stays for
  whatever the frontend already saves through it — SQLite is additive,
  for things a KV blob serves badly: per-user research, an append-only
  draft/keeper event log, and real projection data.
- **Player ID matching:** DynastyProcess's free, maintained crosswalk
  (`db_playerids.csv` — covers Sleeper/ESPN/Yahoo/GSIS/FantasyPros IDs)
  is the primary join mechanism. Fuzzy name matching (the old
  Streamlit app's approach) is the **fallback** for whatever doesn't
  resolve against the crosswalk — not the primary mechanism.
- **Projections stored as raw stat lines, never pre-computed points.**
  This is what lets one UDK import correctly serve three leagues with
  completely different scoring rules — scoring is applied per-league
  at query time, not baked in at import time.
- **No FantasyPros subscription** (decided). UDK stays the primary
  projection source (Will's explicit preference over synthetic/generic
  projections). DynastyProcess's free mirror of FantasyPros ECR, plus
  Fantasy Football Calculator's free ADP/auction-value API, cover
  consensus and market data without a paid API key. Revisit in spring
  if rookie dynasty (where FantasyPros' rookie-specific ECR is harder
  to replace for free) becomes a real need.
- **No realtime multi-device sync needed** — Will drafts solo, not
  with a second person doing live entry (this was asked and answered
  explicitly; an earlier "scribe pattern" idea using SSE is dropped).
  Multi-user support is still wanted, but only for **separately saved
  research** (his wife's own rankings/notes on her laptop) — a
  `user_id`-namespaced KV store is sufficient, no realtime plumbing.

---

## A real bug found in the existing `App.jsx`

`teams`, `rosterSpots`, and `replacement` currently live as single
top-level `useState` values (defaulting to `teams=10, rosterSpots=16`)
shared across all three league tabs, rather than being per-league.
This is structurally wrong: Koi and Final Fantasy are both 12
teams/15 spots, Jordan is 10 — the app cannot currently represent all
three correctly at once. **This is the first fix to make**, ahead of
anything else touching `App.jsx` — read per-league config from
`leagues.js`'s `getLeague(leagueId)` instead of global state.

The existing `scorePoints()` in `App.jsx` is also a single generic
formula with no field for `rush_att` or per-game bonuses — structurally
incapable of expressing Final Fantasy's real scoring rules, not just
missing a config value. `server/scoring.js` (already built) replaces
this; `App.jsx`'s formula should eventually defer to it rather than
being patched in place.

The `NOTES` dictionary (hand-written player blurbs) and the synthetic
per-player stat generators (`genQBStats`, hardcoded archetype sets like
`RB_PASS_CATCH`) in `App.jsx` should become the **fallback** for
players without a real UDK-imported stat line, not the default path —
this is the same staleness risk that produced an earlier caught error
(a note referencing a since-traded player's old team). Prefer real
imported data over synthetic/hand-written whenever it's available.

---

## Build status (as of this handoff)

**Done and tested**, six new files under `server/` plus `HANDOFF.md`
at the repo root — already copied onto the server, confirmed present
and matching:

- `server/db.js` — SQLite schema (users, leagues, players, projections,
  keepers, append-only draft_events, per-user KV). Creates cleanly.
- `server/leagues.js` — Koi and Final Fantasy fully seeded from the
  confirmed data above. Jordan stubbed (`source_league_id: null`)
  pending its ESPN pull. Includes the replacement-level sum-check
  described above.
- `server/scoring.js` — real per-league scoring engine. Tested against
  hand-computed vectors: a Koi QB stat line (4200 pass yd/30 TD/10
  INT/300 rush yd/3 rush TD/2 fum) scores exactly 312.0; a Koi WR line
  (90 rec/1300 yd/10 TD/1 fum) scores exactly 233.0; the Final Fantasy
  workhorse-vs-passing-back rush_att test produced exactly the
  predicted +19.0 point gap.
- `server/keepers.js` — both keeper calculators (`koiKeeperCost`,
  `ffKeeperCost`). Validated against Will's actual 2025 roster (the
  16-player table above) and his worked example.
  - **Two bugs were caught and fixed during testing — do not
    reintroduce them:** (1) waiver-add cost was computing to round 7
    instead of the stated round 8, fixed by using an effective
    original-round of 9 in the escalation formula rather than applying
    the same first-year escalation directly to the literal waiver
    constant; (2) `yearsRemaining` was double-counting the current
    season (returning 2 when the correct answer was 1 remaining year
    after this one), fixed by starting the remaining-years count one
    year later than the year already returned as the current cost.
- `server/ingest/playerIds.js` — DynastyProcess crosswalk **stub**.
  `refreshCrosswalk()` deliberately throws — not wired to live data.
  `resolvePlayerId()` does exact name+position match against whatever
  is already in the `players` table; fuzzy fallback not yet added
  (no point building it against an empty table).
- `server/ingest/udk.js` — UDK CSV importer **stub**. `importUdkCsv()`
  deliberately throws — no real UDK export has been provided yet.
  `COLUMN_MAP` is a **best guess** at UDK's actual header names and
  needs verifying against a real export's header row before first use.

**Not done, explicitly next:**

1. Get a real 2026 UDK CSV export from Will, verify/fix `COLUMN_MAP`
   in `udk.js` against its actual headers, replace the deliberate
   throw with real CSV parsing + row-by-row `resolvePlayerId()` +
   insert into `projections`.
2. Wire `refreshCrosswalk()` to actually pull DynastyProcess's
   `db_playerids.csv`.
3. Spot-check ~5 known players' computed points by hand against
   `scoring.js` post-import, same rigor as the QB/WR test vectors.
4. **Fix the `App.jsx` per-league state bug** described above — this
   one is unblocked right now, doesn't need the UDK data.
5. Switch `buildPool()` in `App.jsx` to prefer real imported
   projections over the synthetic generator, once data exists.
6. Namespace `server/index.js`'s KV routes by user (the `user_kv`
   table already exists in the schema for this).
7. Pull Jordan's ESPN league config (same process as Koi) once Will
   provides the league ID; add its scoring config to `scoring.js`
   (currently throws a clear error if `getScoringConfig('jordan')`
   is called, on purpose, rather than silently guessing).
8. Sleeper live-draft adapter for Final Fantasy (picks polling +
   reconciliation against the manual log).
9. Fast two-tier keyboard entry for Koi's auction room (see "Platform
   sync strategy" above).
10. Keeper deadline dates for Koi and Final Fantasy — still unknown.
    **Will is tracking this himself**, not a task for a coding session;
    he expects these to typically show up right at/near draft day
    rather than well in advance, so don't chase this proactively.

**Update, 2026-08-06/07: steps 4 and 6 are done.** `App.jsx` now reads
teams/rosterSpots/replacement per-league from a new `GET /api/leagues`
(backed by `leagues.js`/`db.js`), and `server/index.js`'s KV store is
namespaced per user via `user_kv` (`GET/POST /api/users`, a "Viewing
as" picker in the header, one-time migration of the old shared
`storage.json` into the default "Will" user). Per Will's explicit
call, per-user separation covers the *entire* saved-state blob
(including the draft board itself) — each user gets a fully separate
copy, no shared live-draft view between devices. Also fixed along the
way: the Dockerfile needed `node:22-alpine` + a C++ toolchain for
`better-sqlite3` to compile (was on `node:20-alpine` with no build
tools), and `vite` had drifted to an incompatible `^8.2.1` (reverted
to `^5.4.10`, matching `@vitejs/plugin-react`'s peer range).

Steps 1-3 are blocked on Will exporting the UDK CSVs. Step 7 is
blocked on Will pulling Jordan's ESPN cookies/league ID the same way
Koi's were obtained. Steps 8-9 are unblocked and increasingly
time-relevant given Final Fantasy's late-August draft. Step 10 is
Will's to track, not a coding task.
