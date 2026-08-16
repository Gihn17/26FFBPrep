import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { seedLeagues, getAllLeagues, getLeague } from "./leagues.js";
import { db, getOrCreateUser, listUsers, setUserAllowedTabs } from "./db.js";
import { getAdpPool, getAdpStatus, refreshAdpPool, startAdpScheduler } from "./adp.js";
import { refreshLeagueHistory, getLeagueHistory, getWeekMatchups } from "./espn.js";
import {
  bootstrapAdmin, attachUser, requireAuth, requireAdmin,
  verifyLogin, createSession, deleteSession, setSessionCookie, clearSessionCookie, getSessionTokenFromReq,
  listAuthUsers, createAuthUser, setAuthUserPassword, setAuthUserRole, deleteAuthUser,
} from "./auth.js";

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

// Creates the first admin account (random password, printed once to the
// log) on a totally fresh install — no-op after that. See server/auth.js.
bootstrapAdmin();

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
app.use(attachUser); // attaches req.authUser if there's a valid session cookie; never blocks by itself

// --- Real auth — see server/auth.js. Login/logout/me stay public (you
// need to hit them to log in at all); everything else below is gated by
// requireAuth (any logged-in user — Game Day/League History) or
// requireAdmin (Will only — the draft board and account management). ---
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = verifyLogin(username, password);
  if (!user) return res.status(401).json({ error: "wrong username or password" });
  const { token } = createSession(user.id);
  setSessionCookie(req, res, token);
  res.json({ user });
});

app.post("/api/auth/logout", (req, res) => {
  deleteSession(getSessionTokenFromReq(req));
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.authUser) return res.status(401).json({ error: "not logged in" });
  res.json({ user: req.authUser });
});

app.put("/api/auth/me/password", requireAuth, (req, res) => {
  try {
    setAuthUserPassword(req.authUser.id, req.body && req.body.password);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// --- Account management (admin only) — create/edit/remove the accounts
// that can log in at all, and what role (admin/restricted) each has. ---
app.get("/api/auth/users", requireAdmin, (req, res) => res.json(listAuthUsers()));

app.post("/api/auth/users", requireAdmin, (req, res) => {
  try {
    const { username, password, role } = req.body || {};
    res.json(createAuthUser(username, password, role));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put("/api/auth/users/:id/password", requireAdmin, (req, res) => {
  try {
    setAuthUserPassword(Number(req.params.id), req.body && req.body.password);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put("/api/auth/users/:id/role", requireAdmin, (req, res) => {
  try {
    setAuthUserRole(Number(req.params.id), req.body && req.body.role);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/auth/users/:id", requireAdmin, (req, res) => {
  try {
    if (Number(req.params.id) === req.authUser.id) throw new Error("can't delete your own account while logged in as it");
    deleteAuthUser(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// --- Draft-board profile users (Will/wife's saved research identity —
// NOT login accounts, see server/db.js) — admin-only now that this is on
// the internet; a restricted account has no business touching these. ---
app.get("/api/users", requireAdmin, (req, res) => res.json(listUsers()));

app.post("/api/users", requireAdmin, (req, res) => {
  try {
    res.json(getOrCreateUser(req.body && req.body.name));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Which board tabs a draft-profile user can see — unrelated to the
// admin/restricted login role above, see db.js.
app.put("/api/users/:id/tabs", requireAdmin, (req, res) => {
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

app.use("/api/storage", requireAdmin, router);

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

app.use("/api/notes", requireAdmin, notesRouter);

// --- Live player pool (name/pos/team/bye/ADP), cached from Fantasy Football
// Calculator and refreshed daily — see server/adp.js. Draft-prep-only data,
// admin-only like the rest of the board. ---
app.get("/api/players", requireAdmin, (req, res) => res.json(getAdpPool()));
app.get("/api/players/status", requireAdmin, (req, res) => res.json(getAdpStatus()));
app.post("/api/players/refresh", requireAdmin, async (req, res) => {
  try {
    const count = await refreshAdpPool();
    res.json({ ok: true, count });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true, dataFile: DATA_FILE }));

// --- League config (teams/roster spots/replacement levels, per league) —
// any logged-in user, since Game Day (restricted-accessible) needs it. ---
app.get("/api/leagues", requireAuth, (req, res) => res.json(getAllLeagues()));

// --- League History (ESPN leagues only — Koi now, Jordan once its ESPN
// league id is on file). See server/espn.js. Any logged-in user can read
// it; only admin can trigger a refresh against ESPN. ---
app.get("/api/history/:league", requireAuth, (req, res) => {
  res.json(getLeagueHistory(req.params.league));
});

app.post("/api/history/:league/refresh", requireAdmin, async (req, res) => {
  const league = getLeague(req.params.league);
  if (!league || league.source_platform !== "espn" || !league.source_league_id) {
    return res.status(400).json({ error: `${req.params.league} has no ESPN league id on file yet` });
  }
  const currentYear = new Date().getFullYear();
  // 2011 is Koi's real floor, not a guess — verified directly: 2010 and
  // earlier 404 even with valid cookies (the league didn't exist yet).
  // Starting there instead of scanning further back saves a dozen-plus
  // guaranteed-empty HTTP round-trips on every refresh. Still overridable
  // via the request body for whenever a second ESPN league (Jordan) with a
  // different history is wired up here.
  const startYear = Number(req.body?.startYear) || 2011;
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
// server proxy needed since Sleeper's API is already public). Any
// logged-in user — this is one of the two things a restricted account
// can see. ---
app.get("/api/gameday/:league", requireAuth, async (req, res) => {
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
app.use("/ffb", express.static(distDir));
app.get("/ffb*", (req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FFB draft prep server listening on port ${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});
