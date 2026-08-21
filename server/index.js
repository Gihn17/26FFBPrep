import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { seedLeagues, getAllLeagues, getLeague } from "./leagues.js";
import { db, getOrCreateUser } from "./db.js";
import { getAdpPool, getAdpStatus, refreshAdpPool, startAdpScheduler } from "./adp.js";
import { getFpPool, getFpStatus, refreshFpPool, attachAdp, normName, normTeam } from "./fantasypros.js";
import { previewMigration, applyMigration } from "./fpMigration.js";
import { refreshLeagueHistory, getLeagueHistory, getWeekMatchups, getRoster, getFreeAgents, getSeasonDraftWithPositions } from "./espn.js";
import { refreshSleeperHistory } from "./sleeperHistory.js";
import { getHomeSettings, setHomeSettings, listChatMessages, addChatMessage, deleteChatMessage } from "./leaguehome.js";
import { getSetting, hasSetting, setSetting, deleteSetting } from "./settings.js";
import {
  listKeeperNotes, upsertKeeperNote, deleteKeeperNote,
  listWaiverWire, replaceWaiverWire,
  listTradeProposals, createTradeProposal, updateTradeProposal,
  listTransactions, appendTransaction,
} from "./gm.js";
import { runChat } from "./chat.js";
import { replaceSeasonDraftHistory, getDraftHistorySeasons, getPositionalTrends } from "./draftHistory.js";
import {
  bootstrapAdmin, attachUser, requireAuth, requireAdmin, requirePermission, requireHistoryLeague,
  requireHomeAdmin, requireHomePoster,
  verifyLogin, createSession, deleteSession, setSessionCookie, clearSessionCookie, getSessionTokenFromReq,
  listAuthUsers, createAuthUser, setAuthUserPassword, setAuthUserRole, setAuthUserPermissions,
  setAuthUserDraftTabs, setAuthUserHistoryLeagues, setAuthUserHomeAdmin, setAuthUserHomePoster,
  deleteAuthUser, recordLogin, listLoginLog,
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
// This app sits behind nginx-proxy-manager — without trusting the proxy,
// req.ip would just be the Docker network's internal gateway address for
// every request, which makes the login log useless. Only one hop (the
// proxy) between the internet and this container, so trusting it here
// doesn't open up IP spoofing from further away.
app.set("trust proxy", true);
app.use(express.json({ limit: "15mb" })); // draft boards + CSV imports can add up
app.use(attachUser); // attaches req.authUser if there's a valid session cookie; never blocks by itself

// --- Real auth — see server/auth.js. Login/logout/me stay public (you
// need to hit them to log in at all); everything else below is gated by
// requireAuth (any logged-in user — Game Day/League History) or
// requireAdmin (Will only — the draft board and account management). ---
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = verifyLogin(username, password);
  recordLogin({ usernameAttempted: username, success: !!user, ip: req.ip, userAgent: req.headers["user-agent"] });
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

// Recent login attempts (success and failure) for one account — see
// server/auth.js's login_log table. Admin-only, and only ever surfaced
// here, never through the login response itself.
app.get("/api/auth/users/:id/logins", requireAdmin, (req, res) => {
  res.json(listLoginLog(Number(req.params.id)));
});

app.post("/api/auth/users", requireAdmin, (req, res) => {
  try {
    const { username, password, role, permissions, draftTabs, historyLeagues, homeAdmin, homePoster } = req.body || {};
    res.json(createAuthUser(username, password, role, permissions, draftTabs, historyLeagues, homeAdmin, homePoster));
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

// Which of the 3 top-level areas (draft/gameday/history) a 'limited'
// account can see — ignored in practice for admin/standard (they see
// everything), but still settable so it's ready if their role ever
// changes back to 'limited'.
app.put("/api/auth/users/:id/permissions", requireAdmin, (req, res) => {
  try {
    setAuthUserPermissions(Number(req.params.id), req.body && req.body.permissions);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Which of the draft board's own tabs (Koi/Final Fantasy/Jordan/
// Calculations) a 'limited' account with 'draft' access can see — the
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

// Which WHOLE league's History (Koi is the only one so far) a 'limited'
// account with 'history' access can see — granting a league grants every
// sub-page inside it, unlike draft-tabs above.
app.put("/api/auth/users/:id/history-leagues", requireAdmin, (req, res) => {
  try {
    setAuthUserHistoryLeagues(Number(req.params.id), req.body && req.body.historyLeagues);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Can edit Home's video link + moderate its chat. Independent of role/
// history_leagues (see server/auth.js's file header) — only meaningful
// alongside 'koi' in history_leagues, but harmless to set on anyone else.
app.put("/api/auth/users/:id/home-admin", requireAdmin, (req, res) => {
  try {
    setAuthUserHomeAdmin(Number(req.params.id), req.body && req.body.homeAdmin);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Can post in Home's chat (not edit the link, not delete others' messages).
app.put("/api/auth/users/:id/home-poster", requireAdmin, (req, res) => {
  try {
    setAuthUserHomePoster(Number(req.params.id), req.body && req.body.homePoster);
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

// --- Third-party API keys/credentials (FantasyPros, ESPN cookies) —
// admin-only, see server/settings.js's file header for why this isn't the
// shared /api/storage mechanism (any draft-permitted account, not just
// admin, could read a value stored there). The raw value is never sent
// back to a client once saved, only whether it's set — status route, not
// a value round-trip. ---
app.get("/api/settings/fantasypros-key/status", requireAdmin, (req, res) => {
  res.json({ set: hasSetting("fantasypros-api-key") });
});

app.put("/api/settings/fantasypros-key", requireAdmin, (req, res) => {
  const key = req.body && req.body.key;
  if (!key || typeof key !== "string" || !key.trim()) return res.status(400).json({ error: "key required" });
  setSetting("fantasypros-api-key", key.trim());
  res.json({ set: true });
});

app.delete("/api/settings/fantasypros-key", requireAdmin, (req, res) => {
  deleteSetting("fantasypros-api-key");
  res.json({ set: false });
});

app.get("/api/settings/espn-cookies/status", requireAdmin, (req, res) => {
  let set = false;
  try {
    const raw = hasSetting("espn-cookies") ? JSON.parse(getSetting("espn-cookies")) : null;
    set = !!(raw && raw.espn_s2 && raw.swid);
  } catch (e) { /* treat unparsable as not set */ }
  res.json({ set });
});

app.put("/api/settings/espn-cookies", requireAdmin, (req, res) => {
  const { espn_s2, swid } = req.body || {};
  if (!espn_s2 || !swid) return res.status(400).json({ error: "espn_s2 and swid required" });
  setSetting("espn-cookies", JSON.stringify({ espn_s2: espn_s2.trim(), swid: swid.trim() }));
  res.json({ set: true });
});

app.delete("/api/settings/espn-cookies", requireAdmin, (req, res) => {
  deleteSetting("espn-cookies");
  res.json({ set: false });
});

// --- GM Tab API — in-season state for the fantasy-gm agent system
// (/home/gihn/fantasy-gm), Koi-only for v1. requireAdmin, not
// requirePermission("draft") — this is a Will-only surface by design
// (see src/pages/Landing.jsx's tile check), same reasoning as the
// FantasyPros-key/ESPN-cookie settings routes above: sensitive-adjacent,
// single-owner. Both the GM Tab's own React page and fantasy-gm's agents
// (via scripts/gm_api_client.py) call these same routes. ---
const gmRouter = express.Router();

gmRouter.get("/keeper-notes", (req, res) => {
  const league = req.query.league || "koi";
  const season = Number(req.query.season) || new Date().getFullYear();
  res.json(listKeeperNotes(league, season));
});

gmRouter.put("/keeper-notes/:playerId", (req, res) => {
  const league = req.body.league || "koi";
  const season = Number(req.body.season) || new Date().getFullYear();
  const { leaning, rationale, yearsKept, originalDraftPrice } = req.body || {};
  const row = upsertKeeperNote(league, Number(req.params.playerId), season, { leaning, rationale, yearsKept, originalDraftPrice });
  res.json(row);
});

gmRouter.delete("/keeper-notes/:playerId", (req, res) => {
  const league = req.query.league || "koi";
  const season = Number(req.query.season) || new Date().getFullYear();
  deleteKeeperNote(league, Number(req.params.playerId), season);
  res.json({ deleted: true });
});

gmRouter.get("/waiver-wire", (req, res) => {
  res.json(listWaiverWire(req.query.league || "koi"));
});

gmRouter.put("/waiver-wire", (req, res) => {
  const league = req.body.league || "koi";
  const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
  res.json(replaceWaiverWire(league, entries));
});

gmRouter.get("/trade-proposals", (req, res) => {
  res.json(listTradeProposals(req.query.league || "koi"));
});

gmRouter.post("/trade-proposals", (req, res) => {
  const league = req.body.league || "koi";
  const { giveIds, getIds, counterparty, analysis } = req.body || {};
  res.json(createTradeProposal(league, { giveIds, getIds, counterparty, analysis }));
});

gmRouter.put("/trade-proposals/:id", (req, res) => {
  const { status, analysis, historyEntry } = req.body || {};
  const row = updateTradeProposal(Number(req.params.id), { status, analysis, historyEntry });
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
});

gmRouter.get("/transactions", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  res.json(listTransactions(req.query.league || "koi", limit));
});

gmRouter.post("/transactions", (req, res) => {
  const league = req.body.league || "koi";
  const { eventType, playerId, detail, status, relatedId } = req.body || {};
  if (!eventType) return res.status(400).json({ error: "eventType required" });
  res.json(appendTransaction(league, { eventType, playerId, detail, status, relatedId }));
});

// Live ESPN roster lookup — not persisted (a point-in-time read, unlike
// waiver-wire below which snapshots into gm_waiver_wire). Matches each
// entry to fp_pool by normalized name+position so the response lines up
// with the same player ids keeper-notes/trade-proposals use — no
// fantasypros_id crosswalk exists anywhere else to lean on (see
// fpMigration.js's buildFpIndex() for the same pattern this borrows).
gmRouter.get("/roster", async (req, res) => {
  const league = getLeague(req.query.league || "koi");
  if (!league) return res.status(404).json({ error: "unknown league" });
  try {
    const { status, roster } = await getRoster(league.source_league_id, league.source_team_id, Number(req.query.year) || undefined);
    if (status !== 200) return res.status(status).json({ error: `ESPN returned HTTP ${status}` });
    const fpByNamePos = new Map();
    for (const p of getFpPool()) fpByNamePos.set(normName(p.name) + "|" + p.position, p.id);
    const matched = roster.map(r => ({
      ...r,
      fpPoolId: r.position ? (fpByNamePos.get(normName(r.name) + "|" + r.position) ?? null) : null,
    }));
    res.json(matched);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Refreshes gm_waiver_wire from ESPN's live free-agent list — same
// refresh-then-persist pattern as /api/fp-pool/refresh and
// /api/history/:league/refresh elsewhere in this file.
gmRouter.post("/waiver-wire/refresh", async (req, res) => {
  const leagueId = req.body.league || "koi";
  const league = getLeague(leagueId);
  if (!league) return res.status(404).json({ error: "unknown league" });
  try {
    const { status, players } = await getFreeAgents(league.source_league_id, Number(req.body.year) || undefined, Number(req.body.limit) || 50);
    if (status !== 200) return res.status(status).json({ error: `ESPN returned HTTP ${status}` });
    const fpByNamePos = new Map();
    for (const p of getFpPool()) fpByNamePos.set(normName(p.name) + "|" + p.position, p.id);
    const entries = players.map(p => ({
      playerId: p.position ? (fpByNamePos.get(normName(p.name) + "|" + p.position) ?? null) : null,
      espnPlayerId: p.espnPlayerId,
      name: p.name,
      position: p.position,
      team: null,
      note: p.percentOwned != null ? `${p.percentOwned.toFixed(1)}% owned` : null,
    }));
    res.json(replaceWaiverWire(leagueId, entries));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Chat — the browser-side conversational assistant (GM Tab and Draft
// Prep both call this same route/logic). Stateless server-side: the
// client sends the full running message history each turn (standard
// Anthropic Messages API pattern), same as any other multi-turn chat.
gmRouter.post("/chat", async (req, res) => {
  const history = Array.isArray(req.body.messages) ? req.body.messages : null;
  if (!history || !history.length) return res.status(400).json({ error: "messages array required" });
  try {
    const { reply, history: fullHistory } = await runChat(history);
    res.json({ reply, messages: fullHistory });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Historical positional draft-cost trends — pulls real completed
// seasons from ESPN and persists them (real work, not repeated per
// query, same pattern as fp_pool/waiver-wire refresh).
gmRouter.post("/draft-history/refresh", async (req, res) => {
  const leagueId = req.body.league || "koi";
  const league = getLeague(leagueId);
  if (!league) return res.status(404).json({ error: "unknown league" });
  const years = Array.isArray(req.body.years) && req.body.years.length
    ? req.body.years
    : [2022, 2023, 2024, 2025];
  try {
    const results = {};
    for (const year of years) {
      const { drafted, picks } = await getSeasonDraftWithPositions(league.source_league_id, year);
      if (drafted) replaceSeasonDraftHistory(leagueId, year, picks);
      results[year] = { drafted, picksStored: drafted ? picks.filter(p => p.name).length : 0 };
    }
    res.json({ seasons: getDraftHistorySeasons(leagueId), results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

gmRouter.get("/draft-history/trends", (req, res) => {
  const leagueId = req.query.league || "koi";
  const position = req.query.position;
  if (!position) return res.status(400).json({ error: "position required" });
  res.json(getPositionalTrends(leagueId, position, Number(req.query.maxRank) || 10));
});

gmRouter.get("/draft-history/seasons", (req, res) => {
  res.json({ seasons: getDraftHistorySeasons(req.query.league || "koi") });
});

app.use("/api/gm", requireAdmin, gmRouter);

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

// --- Live player pool — canonical id/pool is FantasyPros (server/
// fantasypros.js) as of Phase 4 of the pool-source switch (was Fantasy
// Football Calculator). FFC's own pool (server/adp.js) stays alive purely
// as the ADP-number source, matched in by name+position (attachAdp) —
// ADP itself didn't move, only the canonical pool/id did. Draft-prep-only
// data, gated the same way as the rest of the board. ---
app.get("/api/players", requirePermission("draft"), (req, res) => res.json(attachAdp(getFpPool(), getAdpPool())));
app.get("/api/players/status", requirePermission("draft"), (req, res) => res.json(getAdpStatus()));
app.post("/api/players/refresh", requirePermission("draft"), async (req, res) => {
  try {
    const count = await refreshAdpPool();
    res.json({ ok: true, count });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// --- FantasyPros pool — Phase 1 of the pool-source switch (see the plan).
// Purely additive right now: fp_pool is a staging table, /api/players still
// serves adp_pool untouched. Refresh is admin-only (unlike the FFC refresh
// above) since it spends real paid API budget, not just re-pulls a free feed. ---
app.get("/api/fp-pool/status", requireAdmin, (req, res) => res.json(getFpStatus()));
app.post("/api/fp-pool/refresh", requireAdmin, async (req, res) => {
  try {
    const count = await refreshFpPool();
    res.json({ ok: true, count });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});
// Phase 2 staging route — the FantasyPros pool with FFC's ADP matched in,
// for verifying the match before /api/players actually cuts over to it.
app.get("/api/fp-pool", requireAdmin, (req, res) => res.json(attachAdp(getFpPool(), getAdpPool())));

// Phase 3 — the crosswalk. Preview NEVER mutates anything, it's purely a
// report for review. Apply only runs against an explicitly-approved
// mapping (built from that report, e.g. Object.fromEntries(matched.map(m
// => [m.oldId, m.newId])), reviewed with Will before this is ever called).
app.get("/api/fp-pool/migration-preview", requireAdmin, (req, res) => {
  try {
    res.json(previewMigration());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post("/api/fp-pool/migration-apply", requireAdmin, (req, res) => {
  try {
    const mapping = (req.body && req.body.mapping) || {};
    res.json(applyMigration(mapping));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true, dataFile: DATA_FILE }));

// --- League config (teams/roster spots/replacement levels, per league) —
// any logged-in user, since Game Day (restricted-accessible) needs it. ---
app.get("/api/leagues", requireAuth, (req, res) => res.json(getAllLeagues()));

// --- League History (Koi/Jordan on ESPN, Final Fantasy/Sin Bin Dynasty on
// Sleeper — see server/espn.js and server/sleeperHistory.js). Gated on
// both the 'history' area AND the specific league (requireHistoryLeague) —
// a real data boundary, not just nav-hiding, so a friend granted one
// league's history can't pull a different league's data by changing the
// URL. Only admin can trigger a refresh regardless of permissions (that's
// a write against an external API, not just a view). ---
app.get("/api/history/:league", requireHistoryLeague, (req, res) => {
  res.json(getLeagueHistory(req.params.league));
});

app.post("/api/history/:league/refresh", requireAdmin, async (req, res) => {
  const league = getLeague(req.params.league);
  if (!league || !league.source_league_id) {
    return res.status(400).json({ error: `${req.params.league} has no league id on file yet` });
  }
  try {
    let result;
    if (league.source_platform === "espn") {
      const currentYear = new Date().getFullYear();
      // 2011 is Koi's real floor, not a guess — verified directly: 2010 and
      // earlier 404 even with valid cookies (the league didn't exist yet).
      // Starting there instead of scanning further back saves a dozen-plus
      // guaranteed-empty HTTP round-trips on every refresh. Still overridable
      // via the request body for whenever a second ESPN league (Jordan) with a
      // different history is wired up here.
      const startYear = Number(req.body?.startYear) || 2011;
      const endYear = Number(req.body?.endYear) || currentYear;
      result = await refreshLeagueHistory(req.params.league, league.source_league_id, startYear, endYear);
    } else if (league.source_platform === "sleeper") {
      // No year range needed — Sleeper's previous_league_id chain is self-
      // terminating (verified live: both Final Fantasy and Sin Bin Dynasty
      // cleanly stop at their real first season, not a failed fetch).
      result = await refreshSleeperHistory(req.params.league, league.source_league_id);
    } else {
      return res.status(400).json({ error: `unsupported source platform: ${league.source_platform}` });
    }
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// --- League History "Home" page (League Social — featured video + a
// shared chat board). Viewing is open to anyone with that league's History
// (same requireHistoryLeague as the rest of League History) — editing the
// video link and moderating chat need Homepage Admin, posting needs
// Homepage Admin or Social Media Poster. See server/auth.js's file header. ---
app.get("/api/history/:league/home", requireHistoryLeague, (req, res) => {
  res.json({ settings: getHomeSettings(req.params.league), chat: listChatMessages(req.params.league) });
});

app.put("/api/history/:league/home/settings", requireHomeAdmin, (req, res) => {
  try {
    res.json(setHomeSettings(req.params.league, req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/history/:league/home/chat", requireHomePoster, (req, res) => {
  try {
    res.json(addChatMessage(req.params.league, req.authUser.username, req.body && req.body.message));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/history/:league/home/chat/:id", requireHomeAdmin, (req, res) => {
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
  // Year override is admin-only — lets a past, fully-settled week (e.g. last
  // season's week 17) be pulled through the real pipeline to test it, since
  // a genuinely live week only exists while games are actually being played.
  const year = (req.query.year && req.authUser.role === "admin") ? Number(req.query.year) : null;
  try {
    const result = await getWeekMatchups(league.source_league_id, week, year);
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
