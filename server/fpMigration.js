// One-time migration: the app's canonical player id is moving from Fantasy
// Football Calculator (server/adp.js) to FantasyPros (server/fantasypros.js).
// Every currently-stored draft pick, UDK import, and personal note is keyed
// by the OLD (FFC) id — see src/App.jsx's draftByLeague/playerImports/
// notesOverride. This module never rewrites anything by itself:
// previewMigration() only produces a report; applyMigration() only runs
// once that report's been reviewed (see server/index.js's routes).
import { db, getOrCreateUser } from "./db.js";
import { getFpPool, normName, normTeam } from "./fantasypros.js";

const BOARD_LEAGUES = ["koi", "final", "jordan"];
const DRAFT_STATE_KEY = "ffb-draft-state";
const NOTES_KEY = "ffb-notes-overrides";
const BACKUP_KEY = "ffb-draft-state-pre-fp-migration";

function getDraftStateRow() {
  const will = getOrCreateUser("Will"); // /api/storage always resolves here, see server/index.js's storage router
  return db.prepare("SELECT value FROM user_kv WHERE user_id = ? AND key = ?").get(will.id, DRAFT_STATE_KEY);
}

/** Every user_kv row holding personal notes, across every user — not just
 *  Will's. Each is its own independent blob (server/index.js's notesRouter
 *  resolves per req.authUser.username), so a full migration has to touch
 *  all of them, not just the shared draft-state blob. */
function getAllNotesRows() {
  return db.prepare(`
    SELECT u.id as userId, u.name as username, kv.value FROM user_kv kv
    JOIN users u ON u.id = kv.user_id WHERE kv.key = ?
  `).all(NOTES_KEY);
}

/** Every old (FFC) id referenced anywhere in stored state, with which
 *  record(s) reference it, for the review report. Returns a Map:
 *  oldId -> { draftByLeague: [league,...], playerImports: bool, notes: [username,...] }. */
function collectReferencedIds() {
  const refs = new Map();
  const touch = (id) => {
    const key = Number(id);
    if (!refs.has(key)) refs.set(key, { draftByLeague: [], playerImports: false, notes: [] });
    return refs.get(key);
  };

  const stateRow = getDraftStateRow();
  const state = stateRow ? JSON.parse(stateRow.value) : {};
  for (const league of BOARD_LEAGUES) {
    for (const id of Object.keys(state.draftByLeague?.[league] || {})) touch(id).draftByLeague.push(league);
  }
  for (const id of Object.keys(state.playerImports || {})) touch(id).playerImports = true;

  for (const { username, value } of getAllNotesRows()) {
    let notes = {};
    try { notes = JSON.parse(value) || {}; } catch (e) { /* corrupt row, skip */ }
    for (const id of Object.keys(notes)) touch(id).notes.push(username);
  }

  return refs;
}

function buildFpIndex() {
  const byNamePos = new Map(); // key -> array of fp rows (so collisions are detectable, not silently overwritten)
  const defByTeam = new Map();
  for (const p of getFpPool()) {
    if (p.position === "DEF") { defByTeam.set(normTeam(p.team), p); continue; }
    const key = normName(p.name) + "|" + p.position;
    if (!byNamePos.has(key)) byNamePos.set(key, []);
    byNamePos.get(key).push(p);
  }
  return { byNamePos, defByTeam };
}

/** Produces {matched, ambiguous, unresolvable, totalReferenced} — a report,
 *  never a mutation. `matched` entries carry oldId/newId/name/position/
 *  usage; `ambiguous` when more than one FantasyPros player shares the
 *  same normalized name+position (a real, if rare, possibility — the same
 *  risk the CSV importer's nameIndex already has, worth catching here
 *  rather than silently picking one); `unresolvable` when the old id isn't
 *  even in the CURRENT FFC pool anymore (adp_pool prunes to whatever FFC's
 *  latest fetch returns — a name/position can't be looked up for an id
 *  that's already fallen off it) or has no FantasyPros counterpart at all. */
