# Handoff: server/ additions (Phase 0, foundation layer)

These six files were built and tested against real league data, but are
**not yet wired into `App.jsx` or `server/index.js`**. That's the next
Claude Code session's job — this note is the starting point for it.

## What's here

- `server/db.js` — SQLite schema (better-sqlite3, WAL mode). Tables for
  users, leagues, players, projections (raw stat lines, not points),
  keepers, an append-only draft_events log, and a per-user KV store.
- `server/leagues.js` — Koi and Final Fantasy configs, fully seeded from
  data pulled directly off ESPN's and Sleeper's own APIs (see the repo
  owner's chat history for the exact curl calls used). Jordan is stubbed
  — same shape, `source_league_id: null` — pending its ESPN pull.
- `server/scoring.js` — real per-league scoring, replacing the single
  generic formula in `App.jsx`'s `scorePoints()`. Adds two terms that
  formula structurally cannot express: `rush_att` (Final Fantasy pays
  0.1 pt/carry — worth ~19 pts/season separating a 300-carry workhorse
  from a 110-carry passing-down back) and per-game yardage bonuses
  (100/200/300/400-yd games), which are estimated rather than exact
  until real weekly logs are wired in (Phase 2, see comments in file).
- `server/keepers.js` — Koi (dollar escalation, no cap on years) and
  Final Fantasy (round escalation, accelerating, hard cutoff at round 1)
  keeper cost calculators. Validated line-by-line against the real
  Final Fantasy roster (12 candidates, all first-time keepers, one
  ineligible — Lamar Jackson) and the worked example the repo owner
  gave by hand (8th → 7th → 5th).
- `server/ingest/playerIds.js` — DynastyProcess ID crosswalk, **stub**.
  `refreshCrosswalk()` throws on purpose — not pulling live data yet.
- `server/ingest/udk.js` — UDK CSV importer, **stub**. `importUdkCsv()`
  throws on purpose — no real UDK export has been provided. `COLUMN_MAP`
  is a best guess at UDK's header names and needs checking against a
  real export's header row before first use.

All four non-stub modules were tested together in one process with no
conflicts (schema creates cleanly, leagues seed, scoring matches hand-
verified test vectors, keeper math matches the hand-verified table).

## What's deliberately NOT done here

- `App.jsx` is untouched. It still has `teams`/`rosterSpots`/`replacement`
  as single global state values (currently defaulting to teams=10,
  rosterSpots=16 — stale for both Koi and Final Fantasy, which are both
  12/15). That's a real bug: it makes it structurally impossible to
  represent three leagues with different team counts at the same time.
  Fix: read these per-league from `getLeague(leagueId)` in `leagues.js`
  instead of top-level `useState`.
- `App.jsx`'s `scorePoints()` and `buildPool()` still use the synthetic
  per-player stat generators (`genQBStats`, hardcoded archetype tag sets
  like `RB_PASS_CATCH`, the `NOTES` dictionary). These should become the
  FALLBACK for players without a real UDK-imported stat line, not the
  default path. Wiring: once `importUdkCsv()` is real, `buildPool()`
  should check `projections` first per player, falling back to the
  synthetic generator only for anyone unmatched.
- `server/index.js`'s KV store is untouched — still one shared
  `storage.json`, not namespaced by user. Namespacing it under the new
  `user_kv` table (already in the schema) is a small, mostly mechanical
  change once you're ready for it — not required to unblock anything
  else.
- Nothing here touches the Sleeper live-draft adapter, the ESPN config
  importer, or the draft-room UI. Those come after this foundation is
  wired in.

## Known open flags in the data (not bugs — flagged in source comments)

- Final Fantasy's replacement levels (15/47/55/15/12/12, sum=156) don't
  match the "sums to teams × roster_spots" rule that validated Koi's
  levels exactly (sum=180). Left as given, not auto-corrected — confirm
  with the repo owner whether this is intentional.
- Jordan's replacement levels (13/47/49/13/10/10, sum=142) have the same
  issue relative to its unconfirmed roster size. Also left as given.
- Two ESPN statIds in Koi's scoring (`16`, `46` — both 2.0 pts) are
  pattern-matched as 50+ yard TD bonuses, not confirmed via the league
  settings UI the way everything else was. Low-stakes either way (a
  few points/season), not modeled in `scoring.js` regardless.

## Suggested next session's order of operations

1. Point `mapColumns()` in `udk.js` at a real UDK export's header row,
   fix `COLUMN_MAP`, replace the deliberate throw with real parsing.
2. Wire `refreshCrosswalk()` in `playerIds.js` to actually pull
   `db_playerids.csv` from DynastyProcess.
3. Run a real UDK import, spot-check ~5 known players' computed points
   by hand against `scoring.js`, same way the QB/WR test vectors were
   checked here.
4. Fix `App.jsx`'s per-league state bug (`teams`/`rosterSpots`), reading
   from `leagues.js` instead of global `useState`.
5. Switch `buildPool()` to prefer real projections over the synthetic
   generator.
6. Wire `server/index.js`'s KV routes to `user_kv`, namespaced by user.

Steps 1–3 are blocked on the repo owner exporting the 2026 UDK CSVs.
Steps 4–6 are unblocked right now.
