import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { seedLeagues, getAllLeagues, getLeague } from "./leagues.js";
import { db, getOrCreateUser } from "./db.js";
import { getAdpPool, getAdpStatus, refreshAdpPool, startAdpScheduler } from "./adp.js";
import { refreshLeagueHistory, getLeagueHistory, getWeekMatchups } from "./espn.js";
import { getHomeSettings, setHomeSettings, listChatMessages, addChatMessage, deleteChatMessage } from "./leaguehome.js";
import {
  bootstrapAdmin, attachUser, requireAuth, requireAdmin, requirePermission,
  verifyLogin, createSession, deleteSession, setSessionCookie, clearSessionCookie, getSessionTokenFromReq,
  listAuthUsers, createAuthUser, setAuthUserPassword, setAuthUserRole, setAuthUserPermissions, setAuthUserDraftTabs, deleteAuthUser,
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
    const { username, password, role, permissions, draftTabs } = req.body || {};
    res.json(createAuthUser(username, password, role, permissions, draftTabs));
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

// Which of the 3 top-level areas (draft/gameday/history) a restricted
// account can see — ignored in practice for an admin (they see
// everything), but still settable so it's ready if their role ever
// changes back.
app.put("/api/auth/users/:id/permissions", requireAdmin, (req, res) => {
  try {
    setAuthUserPermissions(Number(req.params.id), req.body && req.body.permissions);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Which of the draft board's own tabs (Koi/Final Fantasy/Jordan/
// Calculations) a restricted account with 'draft' access can see — the
// real-auth replacement for the old free-text "Viewing as" profile's
// per-profile allowed_tabs.
app.put("/api/auth/users/:id/draft-tabs", requireAdmin, (req, res) => {
  try {
    setAuthUserDraftTabs(Number(req.params.id), req.body && req.body.draftTabs);
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

// --- Storage API (mirrors the shape App.jsx already expects from
// window.storage) — single shared source of truth for the draft board,
// projections, and league config. Deliberately NOT namespaced by identity
// — one person's CSV import or drafted-player mark should be visible to
// everyone immediately, not siloed to their own copy. The user_kv table
// still supports per-user rows at the schema level; this just always
// resolves to "Will"'s row rather than trusting the request. ---
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

app.use("/api/storage", requirePermission("draft"), router);

// --- Personal notes API — per-user, unlike /api/storage above. A user's
// own inline edit/addition on a player's note (board's expanded row, not
// the CSV import panel) lives here, keyed by the REAL logged-in account
// (req.authUser.username, from the session cookie — never a client-
// supplied value, which would've let anyone read/overwrite anyone else's
// notes just by changing a query param), so it survives Will re-uploading
// the shared base notes later. Same user_kv table as the storage router,
// just resolved per-request instead of fixed to "Will" — kept as a
// separate router rather than a flag on the one above so the two scopes
// (shared vs. personal) can't get crossed by accident. ---
const notesRouter = express.Router();

notesRouter.use((req, res, next) => {
  try {
    req.user = getOrCreateUser(req.authUser.username);
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

app.use("/api/notes", requirePermission("draft"), notesRouter);

// --- Live player pool (name/pos/team/bye/ADP), cached from Fantasy Football
// Calculator and refreshed daily — see server/adp.js. Draft-prep-only
// data, gated the same way as the rest of the board. ---
app.get("/api/players", requirePermission("draft"), (req, res) => res.json(getAdpPool()));
app.get("/api/players/status", requirePermission("draft"), (req, res) => res.json(getAdpStatus()));
app.post("/api/players/refresh", requirePermission("draft"), async (req, res) => {
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
// league id is on file). See server/espn.js. Gated on the 'history' area;
// only admin can trigger a refresh against ESPN regardless of permissions
// (that's a write against an external API + cookies, not just a view). ---
app.get("/api/history/:league", requirePermission("history"), (req, res) => {
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

// --- League History "Home" page (League Social — featured video + a
// shared chat board). Admin-only for now, not just hidden client-side —
// Will's call, the page isn't finished yet. Once it's ready this can drop
// to requirePermission("history") to match the rest of League History. ---
app.get("/api/history/:league/home", requireAdmin, (req, res) => {
  res.json({ settings: getHomeSettings(req.params.league), chat: listChatMessages(req.params.league) });
});

app.put("/api/history/:league/home/settings", requireAdmin, (req, res) => {
  try {
    res.json(setHomeSettings(req.params.league, req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/history/:league/home/chat", requireAdmin, (req, res) => {
  try {
    res.json(addChatMessage(req.params.league, req.authUser.username, req.body && req.body.message));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/history/:league/home/chat/:id", requireAdmin, (req, res) => {
  try {
    deleteChatMessage(req.params.league, Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// --- Game Day live scores — ESPN leagues only (Final Fantasy/Sleeper is
// fetched directly client-side, same as the draft-day Sleeper sync; no
// server proxy needed since Sleeper's API is already public). Gated on
// the 'gameday' area permission. ---
app.get("/api/gameday/:league", requirePermission("gameday"), async (req, res) => {
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
