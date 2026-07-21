# Will's FFB Draft Prep

A self-hosted fantasy football draft prep board for the 2026 season, covering
three leagues at once — **Koi** ($200 auction, half-PPR), **Final Fantasy**
(full PPR), and **Jordan** — from a single shared player pool.

## What it does

- **Player pool & projections** — QB/RB/WR/TE/K/DEF ranked by 2026 preseason
  ADP, with synthetic per-player stat lines (passing/rushing/receiving) driven
  by tunable projection curves, plus real archetype data (mobile QBs, pass-
  catching vs. grinder RBs) layered on top.
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
  external source (e.g. an exported rankings CSV) to override the synthetic
  numbers, and export the live board (points, VBD, tiers, draft status) as
  CSV — handy as a paper backup on draft day.
- **Live draft-day tracker** — mark players drafted, assign the manager who
  took them, and (on the Koi board) log the price paid, live-updating
  remaining budget and pick counts.
- **"Calculations" tab** — every projection curve, scoring weight,
  replacement level, and tier-gap parameter is exposed and editable from the
  UI, so the math behind the board can be tuned without touching code.

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

## Updating the app later

The whole frontend is the single file `src/App.jsx`. The backend is
`server/index.js`. Overwrite either file and re-run
`docker compose up -d --build` — your data in the `ffb-data` volume is
untouched by a rebuild. Pulling updates onto your server going forward is
just `git pull && docker compose up -d --build`.

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
