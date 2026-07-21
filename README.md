# Will's FFB Draft Prep

## Push this to GitHub

This folder is already a git repo with one commit, and `origin` is already
set to your repo:

```
origin  https://github.com/Gihn17/26FFBPrep.git
```

From this folder, just push:

```bash
git push -u origin main
```

You'll be prompted for your GitHub username and a **personal access token**
(not your account password — GitHub removed password auth for git over
HTTPS). If you don't have a token handy: github.com → Settings → Developer
settings → Personal access tokens → generate one with `repo` scope, use it
as the password when prompted.

**If that push gets rejected** (`fetch first` / non-fast-forward): that
means 26FFBPrep already has a commit on GitHub — likely an auto-generated
README from when you created the repo through the web UI. Since this repo's
own README is the real one, easiest fix is to just overwrite it:

```bash
git push -u origin main --force
```

If you'd rather keep whatever's already up there instead of overwriting it,
pull it down and merge first:

```bash
git pull origin main --allow-unrelated-histories
# resolve any conflicts, then:
git push -u origin main
```

Prefer SSH over HTTPS? Swap the remote:
```bash
git remote set-url origin git@github.com:Gihn17/26FFBPrep.git
```

Note the initial commit was made with a placeholder git identity
(`Will <will@localhost>`) since it was created outside your normal dev
environment. If you care about commit author info, either amend it first —
```bash
git commit --amend --author="Your Name <you@example.com>" --no-edit
```
— or just don't worry about it; it's a fresh repo either way.

After it's on GitHub, pulling updates onto your server going forward is just
`git pull && docker compose up -d --build`.

Standalone Docker build of the fantasy football draft prep board (Koi /
Final Fantasy / Jordan boards, VBD engine, auction values, CSV imports,
draft-day tracker) with server-side persistence.

## Run it

From this directory, on your server:

```bash
docker compose up -d --build
```

Then visit `http://<your-server-ip>:9090`.

To rebuild after copying in an updated `src/App.jsx` (e.g. a newer version
from Claude):

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

This now runs a small Node/Express backend (`server/index.js`) that stores
draft state, imports, and settings in a JSON file at `/app/data/storage.json`
inside the container. `docker-compose.yml` mounts that path to a named
Docker volume (`ffb-data`), so:

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
`server/index.js`. When you get an updated version of either from Claude,
overwrite the file and re-run `docker compose up -d --build` — your data in
the `ffb-data` volume is untouched by a rebuild.

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
