// The GM Tab / Draft Prep chat assistant — real-time back-and-forth in the
// browser, which needs a live backend LLM call (nothing about Claude Code
// can do that from inside a web page — see fantasy-gm's plan file for the
// terminal-based agents this complements, not replaces).
//
// Authenticates with a real Anthropic API key, billed per use — separate
// from the Claude Code subscription the terminal agents run under. This
// project previously tried an isolated Claude Code login profile (`ant
// auth login --profile fantasy-gm-container`) to avoid that cost, mounted
// read-only via docker-compose.yml. Verified live that it doesn't work
// the way it looked like it should: `ant auth status` shows that
// profile's token carries `scope: user:developer` — Anthropic's metered
// developer-API scope, not a subscription entitlement, confirmed by
// hitting a real "credit balance too low" error with both a raw SDK call
// AND the actual `claude -p` binary using that same profile. Every
// request through it was quietly billing against real API credits the
// whole time, not the subscription — the opposite of the goal. Reverted
// to a real key (Will's own choice, after seeing that finding) rather
// than keep chasing a subscription-covered path that doesn't appear to
// exist for an unattended backend process with the tools available here.
import { getSetting } from "./settings.js";
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
import { getPositionalTrends } from "./draftHistory.js";
import { koiKeeperCost } from "./keepers.js";
import { buildKoiValueTable, auctionInflationSnapshot } from "./valueModel.js";
import {
  getCurrentKeepers, listWaiverWire, replaceWaiverWire,
  upsertKeeperNote, appendTransaction, createTradeProposal,
} from "./gm.js";

const MODEL = "claude-sonnet-5"; // Will's explicit call — cheaper per-token and noticeably faster than Opus 5 for this chat, which matters given the multi-tool-call latency this feature already has
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
    name: "get_positional_draft_trends",
    description: "Historical auction price by position and rank, from real completed Koi drafts (2022-2025) — 'what does the 3rd RB usually cost'. Returns mean/median/min/max per rank across seasons plus real examples, so you can tell an actual outlier from normal spread. Use this to sanity-check a live or planned bid against real history, not just this year's static value. If the trend data hasn't been refreshed yet, say so and suggest hitting Refresh in the Draft Trends panel.",
    input_schema: {
      type: "object",
      properties: {
        position: { type: "string", enum: ["QB", "RB", "WR", "TE", "K", "DEF"] },
        maxRank: { type: "integer", description: "How many ranks deep to return, default 10." },
      },
      required: ["position"], additionalProperties: false,
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

    case "get_positional_draft_trends": {
      const trends = getPositionalTrends("koi", input.position, input.maxRank || 10);
      if (!trends.seasonsIncluded.length) return { error: "No draft history stored yet — refresh it first (Draft Trends panel or POST /api/gm/draft-history/refresh)." };
      return trends;
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

    // Run every tool call in this turn concurrently, not one at a time —
    // asking about 3 keepers means 3 independent get_keeper_draft_history
    // calls (each its own multi-season ESPN walk-back), and running them
    // sequentially was the real cause of a 2-minute response (verified
    // live) that a reverse proxy or the browser itself was timing out on
    // before the real, correct answer ever arrived.
    const toolUseBlocks = response.content.filter(b => b.type === "tool_use");
    const toolResults = await Promise.all(toolUseBlocks.map(async (block) => {
      let result;
      try {
        result = await executeTool(block.name, block.input);
      } catch (e) {
        result = { error: e.message };
      }
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result ?? null),
      };
    }));
    messages.push({ role: "user", content: toolResults });
  }

  return {
    reply: "I've used up this turn's tool-call budget without reaching a final answer — try asking again, maybe more narrowly.",
    history: messages,
  };
}
