// The GM Tab / Draft Prep chat assistant — real-time back-and-forth in the
// browser, which needs a live backend LLM call (nothing about Claude Code
// can do that from inside a web page — see fantasy-gm's plan file for the
// terminal-based agents this complements, not replaces). Uses the
// Anthropic API directly, billed separately from the Claude Code
// subscription those terminal agents run under — a real, deliberate
// tradeoff made for genuine real-time chat in the UI.
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
import { getSetting } from "./settings.js";
import { getLeague } from "./leagues.js";
import { getFpPool, normName } from "./fantasypros.js";
import { getRoster, getFreeAgents } from "./espn.js";
import { koiKeeperCost } from "./keepers.js";
import { buildKoiValueTable, auctionInflationSnapshot } from "./valueModel.js";
import {
  getCurrentKeepers, listWaiverWire, replaceWaiverWire,
  upsertKeeperNote, appendTransaction, createTradeProposal,
} from "./gm.js";

const MODEL = "claude-opus-5";
const MAX_TOOL_ITERATIONS = 8; // hard stop so a runaway loop can't rack up unbounded cost

function getClient() {
  const key = getSetting("anthropic-api-key");
  if (!key) throw new Error("no Anthropic API key set — add one in Calculations → Chat Assistant");
  return new Anthropic({ apiKey: key });
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

const SYSTEM_PROMPT = `You are the Koi assistant — an in-season and draft-day fantasy football advisor for one specific league: Koi, ESPN-hosted, 12 teams, $200 auction, keepers on (max 3, cost = max(price paid, original draft price) + $10/yr, no cap on years).

You cover the same ground four separate terminal-based agents (GM, Analyst, Trade Negotiator, Draft Expert) handle in this app's companion Claude Code project — keeper strategy, player value, trade evaluation, waiver targets, and draft-day budget pacing — as one assistant here since this is a live chat, not a multi-agent terminal session.

Hard rules, not suggestions:
- You can never execute a roster move. Neither ESPN's nor Sleeper's API supports it. If asked to do something in the ESPN app, describe the exact steps — you are not the one clicking anything.
- A keeper's escalated cost needs years already kept and the original (pre-escalation) draft price. Neither is tracked automatically anywhere in this app. If a keeper question needs that history and it isn't in the conversation, ask for it — never assume 0 years or guess a price.
- ESPN's own roster data carries a keeperValue field. It is NOT confirmed to match this league's actual $10/yr rule — it may just be ESPN's generic default keeper feature. Never use it as a substitute for compute_keeper_cost's real number; mention it only as a caveat if it comes up.
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
    description: "Koi's real espn_dollar keeper-cost formula. Needs years already kept and the ORIGINAL (pre-escalation) price — ask the user for these if not already given, never assume.",
    input_schema: {
      type: "object",
      properties: {
        pricePaid: { type: "number", description: "What was paid for this player most recently." },
        originalDraftPrice: { type: "number", description: "The original, pre-escalation draft price." },
        isWaiverAdd: { type: "boolean", description: "True if this player was a waiver pickup, not an original draft pick." },
        yearsKept: { type: "integer", description: "Consecutive prior seasons already kept, before this one." },
      },
      required: ["pricePaid", "originalDraftPrice", "isWaiverAdd", "yearsKept"], additionalProperties: false,
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
        yearsKept: { type: "integer" },
        originalDraftPrice: { type: "number" },
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
        pricePaid: input.pricePaid, originalDraftPrice: input.originalDraftPrice,
        isWaiverAdd: input.isWaiverAdd, yearsKept: input.yearsKept,
      }) };

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
        yearsKept: input.yearsKept ?? null, originalDraftPrice: input.originalDraftPrice ?? null,
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
  const client = getClient();
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
