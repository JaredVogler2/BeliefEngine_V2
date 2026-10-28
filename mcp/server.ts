/**
 * Belief Engine as a local MCP server (stdio). An AI client (Claude Code, Claude Desktop, any MCP client) plays real runs through tools;
 * the browser stays the flagship experience and both use the same engine.
 *
 *   npm run mcp                         # stdio server, runs saved under ~/.belief-engine/mcp
 *   BELIEF_ENGINE_HOME=/tmp/be npm run mcp
 *   BELIEF_ENGINE_HOME=:memory: npm run mcp     # nothing written to disk
 *   BELIEF_ENGINE_DEBUG_TOOLS=1 npm run mcp     # adds debug_dump_state (local testing only; shows hidden convictions)
 *   BE_AI_ENABLED=1 BE_AI_DEV_PROVIDER=mock BE_AI_DEV_MEMORY_STORE=1 npm run mcp   # online reading through the scripted stand-in
 *
 * By default: no network, no API key, no LLM; the server validates tool calls and runs the deterministic engine. MCP *transport* (how a
 * client talks to this process) is separate from LLM *inference* (which model the client uses). Only if the person starting it sets
 * BE_AI_ENABLED=1 does it run the game's own inference service in-process (mcp/online.ts), under that service's consent, quotas and
 * validation; a tool argument can ask for it (`online`), never switch it on or carry a credential.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { GameService, SERVER_VERSION, actionSchema, runIdSchema, type ToolResult } from './service.ts';
import { onlineReaderFromEnv } from './online.ts';
import { VARIANTS } from './v2.ts';
import { RULES_TEXT, TOOLS_GUIDE, promptAlternateStrategy, promptExplainLoss, promptPlayCautiously } from './guide.ts';
import { RULES_VERSION } from '../src/engine/index.ts';
import { getScenarioDef, listScenarios } from '../src/engine/index.ts';

const MAX_TEXT = 100_000;

/** Turn a service result into an MCP tool result: a readable line, the machine-readable JSON, and `isError` for failures. */
export function toCallResult(res: ToolResult): CallToolResult {
  if (res.ok) {
    let json = JSON.stringify(res.data);
    if (json.length > MAX_TEXT) json = JSON.stringify({ truncated: true, note: 'Response too large; ask for a narrower view.', keys: Object.keys(res.data) });
    return { content: [{ type: 'text', text: res.text }, { type: 'text', text: json }], structuredContent: res.data };
  }
  const e = res.error;
  const alt = e.alternatives?.length ? ` Try: ${e.alternatives.join('; ')}.` : '';
  return { isError: true, content: [{ type: 'text', text: `${e.code}: ${e.message}${alt}` }], structuredContent: { error: e } };
}

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;

