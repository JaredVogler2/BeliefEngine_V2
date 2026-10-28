import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';
import { replayRun, stateHash } from '../../src/engine/index.ts';
import type { Action, CreateRunOptions } from '../../src/engine/index.ts';

/**
 * Phase 13's integration proof: the real server process, spoken to by the official MCP SDK client over stdio, plays a Generative
 * Reality run from start to ending: inspect → a new belief proposed in words → confirmed → persuasion → law → the world changed →
 * ending → replay. It replays the chain the browser test plays (tests/fixtures/v2-bridge-traces.json, "hens"), with propose_belief
 * and confirm_belief standing where the browser's composer stood, and must end on the browser's own state hash. Unauthorized,
 * duplicate and stale calls along the way must leave the run unchanged. The online path is tested against the scripted stand-in only.
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SERVER = join(ROOT, 'mcp', 'server.ts');
interface Trace { opts: CreateRunOptions; sentence: string; region: string | null; claimId: string; stateHash: string; lawDay: number | null; actions: Action[] }
const fx = JSON.parse(readFileSync(new URL('../fixtures/v2-bridge-traces.json', import.meta.url), 'utf8')) as Record<string, Trace>;

async function connect(env: Record<string, string> = {}): Promise<{ client: Client; close: () => Promise<void> }> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', SERVER],
    cwd: ROOT,
    env: { ...(process.env as Record<string, string>), BELIEF_ENGINE_HOME: ':memory:', BE_AI_ENABLED: '', ...env },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'belief-engine-v2-test-client', version: '1.0.0' });
  await client.connect(transport);
  return { client, close: () => client.close() };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Structured = Record<string, any>;
async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<{ isError: boolean; data: Structured; text: string }> {
  const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; structuredContent?: Structured; content: { type: string; text?: string }[] };
  return { isError: !!res.isError, data: res.structuredContent ?? {}, text: res.content.map((c) => c.text ?? '').join('\n') };
}
async function ok(client: Client, name: string, args: Record<string, unknown> = {}): Promise<Structured> {
  const r = await call(client, name, args);
  if (r.isError) throw new Error(`${name}: ${r.text}`);
  return r.data;
}

const V2_TOOLS = ['get_interpreter_status', 'propose_belief', 'confirm_belief', 'speak_to_villager', 'stage_evidence', 'inspect_object', 'inspect_region', 'get_social_graph', 'get_rule_explanation'];

describe('MCP V2 over stdio with the official SDK client', () => {
  it('advertises the V2 tools beside every V1 tool, each with a schema; online reading is off by default', async () => {
    const { client, close } = await connect();
    try {
      const names = (await client.listTools()).tools.map((t) => t.name);
      for (const n of [...V2_TOOLS, 'create_game', 'take_action', 'end_day', 'submit_belief', 'list_belief_examples', 'export_replay']) expect(names, n).toContain(n);
      const status = await ok(client, 'get_interpreter_status');
      expect(status.offline.available).toBe(true);
      expect(status.online).toMatchObject({ available: false, reason: 'disabled' });
    } finally {
      await close();
    }
  }, 60_000);

  it('start → inspect → a belief in words → confirm → persuasion → law → the hens rise → ending → replay, on the browser\'s own hash', async () => {
    const t = fx.hens;
    const { client, close } = await connect();
    try {
      const g = await ok(client, 'create_game', { scenarioId: t.opts.scenarioId, seed: t.opts.seed, difficulty: t.opts.difficulty, variant: 'generative' });
      const runId = g.runId as string;
      expect(g.variant).toBe('generative');
      let rev = g.revision as number;
      let lawWoke = false;
      let rose = 0;
      let checkedGuards = false;
      for (const a of t.actions) {
        if (a.type === 'COMPOSE') {
          // look before writing: the map, a region, the people
          const map = await ok(client, 'inspect_map', { runId });
          expect(map.regions.map((r: { id: string }) => r.id)).toContain('east');
          await ok(client, 'inspect_region', { runId, regionId: 'east' });
          const p = await ok(client, 'propose_belief', { runId, text: t.sentence, ...(t.region ? { region: t.region } : {}) });
          expect(p.kind).toBe('supported');
          const c = p.interpretations[0];
          expect(c.buildable).toBe(true);
          const done = await ok(client, 'confirm_belief', { runId, token: c.token, expectedRevision: rev, idempotencyKey: `compose-${rev}` });
          expect(done.claim.id, 'the agent writes exactly the belief the browser wrote').toBe((a as { claim: { id: string } }).claim.id);
          rev = done.revision;
          continue;
        }
        if (a.type === 'END_DAY') {
          const night = await ok(client, 'end_day', { runId, expectedRevision: rev, idempotencyKey: `night-${rev}` });
          if (night.lawChanges.some((e: { code: string }) => e.code === 'LAW_ACTIVATED')) lawWoke = true;
          rose += night.importantEvents.filter((e: { code: string }) => e.code === 'CHICKENS_ROSE').length;
          rev = night.revision;
          continue;
        }
        if (!checkedGuards && a.type === 'SEED') {
          // a stale revision and an unknown villager change nothing
          const stale = await call(client, 'take_action', { runId, action: a, expectedRevision: rev - 1 });
          expect(stale.isError).toBe(true);
          expect(stale.data.error).toMatchObject({ code: 'STALE_REVISION', kind: 'STALE_REVISION', errorsVersion: 2 });
          const nobody = await call(client, 'take_action', { runId, action: { ...a, target: 'nobody' }, expectedRevision: rev });
          expect(nobody.isError).toBe(true);
          expect((await ok(client, 'get_game_state', { runId })).revision).toBe(rev);
        }
        const r = await ok(client, 'take_action', { runId, action: a, expectedRevision: rev, idempotencyKey: `act-${rev}` });
        if (!checkedGuards && a.type === 'SEED') {
          // the same call again (a retried request): the same answer, nothing done twice
          const dup = await ok(client, 'take_action', { runId, action: a, expectedRevision: rev, idempotencyKey: `act-${rev}` });
          expect(dup.replayedFromIdempotencyKey).toBe(true);
          expect(dup.revision).toBe(r.revision);
          checkedGuards = true;
        }
        rev = r.revision;
      }
      expect(checkedGuards).toBe(true);
      expect(lawWoke, 'the written belief became law').toBe(true);
      expect(rose, 'the law lifted the hens on at least one night').toBeGreaterThan(0);
      const res = await ok(client, 'get_results', { runId });
      expect(res.result).toBe('defeat');
      expect(res.verification.stateHash, 'the same run as the browser played').toBe(t.stateHash);
      const rule = await ok(client, 'get_rule_explanation', { runId, claimId: t.claimId });
      expect(rule.rule.provenance.status).toBe('law');
      const rep = await ok(client, 'export_replay', { runId });
      expect(stateHash(replayRun(rep.replay).state)).toBe(t.stateHash);
    } finally {
      await close();
    }
  }, 180_000);

  it('over stdio: a stale confirmation is refused, a repeated one pays nothing, a villager answers, and objects the law moves can be inspected', async () => {
    const { client, close } = await connect();
    try {
      const g = await ok(client, 'create_game', { scenarioId: 'redbank', seed: 1, variant: 'generative' });
      const runId = g.runId as string;
      await ok(client, 'take_action', { runId, action: { type: 'PICK_STARTER', claim: 'river_fears_fire' } });
      const stale = await ok(client, 'propose_belief', { runId, text: 'Chickens fly when the bell rings.' });
      await ok(client, 'take_action', { runId, action: { type: 'SEED', claim: 'river_fears_fire', target: 'ivo' } });
      const before = await ok(client, 'get_game_state', { runId });
      const refused = await call(client, 'confirm_belief', { runId, token: stale.interpretations[0].token });
      expect(refused.isError).toBe(true);
      expect(refused.data.error).toMatchObject({ code: 'STALE_REVISION', kind: 'STALE_REVISION' });
      expect((await ok(client, 'get_game_state', { runId })).revision).toBe(before.revision);
      const fresh = await ok(client, 'propose_belief', { runId, text: 'Chickens fly when the bell rings.' });
      const done = await ok(client, 'confirm_belief', { runId, token: fresh.interpretations[0].token });
      const again = await ok(client, 'confirm_belief', { runId, token: fresh.interpretations[0].token });
      expect(again.replayedFromToken).toBe(true);
      expect(again.remainingInfluence).toBe(done.remainingInfluence);
      // talking: asking is free, and the answer is the villager's own (offline: the game's words, not a model's)
      const ask = await ok(client, 'speak_to_villager', { runId, villagerId: 'tilly', mode: 'ask', claimId: done.claim.id });
      expect(ask.reply.length).toBeGreaterThan(0);
      expect(ask.remainingInfluence).toBe(done.remainingInfluence);
      // what the written law will move: a coop of hens, and the bell that sets it off
      const state = await ok(client, 'inspect_region', { runId, regionId: 'east' });
      expect(state.region.writtenBeliefs.map((w: { claim: string }) => w.claim)).toContain(done.claim.id);
      const bell = await ok(client, 'inspect_object', { runId, objectId: 'bell' });
      expect(bell.object.rituals.find((r: { ritual: string }) => r.ritual === 'ring_bells').stagesProofOf.map((x: { claim: string }) => x.claim)).toContain(done.claim.id);
      const nothing = await call(client, 'inspect_object', { runId, objectId: 'no-such-thing' });
      expect(nothing.isError).toBe(true);
      expect(nothing.data.error.kind).toBe('NOT_FOUND');
    } finally {
      await close();
    }
  }, 120_000);

  it('a coach-mode run refuses every write (NOT_AUTHORIZED), and online reading through the scripted stand-in is labelled "mock"', async () => {
    const { client, close } = await connect({ BE_AI_ENABLED: '1', BE_AI_DEV_PROVIDER: 'mock', BE_AI_DEV_MEMORY_STORE: '1' });
    try {
      const coach = await ok(client, 'create_game', { scenarioId: 'redbank', seed: 1, variant: 'generative', controller: 'coach' });
      const before = (await ok(client, 'get_game_state', { runId: coach.runId })).revision;
      for (const [tool, args] of [
        ['take_action', { action: { type: 'PICK_STARTER', claim: 'river_fears_fire' } }],
        ['speak_to_villager', { villagerId: 'ivo', mode: 'ask' }],
        ['stage_evidence', { claimId: 'river_fears_fire' }],
        ['end_day', {}],
      ] as const) {
        const r = await call(client, tool, { runId: coach.runId, ...args });
        expect(r.isError, tool).toBe(true);
        expect(r.data.error.kind, tool).toBe('NOT_AUTHORIZED');
      }
      expect((await ok(client, 'get_game_state', { runId: coach.runId })).revision).toBe(before);

      const status = await ok(client, 'get_interpreter_status');
      expect(status.online).toMatchObject({ available: true, provider: 'mock' });
      const g = await ok(client, 'create_game', { scenarioId: 'redbank', seed: 1, variant: 'generative' });
      await ok(client, 'take_action', { runId: g.runId, action: { type: 'PICK_STARTER', claim: 'river_fears_fire' } });
      const p = await ok(client, 'propose_belief', { runId: g.runId, text: 'Chickens fly when the bell rings.', online: 'require' });
      expect(p.online).toMatchObject({ used: true, provider: 'mock' });
      expect(p.interpretations.some((c: { source: { reader: string } }) => c.source.reader === 'model')).toBe(true);
    } finally {
      await close();
    }
  }, 120_000);
});
