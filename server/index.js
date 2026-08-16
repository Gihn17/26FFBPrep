import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { seedLeagues, getAllLeagues, getLeague } from "./leagues.js";
import { db, getOrCreateUser, listUsers, setUserAllowedTabs } from "./db.js";
import { getAdpPool, getAdpStatus, refreshAdpPool, startAdpScheduler } from "./adp.js";
import { refreshLeagueHistory, getLeagueHistory, getWeekMatchups } from "./espn.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Where the data file lives. Point DATA_DIR at a mounted volume in Docker
// so data survives container rebuilds/restarts.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "storage.json");

// Only used for the one-time legacy migration below — the live storage
// routes read/write the user_kv table instead (see server/db.js).
function loadStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return {};
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    console.error("Could not read", DATA_FILE, "- nothing to migrate:", e.message);
    return {};
  }
}

// Seeds/refreshes the leagues table from LEAGUE_DEFAULTS. Idempotent
// upsert by id, safe to run on every boot.
seedLeagues();

// Pulls the live ADP pool on boot, then every 24h — see server/adp.js.
startAdpScheduler();

// One-time migration: whatever used to live in the shared storage.json
// (from before per-user KV) becomes Will's data — the default user this
// app has always run as solo. Only fills gaps (never overwrites), so
// it's safe to run on every boot even after the first migration.
// storage.json itself is left on disk afterward, untouched — dead
// legacy file, harmless.
(function migrateLegacyStore() {
  const legacy = loadStore();
  const keys = Object.keys(legacy);
  if (keys.length === 0) return;
  const will = getOrCreateUser("Will");
  const has = db.prepare("SELECT 1 FROM user_kv WHERE user_id = ? AND key = ?");
  const insert = db.prepare("INSERT INTO user_kv (user_id, key, value) VALUES (?, ?, ?)");
  for (const key of keys) {
    if (has.get(will.id, key)) continue;
    insert.run(will.id, key, legacy[key]);
  }
})();

const app = express();
app.use(express.json({ limit: "15mb" })); // draft boards + CSV imports can add up

// --- Users (no real auth — a name is enough, see server/db.js) ---
app.get("/api/users", (req, res) => res.json(listUsers()));