export function previewMigration() {
  const refs = collectReferencedIds();
  const { byNamePos, defByTeam } = buildFpIndex();

  const matched = [], ambiguous = [], unresolvable = [];
  for (const [oldId, usage] of refs) {
    const ffcRow = db.prepare("SELECT name, position, team FROM adp_pool WHERE id = ?").get(oldId);
    if (!ffcRow) {
      unresolvable.push({ oldId, name: null, reason: "not in the current FFC pool anymore — can't look up who this was", usage });
      continue;
    }
    if (ffcRow.position === "DEF") {
      const fp = defByTeam.get(normTeam(ffcRow.team));
      if (!fp) unresolvable.push({ oldId, name: ffcRow.name, position: "DEF", reason: "no FantasyPros defense for this team code", usage });
      else matched.push({ oldId, newId: fp.id, name: ffcRow.name, position: "DEF", usage });
      continue;
    }
    const candidates = byNamePos.get(normName(ffcRow.name) + "|" + ffcRow.position) || [];
    if (candidates.length === 0) {
      unresolvable.push({ oldId, name: ffcRow.name, position: ffcRow.position, reason: "no FantasyPros match by name+position", usage });
    } else if (candidates.length > 1) {
      ambiguous.push({ oldId, name: ffcRow.name, position: ffcRow.position, candidates: candidates.map(c => ({ id: c.id, name: c.name, team: c.team })), usage });
    } else {
      matched.push({ oldId, newId: candidates[0].id, name: ffcRow.name, position: ffcRow.position, usage });
    }
  }
  return { matched, ambiguous, unresolvable, totalReferenced: refs.size };
}

/** Rewrites every reference using an approved mapping ({oldId: newId}).
 *  Backs up the pre-migration draft-state blob under BACKUP_KEY first
 *  (trivially reversible: re-save that value back under DRAFT_STATE_KEY).
 *  Anything not present in `mapping` (an id the admin chose to drop, e.g.
 *  a genuinely-retired player) is simply dropped from the rewritten
 *  blob — never left half-translated. */
export function applyMigration(mapping) {
  const will = getOrCreateUser("Will");
  const stateRow = getDraftStateRow();
  if (!stateRow) throw new Error("no ffb-draft-state found — nothing to migrate");
  const state = JSON.parse(stateRow.value);

  db.prepare(`
    INSERT INTO user_kv (user_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(will.id, BACKUP_KEY, stateRow.value);

  const remap = (obj) => {
    const out = {};
    for (const [oldId, val] of Object.entries(obj || {})) {
      const newId = mapping[oldId];
      if (newId != null) out[newId] = val;
    }
    return out;
  };

  const before = { drafted: 0, imports: 0 };
  const after = { drafted: 0, imports: 0 };
  for (const league of BOARD_LEAGUES) {
    const orig = state.draftByLeague?.[league] || {};
    before.drafted += Object.keys(orig).length;
    const remapped = remap(orig);
    after.drafted += Object.keys(remapped).length;
    state.draftByLeague = state.draftByLeague || {};
    state.draftByLeague[league] = remapped;
  }
  before.imports = Object.keys(state.playerImports || {}).length;
  state.playerImports = remap(state.playerImports);
  after.imports = Object.keys(state.playerImports).length;

  db.prepare(`
    INSERT INTO user_kv (user_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(will.id, DRAFT_STATE_KEY, JSON.stringify(state));

  let notesBefore = 0, notesAfter = 0;
  for (const { userId, value } of getAllNotesRows()) {
    let notes = {};
    try { notes = JSON.parse(value) || {}; } catch (e) { continue; }
    notesBefore += Object.keys(notes).length;
    const remapped = remap(notes);
    notesAfter += Object.keys(remapped).length;
    db.prepare("UPDATE user_kv SET value = ?, updated_at = datetime('now') WHERE user_id = ? AND key = ?")
      .run(JSON.stringify(remapped), userId, NOTES_KEY);
  }

  return { before: { ...before, notes: notesBefore }, after: { ...after, notes: notesAfter } };
}
