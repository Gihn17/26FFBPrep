# Will's FFB Draft Prep

A self-hosted fantasy football site for 2026, covering three leagues —
**Koi** ($200 auction, half-PPR), **Final Fantasy** (full PPR), and
**Jordan** — from a single shared player pool. Started as a single draft
board and grew into a small multi-page site:

| Page | What's there |
|---|---|
| `/` | Landing page — links to everything below |
| `/draft` | The draft prep board (player pool, VBD/tiers, auction values, live draft tracker) |
| `/league-koi` | League History for Koi — season standings, all-time stat records, head-to-head, championship history, per-team pages |
| `/gameday` | A live-ish scoreboard for game day — functional, still being refined |

## Draft Prep Board (`/draft`)

- **Player pool** — QB/RB/WR/TE/K/DEF ranked by 2026 preseason ADP. No
  synthetic stats or fabricated projections: every player shows blank
  points/VBD/tier/auction value until you import real data for them (see
  "CSV Import Format" below).
- **Per-league scoring** — each league has its own scoring weights and
  replacement-level settings, so the same player pool produces different
  points, VBD (value-based drafting), and tiers per league.
- **VBD & tiering engine** — ranks every player by value over replacement and
  auto-groups them into tiers based on configurable gap thresholds.
- **Auction values** (Koi board) — converts VBD into $200-budget auction
  dollar values per team, with support for manual per-player overrides.
- **Scouting notes** — a positive/negative blurb and a green/yellow/red/pink
  outlook tag for every notable player, editable inline.
- **CSV import/export** — pull in real projections/auction values from an
  external source (e.g. an exported UDK CSV) — this is the only way points
  get onto the board. Also exports the live board (points, VBD, tiers, draft
  status) as CSV — handy as a paper backup on draft day.
- **Live draft-day tracker** — mark players drafted, assign the manager who
  took them, and (on the Koi board) log the price paid, live-updating
  remaining budget and pick counts.
- **"Calculations" tab** — every scoring weight, replacement level, and
  tier-gap parameter is exposed and editable from the UI (plus the CSV
  import panel itself), so the math behind the board can be tuned without
  touching code.

## League History (`/league-koi`)

Five sub-pages built from ESPN's own league API — real history, not
projections or estimates:

- **Seasons** — defaults to the current season's live standings (record,
  an Expected/all-play/weekly-high-score set of columns, and — once the
  season is 5 weeks in — a playoff-probability column, based on what
  percentage of every team-season in this league's history with that exact
  record went on to make the playoffs). Switch to All Time or a custom year
  range for combined multi-season standings, with each individual season
  still broken out below it.
- **Stats** — all-time (or filtered) leaderboards for single-game/season
  scoring extremes, blowouts vs. nailbiters, and win/loss streaks, shown as
  a top-3 podium with a "Show Top 10" expand.
- **H2H** — defaults to a week-by-week matchup browser: every game that
  week, each card showing both teams' record and that pairing's all-time
  head-to-head record and current streak. Switch to "Compare Teams" for a
  classic two-owner picker across all of history.
- **Champs** — dynasty rankings, year-by-year championship history, and a
  playoff-legends leaderboard (most titles, most playoff wins, etc).
- **Teams** — one card per franchise, tracked by ESPN's stable owner GUID
  rather than team name/ID, so a franchise's whole history holds together
  across name changes and ESPN's own season-to-season ID reassignment.
  Each links to a full history page for that team (season-by-season
  record, career "team records," head-to-head vs. any other franchise).

### Data source & setup

Pulled from ESPN's undocumented v3 Fantasy API. Recent seasons (2024+ for
Koi) work with no auth at all; 2011 through 2023 need a logged-in ESPN
session. Set your `espn_s2`/`SWID` cookies once under the draft board's
**Settings tab → ESPN Access** (grab them from your browser's dev tools —
Application/Storage → Cookies → espn.com — while logged into ESPN;
Will-only to edit, like the rest of Settings). Without cookies, League
History still works, just starting from whichever seasons are public.

