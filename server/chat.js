// The GM Tab / Draft Prep chat assistant — real-time back-and-forth in the
// browser, which needs a live backend LLM call (nothing about Claude Code
// CAN do that from inside a web page in the normal interactive sense —
// see fantasy-gm's plan file for the terminal-based agents this
// complements, not replaces).
//
// Authenticates via an ISOLATED Claude Code login profile
// ("fantasy-gm-container"), not a metered Anthropic API key — draws on
// Will's Claude subscription, same as the terminal agents. Created via
// `ant auth login --profile fantasy-gm-container`, deliberately separate
// from Will's own interactive session (~/.claude/.credentials.json,
// untouched) so a compromise of this container is independently
// revocable without touching his main login. Mounted read-only in
// docker-compose.yml at /anthropic-config; ANTHROPIC_CONFIG_DIR/
// ANTHROPIC_PROFILE env vars there select it.
//
// The Anthropic SDK itself only reads ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN
// — it does NOT resolve a profile file on its own (confirmed live: a bare
// `new Anthropic()` 500'd with "Could not resolve authentication method"
// even with the profile mounted and the env vars set). The `ant` CLI is
// what actually understands profiles and the OAuth refresh dance, so
// getClient() shells out to `ant auth print-credentials --access-token`
// for a fresh short-lived bearer token on every call (the token isn't
// long-lived enough to cache across requests) and passes it as
// `authToken`, plus the `anthropic-beta: oauth-2025-04-20` header the
// docs say /v1/messages requires for OAuth-token requests specifically
// (it's silently NOT required on some other endpoints, but always sent
// here since messages.create is the only call this file makes).
//
// This whole approach is a deliberate departure from the Anthropic API's
// own docs, which steer servers/containers toward Workload Identity
// Federation instead of OAuth login — WIF needs a cloud IAM provider a
// home server doesn't have, and Will made this tradeoff knowingly rather
// than pay per-use for what's a low-volume personal chat.
import { execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);
//
// One assistant, not six separate agents — a single system prompt covers
// the same judgment areas (keeper strategy, trade evaluation, roster/
// waiver, draft pacing) the terminal GM/Analyst/Trade Negotiator/Draft
// Expert agents split across files, since a browser chat doesn't have
// Claude Code's subagent-routing mechanism to lean on. Same hard
// boundaries as fantasy-gm/CLAUDE.md: never claims to execute a move,
// never treats ESPN's keeperValue as the real keeper cost, asks for
// years-kept/original price rather than guessing.
//
// Tools below call directly into the same, already-verified functions
// the rest of this app and fantasy-gm's terminal agents use — no
// separate/parallel logic to drift out of sync.
import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db.js";
import { getLeague } from "./leagues.js";
import { getFpPool, normName } from "./fantasypros.js";
import { getRoster, getFreeAgents, getDraftPriceHistory } from "./espn.js";
import { koiKeeperCost } from "./keepers.js";
import { buildKoiValueTable, auctionInflationSnapshot } from "./valueModel.js";
import {
  getCurrentKeepers, listWaiverWire, replaceWaiverWire,
  upsertKeeperNote, appendTransaction, createTradeProposal,
} from "./gm.js";

const MODEL = "claude-opus-5";
const MAX_TOOL_ITERATIONS = 8; // hard stop so a runaway loop can't rack up unbounded cost

async function getClient() {
  const { stdout } = await execFileAsync("ant", ["auth", "print-credentials", "--access-token"]);
  const token = stdout.trim();
  if (!token) throw new Error("ant auth print-credentials returned no token — check the mounted fantasy-gm-container profile hasn't been revoked");
  return new Anthropic({
    authToken: token,
    apiKey: null, // explicit — an ANTHROPIC_API_KEY env var would otherwise take precedence and silently switch this back to metered billing
    defaultHeaders: { "anthropic-beta": "oauth-2025-04-20" },
  });
}

function resolvePlayerByName(name) {
  if (!name) return null;
  const target = normName(name);
  const pool = getFpPool();
  // exact normalized match first, then a substring fallback (handles
  // partial names like "Bowers" reasonably without over-matching)
  let hit = pool.find(p => normName(p.name) === target);
  if (!hit) hit = pool.find(p => normName(p.name).includes(target));
  return hit || null;
}

