// Real session-based authentication — replaces "anyone who can reach the
// server has full access," which stopped being acceptable the moment this
// app was exposed to the internet for friends to use.
//
// role:
//   - 'admin'      full access to every page and API, PLUS account
//                  management (creating/editing/removing other accounts).
//                  That last part is deliberately never grantable as a
//                  plain permission below — "can see the draft board" and
//                  "can create other logins" are different trust levels
//                  and shouldn't get conflated just because it'd be
//                  convenient to have one fewer checkbox.
//   - 'restricted' sees only whichever AREAS (below) they've been granted.
//
// AREAS — independently grantable, not a fixed bundle (Will asked for
// this explicitly after the first pass only offered "everything" or
// "Game Day + League History" as one lump):
//   - 'draft'     the draft prep board
//   - 'gameday'   live scores
//   - 'history'   League History
// An admin implicitly has all three; `permissions` is only consulted for
// a 'restricted' account.
//
// Passwords are hashed with Node's built-in scrypt (no new dependency) —
// per-user random salt, timing-safe comparison. Sessions are opaque random
// tokens in a DB table (not a stateless JWT), so revoking one is just a
// DELETE — no separate blocklist to maintain.
import crypto from "crypto";
import { db } from "./db.js";

export const AREAS = ["draft", "gameday", "history"];

db.exec(`
CREATE TABLE IF NOT EXISTS auth_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,   -- stored lowercase; login is case-insensitive
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'restricted',  -- 'admin' | 'restricted'
  permissions   TEXT,                   -- comma-separated subset of AREAS; only
                                          -- meaningful for role='restricted'
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Migration: CREATE TABLE IF NOT EXISTS above doesn't add columns to an
// auth_users table that already existed before per-area permissions were
// introduced — add it here if missing, safe to run on every boot.
const authUsersCols = db.prepare("PRAGMA table_info(auth_users)").all().map((c) => c.name);
if (!authUsersCols.includes("permissions")) {
  db.exec("ALTER TABLE auth_users ADD COLUMN permissions TEXT");
}

const SESSION_DAYS = 30;
const SCRYPT_KEYLEN = 64;

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
}

function normalizeUsername(u) {
  return String(u || "").trim().toLowerCase();
}

function parsePermissions(raw) {
  if (!raw) return [];
  return raw.split(",").map((a) => a.trim()).filter((a) => AREAS.includes(a));
}
function serializePermissions(areas) {
  if (!Array.isArray(areas) || !areas.length) return null;
  const clean = [...new Set(areas.filter((a) => AREAS.includes(a)))];
  return clean.length ? clean.join(",") : null;
}

function toUserShape(row) {
  return { id: row.id, username: row.username, role: row.role, permissions: parsePermissions(row.permissions) };
}

export function createAuthUser(username, password, role = "restricted", permissions = []) {
  username = normalizeUsername(username);
  if (!username) throw new Error("username required");
  if (!password || password.length < 4) throw new Error("password must be at least 4 characters");
  if (role !== "admin" && role !== "restricted") throw new Error("role must be 'admin' or 'restricted'");
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  const perms = serializePermissions(permissions);
  const info = db.prepare("INSERT INTO auth_users (username, password_hash, password_salt, role, permissions) VALUES (?, ?, ?, ?, ?)")
    .run(username, hash, salt, role, perms);
  return toUserShape({ id: info.lastInsertRowid, username, role, permissions: perms });
}

export function listAuthUsers() {
  return db.prepare("SELECT id, username, role, permissions, created_at FROM auth_users ORDER BY id")
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
  if (role !== "admin" && role !== "restricted") throw new Error("role must be 'admin' or 'restricted'");
  const result = db.prepare("UPDATE auth_users SET role = ? WHERE id = ?").run(role, id);
  if (result.changes === 0) throw new Error("user not found");
}

/** areas: array of AREAS keys this restricted account can see. Ignored in
 *  practice for an admin account (they already see everything), but still
 *  stored as given — no special-casing needed if their role ever changes
 *  back to restricted later. */
export function setAuthUserPermissions(id, areas) {
  const perms = serializePermissions(areas);
  const result = db.prepare("UPDATE auth_users SET permissions = ? WHERE id = ?").run(perms, id);
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
    SELECT u.id, u.username, u.role, u.permissions, s.expires_at
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

/** Gate on one AREA — admin always passes, a restricted account needs it
 *  in their granted permissions. Use this instead of requireAdmin for
 *  anything that a non-admin CAN be granted (draft board / Game Day /
 *  League History), and requireAdmin only for things that must always stay
 *  admin-only regardless of permissions (account management). */
export function requirePermission(area) {
  return (req, res, next) => {
    if (!req.authUser) return res.status(401).json({ error: "login required" });
    if (req.authUser.role === "admin" || req.authUser.permissions.includes(area)) return next();
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