export function buildServer(service: GameService): McpServer {
  const server = new McpServer({ name: 'belief-engine', version: SERVER_VERSION }, {
    instructions: 'Belief Engine: play a village strategy game by changing what its people believe. Start with list_scenarios and create_game; read the belief-engine://rules resource once. Mutating calls return a revision; pass expectedRevision and idempotencyKey. Hidden information stays hidden: you see what a browser player sees.',
  });
  const run = (fn: () => ToolResult): CallToolResult => {
    try {
      return toCallResult(fn());
    } catch (e) {
      return toCallResult({ ok: false, error: { code: 'INTERNAL', message: e instanceof Error ? e.message : 'Unexpected error.', kind: 'INTERNAL', errorsVersion: 2 } });
    }
  };
  const runAsync = async (fn: () => Promise<ToolResult>): Promise<CallToolResult> => {
    try {
      return toCallResult(await fn());
    } catch (e) {
      return toCallResult({ ok: false, error: { code: 'INTERNAL', message: e instanceof Error ? e.message : 'Unexpected error.', kind: 'INTERNAL', errorsVersion: 2 } });
    }
  };
  const online = z.enum(['off', 'prefer', 'require']).optional().describe('Ask the game\'s inference service (if this server was started with it): off (default), prefer (fall back to the offline reader), or require.');

  server.registerTool('list_scenarios', { title: 'List scenarios', description: 'Story chapters with missions and objectives, the rules version, and how to start generated villages.', inputSchema: {}, annotations: RO }, async () => run(() => service.listScenarios()));

  server.registerTool('create_game', {
    title: 'Create a game',
    description: 'Start a new run. Story chapters: scenarioId redbank | harvest | ashwood. Generated village: mode "expedition" with a seed. Returns runId, briefing, state and legal next actions. controller "coach" starts a read-only run.',
    inputSchema: {
      scenarioId: z.string().max(80).optional(),
      seed: z.number().int().min(-2147483648).max(2147483647).optional(),
      difficulty: z.enum(['story', 'normal', 'hard']).optional(),
      mode: z.enum(['story', 'expedition']).optional(),
      controller: z.enum(['delegate', 'coach']).optional(),
      inventor: z.boolean().optional().describe('Classic Inventor run (unranked): the agent may write beliefs of its own with submit_belief and confirm_belief.'),
      variant: z.enum(VARIANTS as [string, ...string[]]).optional().describe('classic (default) | generative (write beliefs of your own: propose_belief) | living (villagers who remember and argue) | lab (stronger beliefs, unranked).'),
    },
    annotations: WRITE,
  }, async (a) => run(() => service.createGame(a as Parameters<GameService['createGame']>[0])));

  server.registerTool('get_game_state', {
    title: 'Game state', description: 'Day, phase, Influence, objectives, tonight\'s danger, resources, laws with public support, recent important events and next steps. detail "full" adds the forecast and the claim hand.',
    inputSchema: { runId: runIdSchema, detail: z.enum(['brief', 'full']).optional() }, annotations: RO,
  }, async (a) => run(() => service.getGameState(a)));

  server.registerTool('inspect_map', {
    title: 'Inspect the map', description: 'ASCII map with coordinates, landmarks (hp, lit, watchers), villagers, who the Keeper cannot reach, and tonight\'s predicted flood depth. Optional region id narrows it.',
    inputSchema: { runId: runIdSchema, region: z.string().max(40).optional() }, annotations: RO,
  }, async (a) => run(() => service.inspectMap(a)));

  server.registerTool('inspect_villager', {
    title: 'Inspect a villager', description: 'Trust ties, traits, needs, location and duty, what changes their mind, beliefs (exact only if scouted or just spoken to), reason codes, and feasible actions.',
    inputSchema: { runId: runIdSchema, villagerId: z.string().max(80) }, annotations: RO,
  }, async (a) => run(() => service.inspectVillager(a)));

  server.registerTool('inspect_claim', {
    title: 'Inspect a claim', description: 'What a story does (effect, trigger, radius, intensity, side effects, contradictions), the support it has per region against the thresholds a law needs, and the most influential villagers.',
    inputSchema: { runId: runIdSchema, claimId: z.string().max(80) }, annotations: RO,
  }, async (a) => run(() => service.inspectClaim(a)));

  server.registerTool('list_actions', {
    title: 'List legal actions', description: 'Legal action templates with costs for the current planning phase, optionally only those involving a villager or landmark. includeDisabled adds illegal ones with the reason.',
    inputSchema: { runId: runIdSchema, targetId: z.string().max(80).optional(), claimId: z.string().max(80).optional().describe('Only actions that use this story (for example one you just wrote).'), includeDisabled: z.boolean().optional(), limit: z.number().int().min(1).max(120).optional() }, annotations: RO,
  }, async (a) => run(() => service.listActions(a)));

  server.registerTool('compare_possible_actions', {
    title: 'Compare actions', description: 'Exact dry-run previews (the same ones the browser shows) of up to 12 given actions, or the top candidates; best conviction per Influence first. Changes nothing.',
    inputSchema: { runId: runIdSchema, actions: z.array(actionSchema).max(12).optional(), top: z.number().int().min(1).max(20).optional() }, annotations: RO,
  }, async (a) => run(() => service.compareActions(a)));

  server.registerTool('take_action', {
    title: 'Take an action', description: 'Perform one validated action. Costs Influence exactly as in the browser. Invalid, stale, duplicate or unaffordable calls change nothing and return a structured error with alternatives.',
    inputSchema: { runId: runIdSchema, action: actionSchema, expectedRevision: z.number().int().min(0).optional(), idempotencyKey: z.string().min(1).max(80).optional() }, annotations: WRITE,
  }, async (a) => run(() => service.takeAction(a)));

  server.registerTool('end_day', {
    title: 'End the day', description: 'Resolve one night: stories travel, laws wake or fade, the world is tested, dawn comes. Never simulates more than one day. Choose an opening story first.',
    inputSchema: { runId: runIdSchema, expectedRevision: z.number().int().min(0).optional(), idempotencyKey: z.string().min(1).max(80).optional() }, annotations: WRITE,
  }, async (a) => run(() => service.endDay(a)));

  server.registerTool('get_history', {
    title: 'Event history', description: 'Causal event log with reason codes and cause ids, paginated by afterEventId; filter by day and importance.',
    inputSchema: { runId: runIdSchema, fromDay: z.number().int().min(1).optional(), afterEventId: z.number().int().min(0).optional(), limit: z.number().int().min(1).max(100).optional(), minImportance: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional() }, annotations: RO,
  }, async (a) => run(() => service.getHistory(a)));

  server.registerTool('get_results', {
    title: 'Results and debrief', description: 'Available only after the run ends: verdict, story, score breakdown, causal chains, what was missed, and the hashes that verify the run against the browser engine.',
    inputSchema: { runId: runIdSchema, whatIf: z.boolean().optional().describe('After a defeat only: replay the run from each day with other plans and report the last day it could still have been saved. Takes a few seconds.') }, annotations: RO,
  }, async (a) => run(() => service.getResults(a)));

  server.registerTool('retry_or_new_game', {
    title: 'Retry or new game', description: 'Start a fresh, independent run of the same scenario (same seed if reuseSeed, otherwise a new one). No state carries over.',
    inputSchema: { runId: runIdSchema, reuseSeed: z.boolean().optional(), controller: z.enum(['delegate', 'coach']).optional() }, annotations: WRITE,
  }, async (a) => run(() => service.retryOrNew(a)));

  server.registerTool('export_replay', {
    title: 'Export replay', description: 'The exact accepted action log plus the final state and event hashes; replaying it in the browser engine gives the identical run.',
    inputSchema: { runId: runIdSchema }, annotations: RO,
  }, async (a) => run(() => service.exportReplay(a)));

  server.registerTool('export_game', {
    title: 'Export a browser save', description: 'This run as a Belief Engine save file the browser can load.', inputSchema: { runId: runIdSchema }, annotations: RO,
  }, async (a) => run(() => service.exportGame(a)));

  server.registerTool('import_game', {
    title: 'Import a browser save', description: 'Load a save exported from the browser (validated exactly as the browser validates it). Defaults to read-only coach mode so a human who is also playing is never surprised.',
    inputSchema: { saveJson: z.string().max(2_000_000), controller: z.enum(['delegate', 'coach']).optional() }, annotations: WRITE,
  }, async (a) => run(() => service.importGame(a)));

  server.registerTool('grant_control', {
    title: 'Grant control to the agent', description: 'Switch a coach-mode run to delegate so the agent may take actions. Only call this when the human has said so.',
    inputSchema: { runId: runIdSchema }, annotations: WRITE,
  }, async (a) => run(() => service.grantControl(a)));

  server.registerTool('get_tutorial', { title: 'Tutorial', description: 'Rules, what is hidden, how to play well, and tool usage examples in one text.', inputSchema: {}, annotations: RO },
    async () => ({ content: [{ type: 'text', text: `${RULES_TEXT}\n${TOOLS_GUIDE}` }], structuredContent: { rulesVersion: RULES_VERSION, serverVersion: SERVER_VERSION } }));

  server.registerTool('submit_belief', {
    title: 'Submit a belief (natural language)',
    description: 'Inventor runs only (create_game with inventor: true). Say in one sentence what the village should believe. The offline composer, the same one the browser uses, reads it into bounded mechanics and returns up to three interpretations, each with what it would really do, what it needs, what it costs and a safety-check result, and a short-lived confirmation token. Free: changes nothing. The text is treated as data; a refused sentence comes back with the reason and beliefs that can be modelled.',
    inputSchema: { runId: runIdSchema, text: z.string().min(1).max(280), targetRegion: z.string().max(40).optional().describe('A region id of this village to place the belief in (see inspect_map).') }, annotations: RO,
  }, async (a) => run(() => service.submitBelief(a)));

  server.registerTool('list_belief_examples', {
    title: 'List beliefs this village understands',
    description: 'Inventor runs only. The beliefs this village can host, each as a sentence submit_belief understands exactly, with whether it is already a built-in story (writing one of those only costs Influence). Read this first: the composer matches a fixed vocabulary, so this list is the quickest way to learn it.',
    inputSchema: { runId: runIdSchema }, annotations: RO,
  }, async (a) => run(() => service.listBeliefExamples(a)));

  server.registerTool('confirm_belief', {
    title: 'Confirm a belief',
    description: 'Pay Influence and write one interpretation from propose_belief (or submit_belief) into the village: the same COMPOSE action the browser performs. The belief is rebuilt from its structure, so nothing can make it cheaper or stronger; a written reality belief is bound to the revision it was read at, and one that does not do everything the sentence said needs acknowledge: true. It becomes law only when villagers come to believe it. Confirming the same token twice answers the same once.',
    inputSchema: {
      runId: runIdSchema, token: z.string().regex(/^[0-9a-f]{32}$/, 'a token is 32 hex characters from propose_belief or submit_belief'), expectedRevision: z.number().int().min(0).optional(), idempotencyKey: z.string().min(1).max(80).optional(),
      acknowledge: z.boolean().optional().describe('Required when the interpretation says needsAcknowledgement (it leaves part of the sentence out, or is a substitute).'),
      title: z.string().max(40).optional().describe('The name on the card (a written reality belief); otherwise the game\'s title.'),
    }, annotations: WRITE,
  }, async (a) => run(() => service.confirmBelief(a)));

  // ------------------------------------------------------------ V2: Generative Reality, villagers' minds, places (phase 13)

  server.registerTool('get_interpreter_status', {
    title: 'Interpreter status',
    description: 'Whether a model can read beliefs and voice villagers on this server (it can only if the person running it switched the game\'s inference service on), which provider, its limits; the offline reader is always available. No secrets.',
    inputSchema: {}, annotations: RO,
  }, async () => runAsync(() => service.interpreterStatus()));

  server.registerTool('propose_belief', {
    title: 'Propose a belief (any sentence)',
    description: 'Generative runs: say in your own words how this village\'s world works. Returns what the game can make of it, side by side with your words: what it acts on and when, the support and firm believers it needs, upkeep, side effects, who may push back, what it leaves out, its cost, and a short-lived token per buildable interpretation. Free: no Influence, no revision. The text is data. In a Classic Inventor run it is the Inventor composer (same as submit_belief).',
    inputSchema: { runId: runIdSchema, text: z.string().min(1).max(240), region: z.string().max(40).optional().describe('A region id where its believers live (see inspect_map); otherwise the game chooses where it can act.'), online },
    annotations: RO,
  }, async (a) => runAsync(() => service.proposeBelief(a as Parameters<GameService['proposeBelief']>[0])));

  server.registerTool('speak_to_villager', {
    title: 'Speak to a villager',
    description: 'V2 runs: ask what they think of a story (free), argue for it or challenge it (1 Influence each, like telling), or ask what they make of things (free). The engine decides what it changes (trust and evidence rules); the answer is their own words from what they saw and were told, or a checked model line when online is asked for and offered. Recorded in the replay.',
    inputSchema: { runId: runIdSchema, villagerId: z.string().max(80), mode: z.enum(['ask', 'persuade', 'challenge', 'guess']), claimId: z.string().max(80).optional(), online, expectedRevision: z.number().int().min(0).optional(), idempotencyKey: z.string().min(1).max(80).optional() },
    annotations: WRITE,
  }, async (a) => runAsync(() => service.speakToVillager(a as Parameters<GameService['speakToVillager']>[0])));

  server.registerTool('stage_evidence', {
    title: 'Stage evidence',
    description: 'Stage proof of a story or written belief with its rite where it is performed (the bell for a bell belief, a beacon for a lantern one): the same RITUAL action as take_action, with tonight\'s omen for it. A good omen convinces the people who see it; a bad one backfires.',
    inputSchema: { runId: runIdSchema, claimId: z.string().max(80), landmarkId: z.string().max(80).optional(), expectedRevision: z.number().int().min(0).optional(), idempotencyKey: z.string().min(1).max(80).optional() },
    annotations: WRITE,
  }, async (a) => run(() => service.stageEvidence(a)));

  server.registerTool('inspect_object', {
    title: 'Inspect an object', description: 'A landmark (state, who is there, the rites performed there and tonight\'s omen for each story they prove) or, in a Generative run, a coop, a stone or a hen.',
    inputSchema: { runId: runIdSchema, objectId: z.string().max(80) }, annotations: RO,
  }, async (a) => run(() => service.inspectObject(a)));

  server.registerTool('inspect_region', {
    title: 'Inspect a region', description: 'Who lives there, its landmarks, the laws acting there and the support each written belief has among the people who vote on it.',
    inputSchema: { runId: runIdSchema, regionId: z.string().max(40) }, annotations: RO,
  }, async (a) => run(() => service.inspectRegion(a)));

  server.registerTool('get_social_graph', {
    title: 'Social graph', description: 'Trust ties between villagers as the browser shows them (kind, trust each way, how fast stories travel), the whole village or one person and those within two ties; factions and leaders. No convictions.',
    inputSchema: { runId: runIdSchema, villagerId: z.string().max(80).optional() }, annotations: RO,
  }, async (a) => run(() => service.getSocialGraph(a)));

  server.registerTool('get_rule_explanation', {
    title: 'Explain a rule', description: 'For a story or a written belief: what it does (the supported effects), what it cannot (the parts left out), what else it does, its thresholds and where it is proven, its laws, and for a written belief how it became real so far (provenance from the log).',
    inputSchema: { runId: runIdSchema, claimId: z.string().max(80) }, annotations: RO,
  }, async (a) => run(() => service.getRuleExplanation(a)));

  if (service.debugTools) {
    server.registerTool('debug_dump_state', {
      title: 'DEBUG: full state', description: 'LOCAL TESTING ONLY. The whole run state including every private conviction. Never enable on a shared server.',
      inputSchema: { runId: runIdSchema }, annotations: RO,
    }, async (a) => run(() => service.debugDump(a)));
  }

  // resources: what an agent should read once
  server.registerResource('rules', 'belief-engine://rules', { title: 'Rules for agents', description: 'What the game is, what you can do, what is hidden, how to play well.', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: RULES_TEXT }] }));
  server.registerResource('tool-guide', 'belief-engine://tool-guide', { title: 'Tool cheat sheet', description: 'Example calls for every tool.', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: TOOLS_GUIDE }] }));
  for (const l of listScenarios()) {
    server.registerResource(`scenario-${l.id}`, `belief-engine://scenario/${l.id}`, { title: `${l.name}: mission and objective`, description: l.tagline, mimeType: 'text/markdown' }, async (uri) => {
      const def = getScenarioDef(l.id).runtime;
      const text = [`# ${def.name}`, '', def.tagline, '', ...def.briefing, '', '## Objectives', ...def.objectives.filter((o) => !o.instantLoss).map((o) => `- ${o.label}${o.heroic ? ' (heroic)' : ''}`), '', '## Opening stories', ...def.starters.map((c) => `- ${c}: ${def.claimDefs.find((d) => d.id === c)?.text}`), '', '## Hints', ...def.hints.map((h) => `- ${h}`)].join('\n');
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] };
    });
  }

  // prompts (instructions only: the tools enforce the rules)
  server.registerPrompt('play_cautiously', { title: 'Play cautiously', description: 'Play a game turn by turn with previews and explanations.', argsSchema: { scenario: z.string().max(40).optional() } },
    ({ scenario }) => ({ messages: [{ role: 'user', content: { type: 'text', text: promptPlayCautiously(scenario ?? 'Flood at Redbank') } }] }));
  server.registerPrompt('find_alternate_strategy', { title: 'Find an alternate winning strategy', description: 'Win with a different plan from the obvious one.', argsSchema: { scenario: z.string().max(40).optional(), avoid: z.string().max(120).optional() } },
    ({ scenario, avoid }) => ({ messages: [{ role: 'user', content: { type: 'text', text: promptAlternateStrategy(scenario ?? 'Flood at Redbank', avoid ?? '') } }] }));
  server.registerPrompt('explain_loss', { title: 'Explain why I lost', description: 'Read the history and explain a defeat with causes.', argsSchema: { runId: z.string().max(60).optional() } },
    ({ runId }) => ({ messages: [{ role: 'user', content: { type: 'text', text: promptExplainLoss(runId ?? '') } }] }));
  return server;
}