/** fp_pool has no ESPN id column — resolves via the live roster (which
 *  already carries espnPlayerId, matched to fp_pool by name+position in
 *  the /api/gm/roster route). Only works for players currently on the
 *  roster, which is the only case a keeper-cost question actually needs. */
async function resolveEspnPlayerId(fpPoolPlayer) {
  const league = getLeague("koi");
  const { roster } = await getRoster(league.source_league_id, league.source_team_id);
  const target = normName(fpPoolPlayer.name);
  const hit = roster.find(r => normName(r.name) === target);
  return hit?.espnPlayerId ?? null;
}

const SYSTEM_PROMPT = `You are the Koi assistant — an in-season and draft-day fantasy football advisor for one specific league: Koi, ESPN-hosted, 12 teams, $200 auction, keepers on (max 3, cost = max(waiver cost paid, previous year's actual draft/keeper price) + $10 flat — NOT compounding by years kept, confirmed directly by Will against real draft history, do not add any years-based multiplier on top of this).

You cover the same ground four separate terminal-based agents (GM, Analyst, Trade Negotiator, Draft Expert) handle in this app's companion Claude Code project — keeper strategy, player value, trade evaluation, waiver targets, and draft-day budget pacing — as one assistant here since this is a live chat, not a multi-agent terminal session.

Hard rules, not suggestions:
- You can never execute a roster move. Neither ESPN's nor Sleeper's API supports it. If asked to do something in the ESPN app, describe the exact steps — you are not the one clicking anything.
- A keeper's cost needs the previous year's actual price (from get_keeper_draft_history — try this before asking the user) and, if the player was waiver-added, what was paid for that. ESPN's draft data can never see a mid-season waiver transaction — if get_keeper_draft_history returns a flag about an unexplained price jump, say so and ask the user to confirm rather than trusting the number.
- ESPN's own roster data carries a keeperValue field. It is NOT confirmed to match this league's actual keeper rule — it may just be ESPN's generic default keeper feature. Never use it as a substitute for compute_keeper_cost's real number; mention it only as a caveat if it comes up.
- All player value/VBD/tier/auction-$ numbers come from the tools below, which run the same verified pipeline the live draft board uses — never estimate a number yourself when a tool can give the real one.
- Before writing anything (a keeper note, a transaction, a trade proposal), be reasonably sure that's what the user actually wants recorded — these show up in the GM Tab as real records, not scratch notes.

Be direct and concrete. Lead with the number or the answer, then the reasoning. This is a real league with real money on the table, not a demo.`;

