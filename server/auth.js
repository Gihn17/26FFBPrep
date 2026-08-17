// Real session-based authentication — replaces "anyone who can reach the
// server has full access," which stopped being acceptable the moment this
// app was exposed to the internet for friends to use.
//
// role — three tiers, not two (Will's call, after the first pass only had
// admin vs. a permission-gated "restricted"):
//   - 'admin'     full access to every page and API, PLUS account
//                 management (creating/editing/removing other accounts).
//                 That last part is deliberately never grantable to
//                 either of the roles below — "can see the draft board"
//                 and "can create other logins" are different trust
//                 levels and shouldn't get conflated just to save a
//                 checkbox.
//   - 'standard'  full access to every AREA and every sub-tab below, same
//                 as admin content-wise, but NOT account management. The
//                 default for "just a trusted person," no checkboxes to
//                 configure.
//   - 'limited'   (was called 'restricted') sees only whichever AREAS —
//                 and, within those, whichever sub-tabs — they've been
//                 explicitly granted. permissions/draft_tabs/history_tabs
//                 are only ever consulted for this role; admin and
//                 standard both bypass them entirely.
//
// AREAS — independently grantable, not a fixed bundle (Will asked for
// this explicitly after the first pass only offered "everything" or
// "Game Day + League History" as one lump):
//   - 'draft'     the draft prep board
//   - 'gameday'   live scores
//   - 'history'   League History
//
// Two AREAS have their own finer layer, same shape, same reasoning (Will
// asked for this explicitly too — a 'limited' account granted an area
// shouldn't automatically get every sub-page inside it):
//   - DRAFT_TABS (db.js's VALID_TABS): which of the draft board's own
//     tabs (Koi/Final Fantasy/Jordan/Calculations) a 'limited' account
//     with 'draft' sees. Replaces the old free-text "Viewing as" profile
//     picker and its per-profile allowed_tabs (db.js's `users` table),
//     which had no real login behind it at all.
//   - HISTORY_TABS (db.js's own export): which of League History's
//     sub-pages (Seasons/Stats/H2H/Champs/Teams) a 'limited' account with
//     'history' sees. "Home" is deliberately NOT part of this list — it's
//     gated to the true admin role only, unfinished, not a grantable
//     permission (see requireAdmin on its routes in index.js).
//
// Passwords are hashed with Node's built-in scrypt (no new dependency) —
// per-user random salt, timing-safe comparison. Sessions are opaque random
// tokens in a DB table (not a stateless JWT), so revoking one is just a
// DELETE — no separate blocklist to maintain.
import crypto from "crypto";
import { db, VALID_TABS as DRAFT_TABS, HISTORY_TABS } from "./db.js";

export const ROLES = ["admin", "standard", "limited"];
export const AREAS = ["draft", "gameday", "history"];
const FULL_ACCESS_ROLES = ["admin", "standard"];