export function defaultHome(): string | null {
  const env = process.env.BELIEF_ENGINE_HOME;
  if (env === ':memory:') return null;
  return env && env.length ? env : join(homedir(), '.belief-engine', 'mcp');
}

async function main(): Promise<void> {
  // online reading only if the person starting the server switched the game's inference service on (mcp/online.ts); diagnostics to stderr
  const online = onlineReaderFromEnv(process.env, (line) => process.stderr.write(`${line}\n`));
  const service = new GameService({ home: defaultHome(), maxRuns: Number(process.env.BELIEF_ENGINE_MAX_RUNS ?? 50), debugTools: process.env.BELIEF_ENGINE_DEBUG_TOOLS === '1', online });
  const server = buildServer(service);
  await server.connect(new StdioServerTransport());
  // stdout carries the protocol: all diagnostics go to stderr
  process.stderr.write(`belief-engine MCP server ${SERVER_VERSION} (rules ${RULES_VERSION}) on stdio; runs: ${defaultHome() ?? 'memory only'}; online reading: ${online ? (online.provider ?? 'on, not ready') : 'off'}${service.debugTools ? '; DEBUG TOOLS ON' : ''}\n`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('mcp/server.ts')) {
  main().catch((e) => {
    process.stderr.write(`fatal: ${e instanceof Error ? e.stack : String(e)}\n`);
    process.exit(1);
  });
}