Hit **"Refresh History"** (top of any League History page, Will-only) to
pull the latest data from ESPN — safe to re-run any time, it's an upsert,
not a wipe-and-reload. Currently Koi-only; Jordan gets the same treatment
once its ESPN league ID is on file (Final Fantasy is a Sleeper league, so
it'd need an entirely different data source, not just a config change).

### Known caveats

- **Team logos** are whatever image each manager set on ESPN, sometimes
  years ago — a few are on now-defunct hosts (tinypic.com is gone
  entirely) and fail to load. Those fall back to a colored initials circle
  automatically; nothing to fix if you see one.
- **Ownership corrections**: ESPN's data occasionally attributes a team to
  the wrong real person (an ESPN account later reused by someone else).
  These are hand-corrected as they're found, in
  `src/pages/history/compute.js` → `OWNERSHIP_CORRECTIONS` — not detected
  automatically.

## Game Day (`/gameday`)

A live-ish scoreboard for whichever league you pick (Koi via ESPN, Final
Fantasy via Sleeper; Jordan once it has an ESPN league ID on file). Polls
automatically — every 2 minutes for ESPN, every 5 for Sleeper, matching
each platform's own norms — with a pause/resume toggle, a manual "sync
now," and a visible "last synced" timestamp rather than presenting numbers
as certainly live.

**Still a work in progress.** It's built and functional, but ESPN's true
in-game live-score accuracy hasn't been verified against a real live NFL
week yet (built during the preseason) — Sleeper's side has been. More to
come here once the season's underway.

## Run it

This is a Node/Express server (serves the built React frontend + a small
JSON-file storage API) packaged for Docker.

From this directory, on your server:

```bash
docker compose up -d --build
```

Then visit `http://<your-server-ip>:9090`.

To rebuild after pulling in code changes:

```bash
docker compose up -d --build
```

To stop it:

```bash
docker compose down
```

### Without docker-compose

```bash
docker build -t ffb-draft-prep .
docker run -d --name ffb-draft-prep -p 9090:3000 \
  -v ffb-data:/app/data --restart unless-stopped ffb-draft-prep
```

## CSV Import Format

There's no synthetic data anymore — this is the only way a player gets
real points/VBD/tier/auction values. Import lives in the app under the
**"Calculations" tab → "Import Real Data"**.

You can drop in multiple files at once (e.g. one export per position), and
each file gets matched and merged into the same player pool by name.

### Required

- **One column identifying the player.** Header just needs to contain
  `player` or `name` (e.g. "Player", "Player Name", "Name" all work).
  Everything else in the row is optional — a row with no recognizable name
  column is skipped entirely, and a row whose name doesn't match anyone in
  the pool gets listed as "unmatched" after import (nothing is silently
  dropped).

### Optional — raw stats

Drive both Koi and Final Fantasy, via each league's own scoring weights.
Jordan *always* scores off these — see the note below.

| Field | Header should contain |
|---|---|
| Pass yards | `pass yds` / `passing yds` / `pyds` |
| Pass TD | `pass td` / `passing td` / `ptd` |
| Interceptions | `int` / `interception` |
| Rush yards | `rush yds` / `rushing yds` / `ryds` |
| Rush TD | `rush td` / `rushing td` / `rtd` |
| Receptions | `receptions` / `rec` / `catches` |
| Rec yards | `rec yds` / `receiving yds` / `reyds` |
| Rec TD | `rec td` / `receiving td` / `retd` |
| Fumbles lost | `fumbles lost` / `fuml` / `fumbles` |

### Optional — direct point totals

Override the raw-stat math for that one league. K/DEF *only* use these,
since they don't have a raw stat line.

| Field | Header should contain | Applies to |
|---|---|---|
| Half-PPR points | `half ppr` / `koi` | Koi only |
| Full-PPR / generic points | `full ppr` / `ppr pts` / `fpts` / `fantasy points` / `points` / `proj` | Final Fantasy only |

A generic header like "Points" or "FPTS" is treated as the **Final
Fantasy** total, not Koi — if it's actually a half-PPR number meant for
Koi, either rename the header to include "half ppr"/"koi" or remap it
manually (see "Fixing a missed column" below). **Jordan has no
direct-points column at all** — it always computes from the raw stats
above via its own scoring weights, so a Jordan projection needs the raw
stat columns, not a points column.

### Optional — metadata (fills in the board directly, no scoring math)

| Field | Header should contain |
|---|---|
| Auction $ | `auction` / `dollar` / `aav` / `$` (Koi board only) |
| Tier | `tier` |
| Position rank | `pos rank` / `position rank` / `pos rk` |
| Risk | `risk` |
| Upside | `upside` / `ceiling` |
| Write-up | `writeup` / `outlook` / `blurb` / `summary` / `analysis` / `notes` / `comment` — replaces the player's "Positive" note |
| Bye week | `bye week` / `bye` |

### Column order doesn't matter

Columns are matched by **header text**, not position — put them in
whatever order your export uses. Matching is case-insensitive and ignores
spaces/punctuation (`"Pass Yds"`, `"PassYds"`, and `"pass-yds"` all match
the same way).

### A real gotcha: spelled-out "Yards" won't auto-match

The auto-detect patterns look for the abbreviation **"Yds"**, not
"Yards" — `"Pass Yds"` auto-matches, but `"Passing Yards"` or `"Pass
Yards"` does **not**. If your export uses the spelled-out form, either
rename the header before importing or use the column dropdown in the app
to map it manually — every field has one, and it overrides the guess.

### Fixing a missed column

After adding a file, each expected field shows as a dropdown pre-filled
with the app's best guess (or blank if nothing matched). Just reassign
the dropdown to the correct column — nothing about the file itself needs
to change.

## Where your data lives

The backend (`server/index.js`) stores draft state, imports, and settings in
a JSON file at `/app/data/storage.json` inside the container.
`docker-compose.yml` mounts that path to a named Docker volume (`ffb-data`),
so:

- **Data is shared across every device that opens the app's URL** — draft
  from your laptop, check it on your phone, same live data, no per-browser
  split like a plain static-site version would have.
- **Data survives container restarts and rebuilds** as long as the
  `ffb-data` volume isn't deleted. `docker compose down` is safe;
  `docker compose down -v` would wipe it (the `-v` removes volumes too).
- **No authentication** — anyone who can reach the server on your network
  can read/write this data via `/api/storage/*`. Fine for LAN-only use
  behind your home network; if you ever expose this to the internet, put it
  behind a reverse proxy with auth first (e.g. your existing setup for other
  self-hosted services).
- **Backing it up**: the whole dataset is one JSON file. To copy it out:
  ```bash
  docker cp ffb-draft-prep:/app/data/storage.json ./storage-backup.json
  ```
- The "Export CSV" button in the app is still worth using before a live
  draft as a human-readable snapshot, independent of this backend.

League History lives separately, in a SQLite database at
`/app/data/ffb.sqlite` in the same `ffb-data` volume (same persistence
story as above — safe across restarts/rebuilds, gone if the volume is
deleted). It's entirely rebuildable by hitting "Refresh History" again, so
losing it isn't as costly as losing draft state, but it can still be
backed up the same way:
```bash
docker cp ffb-draft-prep:/app/data/ffb.sqlite ./history-backup.sqlite
```

## Updating the app later

The draft board is one file, `src/App.jsx`; the other pages live under
`src/pages/` (`Landing.jsx`, `GameDay.jsx`, `history/` for everything under
`/league-koi`). The backend is `server/index.js` plus `server/espn.js` for
the ESPN integration. Change what you need and re-run
`docker compose up -d --build` — your data in the `ffb-data` volume
(draft state) and the SQLite DB (League History) are both untouched by a
rebuild. Pulling updates onto your server going forward is just
`git pull && docker compose up -d --build`.

## Local development (optional)

```bash
npm install
npm run build   # builds the frontend into dist/
npm start        # runs the Express server (serves dist/ + the API) on :3000
```

Or for frontend hot-reload during development, run `npm run dev` (Vite dev
server on :5173) in one terminal and `npm start` in another — note the dev
server won't proxy `/api` to the Express server unless you add that to
`vite.config.js`, so for testing the storage backend, `npm run build && npm start`
is simplest.