db.exec(`
CREATE TABLE IF NOT EXISTS auth_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,   -- stored lowercase; login is case-insensitive
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'limited',  -- 'admin' | 'standard' | 'limited'
  permissions   TEXT,                   -- comma-separated subset of AREAS; only
                                          -- meaningful for role='limited'
  draft_tabs    TEXT,                   -- comma-separated subset of DRAFT_TABS;
                                          -- only meaningful when 'draft' is granted
  history_tabs  TEXT,                   -- comma-separated subset of HISTORY_TABS;
                                          -- only meaningful when 'history' is granted
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every login attempt, success or failure — light audit trail so "who's
-- actually using the guest account" has a real answer instead of a shrug.
-- user_id is set whenever the attempted username matches a real account
-- (even if the password was wrong — that's still an attempt against that
-- account, worth showing on its row), and left null for a username that
-- doesn't exist at all. Never surfaced back through the login response
-- itself — admin-only, via a separate route — so this doesn't turn into a
-- user-enumeration leak on the login endpoint.
CREATE TABLE IF NOT EXISTS login_log (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER REFERENCES auth_users(id) ON DELETE SET NULL,
  username_attempted  TEXT NOT NULL,
  success             INTEGER NOT NULL,
  ip                  TEXT,
  user_agent          TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Migration: CREATE TABLE IF NOT EXISTS above doesn't add columns to an
// auth_users table that already existed before per-area permissions were
// introduced — add it here if missing, safe to run on every boot.
const authUsersCols = db.prepare("PRAGMA table_info(auth_users)").all().map((c) => c.name);
if (!authUsersCols.includes("permissions")) {
  db.exec("ALTER TABLE auth_users ADD COLUMN permissions TEXT");
}
if (!authUsersCols.includes("draft_tabs")) {
  db.exec("ALTER TABLE auth_users ADD COLUMN draft_tabs TEXT");
}
if (!authUsersCols.includes("history_tabs")) {
  db.exec("ALTER TABLE auth_users ADD COLUMN history_tabs TEXT");
}
// Migration: the role that's now 'limited' used to be called 'restricted'
// — rename the stored value for every existing account, not just new
// ones. Safe to run every boot (no-op once there's nothing left to rename).
db.prepare("UPDATE auth_users SET role = 'limited' WHERE role = 'restricted'").run();

const SESSION_DAYS = 30;
const SCRYPT_KEYLEN = 64;

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
}

function normalizeUsername(u) {
  return String(u || "").trim().toLowerCase();
}

function parseList(raw, validValues) {
  if (!raw) return [];
  return raw.split(",").map((a) => a.trim()).filter((a) => validValues.includes(a));
}
function serializeList(values, validValues) {
  if (!Array.isArray(values) || !values.length) return null;
  const clean = [...new Set(values.filter((a) => validValues.includes(a)))];
  return clean.length ? clean.join(",") : null;
}
const parsePermissions = (raw) => parseList(raw, AREAS);
const serializePermissions = (areas) => serializeList(areas, AREAS);
const parseDraftTabs = (raw) => parseList(raw, DRAFT_TABS);
const serializeDraftTabs = (tabs) => serializeList(tabs, DRAFT_TABS);
const parseHistoryTabs = (raw) => parseList(raw, HISTORY_TABS);
const serializeHistoryTabs = (tabs) => serializeList(tabs, HISTORY_TABS);

function toUserShape(row) {
  return {
    id: row.id, username: row.username, role: row.role,
    permissions: parsePermissions(row.permissions),
    draftTabs: parseDraftTabs(row.draft_tabs),
    historyTabs: parseHistoryTabs(row.history_tabs),
  };
}

export function createAuthUser(username, password, role = "limited", permissions = [], draftTabs = [], historyTabs = []) {
  username = normalizeUsername(username);
  if (!username) throw new Error("username required");
  if (!password || password.length < 4) throw new Error("password must be at least 4 characters");
  if (!ROLES.includes(role)) throw new Error(`role must be one of: ${ROLES.join(", ")}`);
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  const perms = serializePermissions(permissions);
  const draftT = serializeDraftTabs(draftTabs);
  const historyT = serializeHistoryTabs(historyTabs);
  const info = db.prepare("INSERT INTO auth_users (username, password_hash, password_salt, role, permissions, draft_tabs, history_tabs) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(username, hash, salt, role, perms, draftT, historyT);
  return toUserShape({ id: info.lastInsertRowid, username, role, permissions: perms, draft_tabs: draftT, history_tabs: historyT });
}

export function listAuthUsers() {
  return db.prepare("SELECT id, username, role, permissions, draft_tabs, history_tabs, created_at FROM auth_users ORDER BY id")
    .all().map((row) => ({ ...toUserShape(row), created_at: row.created_at }));
}

export function setAuthUserPassword(id, password) {
  if (!password || password.length < 4) throw new Error("password must be at least 4 characters");
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  const result = db.prepare("UPDATE auth_users SET password_hash = ?, password_salt = ? WHERE id = ?").run(hash, salt, id);
  if (result.changes === 0) throw new Error("user not found");
}

export function setAuthUserRole(id, role) {
  if (!ROLES.includes(role)) throw new Error(`role must be one of: ${ROLES.join(", ")}`);
  const result = db.prepare("UPDATE auth_users SET role = ? WHERE id = ?").run(role, id);
  if (result.changes === 0) throw new Error("user not found");
}

/** areas: array of AREAS keys this 'limited' account can see. Ignored in
 *  practice for admin/standard (they already see everything), but still
 *  stored as given — no special-casing needed if their role ever changes
 *  back to 'limited' later. */
export function setAuthUserPermissions(id, areas) {
  const perms = serializePermissions(areas);
  const result = db.prepare("UPDATE auth_users SET permissions = ? WHERE id = ?").run(perms, id);
  if (result.changes === 0) throw new Error("user not found");
}

/** Which of the draft board's own tabs (Koi/Final Fantasy/Jordan/
 *  Calculations) a 'limited' account with 'draft' access can see. Only
 *  meaningful for that combination; harmless to set on anyone else. */
export function setAuthUserDraftTabs(id, tabs) {
  const value = serializeDraftTabs(tabs);
  const result = db.prepare("UPDATE auth_users SET draft_tabs = ? WHERE id = ?").run(value, id);
  if (result.changes === 0) throw new Error("user not found");
}

/** Which of League History's sub-pages (Seasons/Stats/H2H/Champs/Teams —
 *  never "home", see the file header) a 'limited' account with 'history'
 *  access can see. */
export function setAuthUserHistoryTabs(id, tabs) {
  const value = serializeHistoryTabs(tabs);
  const result = db.prepare("UPDATE auth_users SET history_tabs = ? WHERE id = ?").run(value, id);
  if (result.changes === 0) throw new Error("user not found");
}

export function deleteAuthUser(id) {
  const result = db.prepare("DELETE FROM auth_users WHERE id = ?").run(id);
  if (result.changes === 0) throw new Error("user not found");
  db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(id); // no orphaned sessions
}

/** Verifies username+password. Timing-safe compare on the hash (not just
 *  `===`) so this doesn't leak how many leading bytes matched. Wrong
 *  username and wrong password both just return null — never distinguish
 *  the two in a response, that's a user-enumeration leak. */
export function verifyLogin(username, password) {
  username = normalizeUsername(username);
  const user = db.prepare("SELECT * FROM auth_users WHERE username = ?").get(username);
  if (!user) return null;
  const candidate = hashPassword(password || "", user.password_salt);
  const a = Buffer.from(candidate, "hex"), b = Buffer.from(user.password_hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return toUserShape(user);
}

const LOGIN_LOG_CAP = 2000; // light, not unbounded — trimmed on every insert

/** Records one login attempt (success or failure). Resolves user_id by
 *  username alone, independent of whether the password was right — a
 *  wrong-password attempt against a real account still belongs on that
 *  account's history, not just on the "unknown username" pile. */
export function recordLogin({ usernameAttempted, success, ip, userAgent }) {
  const username = normalizeUsername(usernameAttempted);
  const user = db.prepare("SELECT id FROM auth_users WHERE username = ?").get(username);
  db.prepare("INSERT INTO login_log (user_id, username_attempted, success, ip, user_agent) VALUES (?, ?, ?, ?, ?)")
    .run(user ? user.id : null, username, success ? 1 : 0, ip || null, userAgent || null);
  db.prepare(`DELETE FROM login_log WHERE id NOT IN (SELECT id FROM login_log ORDER BY id DESC LIMIT ${LOGIN_LOG_CAP})`).run();
}

/** Recent login attempts for one account (both successful and failed —
 *  a string of failures is exactly the kind of thing worth seeing). */
export function listLoginLog(userId, limit = 25) {
  return db.prepare("SELECT success, ip, user_agent, created_at FROM login_log WHERE user_id = ? ORDER BY id DESC LIMIT ?")
    .all(userId, limit);
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO auth_sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, userId, expiresAt);
  return { token, expiresAt };
}

export function deleteSession(token) {
  if (token) db.prepare("DELETE FROM auth_sessions WHERE token = ?").run(token);
}

export function getUserBySession(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.username, u.role, u.permissions, u.draft_tabs, u.history_tabs, s.expires_at
    FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    db.prepare("DELETE FROM auth_sessions WHERE token = ?").run(token);
    return null;
  }
  return toUserShape(row);
}

// --- Cookie handling (manual — avoids adding a dependency for a handful
// of lines). Path scoped to wherever the app is actually mounted, so the
// cookie doesn't leak to unrelated paths sharing the same host. ---
const COOKIE_NAME = "ffb_session";
const COOKIE_PATH = process.env.APP_BASE_PATH || "/";

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function setSessionCookie(req, res, token) {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  res.setHeader("Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=${COOKIE_PATH}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`);
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=${COOKIE_PATH}; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function getSessionTokenFromReq(req) {
  return parseCookies(req.headers.cookie)[COOKIE_NAME];
}