app.post("/api/users", (req, res) => {
  try {
    res.json(getOrCreateUser(req.body && req.body.name));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Which board tabs a user can see — null/omitted "tabs" means "all tabs".
// No real auth (see db.js) — anyone can change anyone's access, same as
// anyone can already switch "Viewing as" to anyone.
app.put("/api/users/:id/tabs", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "invalid user id" });
    res.json(setUserAllowedTabs(id, req.body && req.body.tabs));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// --- Storage API (mirrors the shape App.jsx already expects from
// window.storage) — single shared source of truth for the draft board,
// projections, and league config. Deliberately NOT namespaced by "Viewing
// as" (that used to split this per-person; backed out per request — one
// person's CSV import or drafted-player mark should be visible to everyone
// immediately, not siloed to their own copy). "Viewing as" now only drives
// Tab Access and the Import panel's upload permission below — nothing
// about which data gets read or written. The user_kv table still supports
// per-user rows at the schema level; this just always resolves to "Will"'s
// row rather than trusting the request. ---
const router = express.Router();

router.use((req, res, next) => {
  try {
    req.user = getOrCreateUser("Will");
    next();
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/", (req, res) => {
  const prefix = req.query.prefix || "";
  const rows = db.prepare("SELECT key FROM user_kv WHERE user_id = ? AND key LIKE ?")
    .all(req.user.id, prefix + "%");
  res.json({ keys: rows.map((r) => r.key), prefix: req.query.prefix || null });
});

router.get("/:key", (req, res) => {
  const row = db.prepare("SELECT value FROM user_kv WHERE user_id = ? AND key = ?")
    .get(req.user.id, req.params.key);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json({ key: req.params.key, value: row.value });
});

router.put("/:key", (req, res) => {
  const value = req.body && req.body.value;
  if (typeof value !== "string") {
    return res.status(400).json({ error: "body must be JSON with a string 'value' field" });
  }
  db.prepare(`
    INSERT INTO user_kv (user_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(req.user.id, req.params.key, value);
  res.json({ key: req.params.key, value });
});

router.delete("/:key", (req, res) => {
  db.prepare("DELETE FROM user_kv WHERE user_id = ? AND key = ?").run(req.user.id, req.params.key);
  res.json({ key: req.params.key, deleted: true });
});

app.use("/api/storage", router);

// --- Personal notes API — per-user, unlike /api/storage above. A user's
// own inline edit/addition on a player's note (board's expanded row, not
// the CSV import panel) lives here, keyed by "Viewing as", so it survives
// Will re-uploading the shared base notes later. Same user_kv table as
// the storage router, just resolved per-request instead of fixed to
// "Will" — kept as a separate router rather than a flag on the one above
// so the two scopes (shared vs. personal) can't get crossed by accident. ---
const notesRouter = express.Router();

notesRouter.use((req, res, next) => {
  try {
    req.user = getOrCreateUser(req.query.user || "Will");
    next();
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

notesRouter.get("/:key", (req, res) => {
  const row = db.prepare("SELECT value FROM user_kv WHERE user_id = ? AND key = ?")
    .get(req.user.id, req.params.key);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json({ key: req.params.key, value: row.value });
});

notesRouter.put("/:key", (req, res) => {
  const value = req.body && req.body.value;
  if (typeof value !== "string") {
    return res.status(400).json({ error: "body must be JSON with a string 'value' field" });
  }
  db.prepare(`
    INSERT INTO user_kv (user_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(req.user.id, req.params.key, value);
  res.json({ key: req.params.key, value });
});

app.use("/api/notes", notesRouter);

// --- Live player pool (name/pos/team/bye/ADP), cached from Fantasy Football
// Calculator and refreshed daily — see server/adp.js. ---
app.get("/api/players", (req, res) => res.json(getAdpPool()));
app.get("/api/players/status", (req, res) => res.json(getAdpStatus()));
app.post("/api/players/refresh", async (req, res) => {
  try {
    const count = await refreshAdpPool();
    res.json({ ok: true, count });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true, dataFile: DATA_FILE }));

// --- League config (teams/roster spots/replacement levels, per league) ---
app.get("/api/leagues", (req, res) => res.json(getAllLeagues()));

// --- League History (ESPN leagues only — Koi now, Jordan once its ESPN
// league id is on file). See server/espn.js. ---
app.get("/api/history/:league", (req, res) => {
  res.json(getLeagueHistory(req.params.league));
});

app.post("/api/history/:league/refresh", async (req, res) => {
  const league = getLeague(req.params.league);
  if (!league || league.source_platform !== "espn" || !league.source_league_id) {
    return res.status(400).json({ error: `${req.params.league} has no ESPN league id on file yet` });
  }
  const currentYear = new Date().getFullYear();
  // Default start year is a conservative floor, not a known cutoff — how
  // far back a league's data actually goes varies per league (confirmed:
  // Koi reaches back to 2011, 2010 and earlier 404 even with cookies).
  // refreshLeagueHistory reports every year it couldn't reach in `skipped`
  // rather than guessing where to stop, so a few extra no-op years here
  // cost one HTTP request each, not correctness.
  const startYear = Number(req.body?.startYear) || 2000;
  const endYear = Number(req.body?.endYear) || currentYear;
  try {
    const result = await refreshLeagueHistory(req.params.league, league.source_league_id, startYear, endYear);
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// --- Game Day live scores — ESPN leagues only (Final Fantasy/Sleeper is
// fetched directly client-side, same as the draft-day Sleeper sync; no
// server proxy needed since Sleeper's API is already public). ---
app.get("/api/gameday/:league", async (req, res) => {
  const league = getLeague(req.params.league);
  if (!league || league.source_platform !== "espn" || !league.source_league_id) {
    return res.status(400).json({ error: `${req.params.league} isn't an ESPN league with a league id on file — Final Fantasy uses Sleeper directly` });
  }
  const week = req.query.week ? Number(req.query.week) : null;
  try {
    const result = await getWeekMatchups(league.source_league_id, week);
    if (result.status === 401) return res.status(401).json({ error: "ESPN needs auth cookies for this — set them in Settings" });
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// --- Serve the built frontend ---
const distDir = path.join(__dirname, "..", "dist");
app.use(express.static(distDir));
app.get("*", (req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FFB draft prep server listening on port ${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});
