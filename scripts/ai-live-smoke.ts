/**
 * LIVE provider smoke test: calls the real Vercel AI Gateway through the same provider code the server uses, three times
 * (a supported belief, an unsupported one, one villager decision), and records model id, latency, tokens and cost. It costs a
 * fraction of a cent and runs ONLY when a credential is present in this process's environment (AI_GATEWAY_API_KEY in an
 * untracked .env.local, or a Vercel OIDC token). Without one it says LIVE is UNVERIFIED and exits 2, so a missing credential can
 * never read as a pass. It never prints a credential.
 *
 *   npm run ai:smoke              # writes reports/ai-live-smoke-<date>.json when it runs
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { actualMicros } from '../server/ai/budget.ts';
import { loadAiConfig } from '../server/ai/config.ts';
import type { ModelResult } from '../server/ai/provider.ts';
import { SdkProvider, gatewayModels } from '../server/ai/sdk-provider.ts';
import { InterpretV1Output, interpretV1Instructions, interpretV1Prompt, normalizeV1, toLlmReply } from '../server/ai/tasks/interpret-v1.ts';
import { NpcOutput, NpcRequest, npcInstructions, npcPrompt, validateDecisions } from '../server/ai/tasks/npc.ts';
import { NL_VERSION } from '../src/engine/nl/ontology.ts';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const cfg = loadAiConfig({ ...process.env, BE_AI_ENABLED: '1' });
if (cfg.credential === 'none' || (cfg.credential === 'oidc' && !process.env.VERCEL_OIDC_TOKEN)) {
  console.log('LIVE: UNVERIFIED. No gateway credential in this environment (AI_GATEWAY_API_KEY in .env.local, or VERCEL_OIDC_TOKEN from `vercel env pull`).');
  console.log('Nothing was called. See docs/AI_SETUP.md, "LIVE smoke test".');
  process.exit(2);
}

const provider = new SdkProvider({ model: gatewayModels(cfg.apiKey) });
const rows: Record<string, unknown>[] = [];

function record<T>(name: string, tier: string, r: ModelResult<T>, verdict: string): void {
  const row = { name, tier, ok: r.ok, failure: r.ok ? null : r.kind, model: r.modelId, latencyMs: r.latencyMs, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, cachedInputTokens: r.usage.cachedInputTokens, costUsd: actualMicros(r.modelId, r.usage, r.ok ? r.reportedCostUsd : null) / 1_000_000, costSource: r.ok && r.reportedCostUsd !== null ? 'gateway' : 'catalog price x tokens', verdict };
  rows.push(row);
  console.log(JSON.stringify(row));
}

const interpret = async (name: string, text: string, expectUnderstood: boolean) => {
  const n = normalizeV1({ v: 1, text, ontology: NL_VERSION, context: { features: ['flood', 'fire'], regions: ['east', 'west'] } });
  const r = await provider.call({ task: 'interpret', tier: 'fast', modelId: cfg.models.fast, instructions: interpretV1Instructions(), prompt: interpretV1Prompt(n), schema: InterpretV1Output, schemaName: 'belief_reading', schemaDescription: 'Readings of one player belief in the village vocabulary', maxOutputTokens: cfg.limits.maxOutputTokens.interpret, timeoutMs: 20_000, temperature: 0 });
  const reply = r.ok ? toLlmReply(r.value) : null;
  const verdict = !r.ok ? 'provider failure' : !reply ? 'output failed the game validator' : reply.understood === expectUnderstood ? `as expected (understood=${reply.understood}${reply.understood ? `: ${reply.candidates.map((c) => `${c.subject}.${c.effect}.${c.trigger}`).join(', ')}` : ''})` : `UNEXPECTED (understood=${reply.understood})`;
  record(name, 'fast', r, verdict);
};

await interpret('supported belief', 'The river turns aside from lit lanterns.', true);
await interpret('unsupported belief', 'Reverse time and resurrect all dead villagers.', false);

const npcReq = NpcRequest.parse({
  v: 1,
  run: { id: 'smoke', rev: 1 },
  event: { id: 'e1', kind: 'novel_claim', day: 2, summary: 'The Keeper tells the village that the river fears lit lanterns.', claimId: 'river_fears_fire' },
  agents: [
    { id: 'ivo', name: 'Ivo Thatcher', role: 'thatcher', faction: 'hearth', traits: { skepticism: 25, openness: 70, stubbornness: 30, courage: 60, altruism: 70, ambition: 20 }, goals: ['protect_family'], beliefs: [{ claimId: 'river_fears_fire', conviction: 40, evidence: 10, heardFrom: null }], memories: [{ id: 'ivo-1', day: 1, kind: 'heard', text: 'The Keeper said the river fears fire.', witnessed: false, source: 'keeper', salience: 2 }], relations: [{ id: 'mara', trust: 60 }], eligible: [{ intent: 'spread', targets: ['mara'] }, { intent: 'ask', targets: ['mara'] }, { intent: 'wait', targets: [] }] },
    { id: 'bren', name: 'Bren Cole', role: 'miller', faction: 'council', traits: { skepticism: 85, openness: 30, stubbornness: 70, courage: 50, altruism: 40, ambition: 60 }, goals: ['guard_standing'], beliefs: [{ claimId: 'river_fears_fire', conviction: -20, evidence: 0, heardFrom: 'ivo' }], memories: [{ id: 'bren-1', day: 1, kind: 'saw', text: 'Saw the flood take the mill wheel last spring despite the fires.', witnessed: true, source: null, salience: 3 }], relations: [{ id: 'ivo', trust: 10 }], eligible: [{ intent: 'challenge', targets: ['ivo'] }, { intent: 'investigate', targets: [] }, { intent: 'wait', targets: [] }] },
  ],
  known: { villagers: [{ id: 'ivo', name: 'Ivo Thatcher' }, { id: 'bren', name: 'Bren Cole' }, { id: 'mara', name: 'Mara' }], claims: [{ id: 'river_fears_fire', short: 'The river fears fire' }] },
  playerMessage: null,
});
const npc = await provider.call({ task: 'npc', tier: 'fast', modelId: cfg.models.fast, instructions: npcInstructions(), prompt: npcPrompt(npcReq), schema: NpcOutput, schemaName: 'villager_decisions', schemaDescription: 'One decision per listed villager', maxOutputTokens: cfg.limits.maxOutputTokens.npc, timeoutMs: 20_000, temperature: 0.7 });
const checked = npc.ok ? validateDecisions(npcReq, npc.value) : null;
record('villager decision (2 agents)', 'fast', npc, !checked ? 'provider failure' : `${checked.accepted.length} accepted, ${checked.rejected.length} rejected: ${checked.accepted.map((d) => `${d.citizenId}=${d.intent}`).join(', ')}`);

mkdirSync('reports', { recursive: true });
const file = `reports/ai-live-smoke-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(file, JSON.stringify({ kind: 'LIVE', when: new Date().toISOString(), gateway: 'Vercel AI Gateway', credential: cfg.credential, rows }, null, 2));
console.log(`LIVE smoke written to ${file}`);