/** Attaches req.authUser if there's a valid session; never blocks the
 *  request by itself — requireAuth/requireAdmin/requirePermission below do
 *  that. Mounted globally so req.authUser is available everywhere,
 *  including routes that stay public. */
export function attachUser(req, res, next) {
  req.authUser = getUserBySession(getSessionTokenFromReq(req));
  next();
}

export function requireAuth(req, res, next) {
  if (!req.authUser) return res.status(401).json({ error: "login required" });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.authUser) return res.status(401).json({ error: "login required" });
  if (req.authUser.role !== "admin") return res.status(403).json({ error: "admin access required" });
  next();
}

/** Gate on one AREA — admin/standard always pass (full content access is
 *  the whole point of 'standard'), a 'limited' account needs it in their
 *  granted permissions. Use this instead of requireAdmin for anything a
 *  non-admin CAN be granted (draft board / Game Day / League History),
 *  and requireAdmin only for things that must always stay admin-only
 *  regardless of permissions (account management, the WIP Home page). */
export function requirePermission(area) {
  return (req, res, next) => {
    if (!req.authUser) return res.status(401).json({ error: "login required" });
    if (FULL_ACCESS_ROLES.includes(req.authUser.role) || req.authUser.permissions.includes(area)) return next();
    res.status(403).json({ error: `access to '${area}' not granted` });
  };
}

/** Creates the first admin account on a fresh install, with a random
 *  password printed to the server log (visible via `docker compose logs`)
 *  — never a hardcoded/committed credential. Only fires when auth_users is
 *  completely empty, so it's a true one-time bootstrap, not a reset. */
export function bootstrapAdmin() {
  const count = db.prepare("SELECT COUNT(*) AS n FROM auth_users").get().n;
  if (count > 0) return;
  const password = crypto.randomBytes(9).toString("base64url"); // 12 random chars
  createAuthUser("will", password, "admin");
  console.log("============================================================");
  console.log("First-run: created admin account 'will'");
  console.log(`Password: ${password}`);
  console.log("Log in and change this from the Admin panel — this only prints once.");
  console.log("============================================================");
}