const TOOLS = [
  {
    name: "get_league_rules",
    description: "Koi's league configuration — teams, auction budget, roster spots, keeper rule.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_player_value",
    description: "Look up one player's real VBD, tier, projected points, and static auction $ value from the live pool.",
    input_schema: {
      type: "object",
      properties: { playerName: { type: "string", description: "Player's name, e.g. \"Brock Bowers\"" } },
      required: ["playerName"], additionalProperties: false,
    },
  },
  {
    name: "list_top_players",
    description: "Top players by VBD, optionally filtered to one position — for board-building or waiver comparisons.",
    input_schema: {
      type: "object",
      properties: {
        position: { type: "string", enum: ["QB","RB","WR","TE","K","DEF"], description: "Omit for overall." },
        limit: { type: "integer", description: "Default 15." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_current_draft_state",
    description: "What's actually been drafted so far in Koi — who, for how much, drafted count, total $ spent.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_auction_inflation",
    description: "Live inflation read: real $ spent vs. static value of what's been drafted, and what that implies for what's left. Noisy with only a few picks in — say so if the sample is small.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_current_keepers",
    description: "Players currently flagged as keepers for this season, what they're paying, and their current value context.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "compute_keeper_cost",
    description: "Koi's real keeper-cost formula: cost = max(waiver cost paid, previous year's actual draft/keeper price) + $10 flat. NOT compounding by years kept — confirmed directly by Will against real draft history, don't apply any additional years-based multiplier on top of this. Use get_keeper_draft_history first to get the real previous-year price when possible, rather than asking the user for it.",
    input_schema: {
      type: "object",
      properties: {
        waiverCostPaid: { type: "number", description: "What was paid to add this player via waiver, if applicable. Omit/null if never waiver-added." },
        previousYearPrice: { type: "number", description: "This player's actual draft or keeper price last season, wherever they were. Omit/null if they have no draft history." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_keeper_draft_history",
    description: "Real ESPN draft-day price history for one player, walking back through past completed drafts. Gives the previous year's actual price to feed compute_keeper_cost — use this before asking the user, since it's usually reliable. Cannot see mid-season waiver pickups (ESPN doesn't expose that data) — if the price history looks like it jumped unexplainably, say so and ask the user to confirm rather than guessing.",
    input_schema: {
      type: "object",
      properties: { playerName: { type: "string" } },
      required: ["playerName"], additionalProperties: false,
    },
  },
  {
    name: "get_roster",
    description: "Current 14-man Koi roster, live from ESPN — who, position, how acquired, injury status.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_waiver_wire",
    description: "Last-refreshed free-agent snapshot. Use refresh_waiver_wire first if the user wants current data.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "refresh_waiver_wire",
    description: "Pull a fresh free-agent list live from ESPN and save it — use when the user wants up-to-date waiver targets.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "save_keeper_note",
    description: "Record a keeper leaning/rationale in the GM Tab — only when the user is actually deciding something, not for casual discussion.",
    input_schema: {
      type: "object",
      properties: {
        playerName: { type: "string" },
        leaning: { type: "string", enum: ["keep", "cut", "undecided"] },
        rationale: { type: "string" },
        yearsKept: { type: "integer", description: "Informational only, not a cost input — how many consecutive seasons this will make." },
        previousYearPrice: { type: "number", description: "The actual cost basis used for this decision — from get_keeper_draft_history or a waiver price." },
      },
      required: ["playerName", "leaning"], additionalProperties: false,
    },
  },
  {
    name: "log_transaction",
    description: "Record a recommendation or confirmed move in the GM Tab's transaction log.",
    input_schema: {
      type: "object",
      properties: {
        eventType: { type: "string", description: "e.g. waiver_recommendation, trade_recommendation, confirmed_executed" },
        playerName: { type: "string" },
        detail: { type: "string", description: "Plain-language description of the move." },
        status: { type: "string", enum: ["recommended", "confirmed_executed", "declined"] },
      },
      required: ["eventType", "detail"], additionalProperties: false,
    },
  },
  {
    name: "create_trade_proposal",
    description: "Start tracking a trade proposal in the GM Tab.",
    input_schema: {
      type: "object",
      properties: {
        giveNames: { type: "array", items: { type: "string" } },
        getNames: { type: "array", items: { type: "string" } },
        counterparty: { type: "string" },
        analysis: { type: "string" },
      },
      required: ["giveNames", "getNames"], additionalProperties: false,
    },
  },
];

async function executeTool(name, input) {
  switch (name) {
    case "get_league_rules":
      return getLeague("koi");

    case "get_player_value": {
      const p = resolvePlayerByName(input.playerName);
      if (!p) return { error: `No player matching "${input.playerName}" in the current pool.` };
      const table = buildKoiValueTable();
      return { name: p.name, position: p.position, team: p.team, ...table[p.id] };
    }

    case "list_top_players": {
      const table = buildKoiValueTable();
      const limit = input.limit || 15;
      const rows = Object.values(table)
        .filter(r => (!input.position || r.pos === input.position) && r.vbd != null)
        .sort((a, b) => b.vbd - a.vbd)
        .slice(0, limit);
      return rows;
    }

    case "get_current_draft_state": {
      const row = db.prepare("SELECT value FROM user_kv WHERE key = 'ffb-draft-state'").get();
      const state = row ? JSON.parse(row.value) : {};
      const draft = (state.draftByLeague || {}).koi || {};
      const drafted = Object.entries(draft).filter(([, v]) => v.drafted);
      const spent = drafted.reduce((s, [, v]) => s + Number(v.paid || 0), 0);
      return { draftedCount: drafted.length, spent, budget: 12 * 200, picks: draft };
    }

    case "get_auction_inflation":
      return auctionInflationSnapshot("koi");

    case "get_current_keepers":
      return getCurrentKeepers("koi");

    case "compute_keeper_cost":
      return { cost: koiKeeperCost({
        waiverCostPaid: input.waiverCostPaid, previousYearPrice: input.previousYearPrice,
      }) };

    case "get_keeper_draft_history": {
      const p = resolvePlayerByName(input.playerName);
      if (!p) return { error: `No player matching "${input.playerName}" in the current pool.` };
      const espnId = await resolveEspnPlayerId(p);
      if (!espnId) return { error: `Couldn't resolve an ESPN player id for ${p.name} — not on the current roster, so no ESPN id to look up.` };
      const league = getLeague("koi");
      return await getDraftPriceHistory(league.source_league_id, espnId);
    }

    case "get_roster": {
      const league = getLeague("koi");
      return await getRoster(league.source_league_id, league.source_team_id);
    }

    case "get_waiver_wire":
      return listWaiverWire("koi");

    case "refresh_waiver_wire": {
      const league = getLeague("koi");
      const { status, players } = await getFreeAgents(league.source_league_id, undefined, 30);
      if (status !== 200) return { error: `ESPN returned HTTP ${status}` };
      const fpByNamePos = new Map();
      for (const p of getFpPool()) fpByNamePos.set(normName(p.name) + "|" + p.position, p.id);
      const entries = players.map(p => ({
        playerId: p.position ? (fpByNamePos.get(normName(p.name) + "|" + p.position) ?? null) : null,
        espnPlayerId: p.espnPlayerId, name: p.name, position: p.position, team: null,
        note: p.percentOwned != null ? `${p.percentOwned.toFixed(1)}% owned` : null,
      }));
      return replaceWaiverWire("koi", entries);
    }

    case "save_keeper_note": {
      const p = resolvePlayerByName(input.playerName);
      if (!p) return { error: `No player matching "${input.playerName}" in the current pool.` };
      const season = new Date().getFullYear();
      return upsertKeeperNote("koi", p.id, season, {
        leaning: input.leaning, rationale: input.rationale ?? null,
        yearsKept: input.yearsKept ?? null, originalDraftPrice: input.previousYearPrice ?? null,
      });
    }

    case "log_transaction": {
      const p = input.playerName ? resolvePlayerByName(input.playerName) : null;
      return appendTransaction("koi", {
        eventType: input.eventType, playerId: p?.id ?? null,
        detail: input.detail, status: input.status ?? "recommended",
      });
    }

    case "create_trade_proposal": {
      const giveIds = (input.giveNames || []).map(n => resolvePlayerByName(n)?.id).filter(Boolean);
      const getIds = (input.getNames || []).map(n => resolvePlayerByName(n)?.id).filter(Boolean);
      return createTradeProposal("koi", {
        giveIds, getIds, counterparty: input.counterparty ?? null, analysis: input.analysis ?? null,
      });
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/** Runs the manual tool-use loop against the Anthropic API for one chat
 *  turn. `history` is the full prior message array (Anthropic's
 *  MessageParam shape) plus the new user message already appended by the
 *  caller. Returns { reply, history } — history includes everything
 *  (tool calls and results) so the caller can persist/replay it. */
export async function runChat(history) {
  const client = await getClient();
  const messages = [...history];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const text = response.content.filter(b => b.type === "text").map(b => b.text).join("\n");
      return { reply: text, history: messages };
    }

    const toolUseBlocks = response.content.filter(b => b.type === "tool_use");
    const toolResults = [];
    for (const block of toolUseBlocks) {
      let result;
      try {
        result = await executeTool(block.name, block.input);
      } catch (e) {
        result = { error: e.message };
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result ?? null),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return {
    reply: "I've used up this turn's tool-call budget without reaching a final answer — try asking again, maybe more narrowly.",
    history: messages,
  };
}
