import { z } from 'zod';
import { NL_VERSION } from '../../src/engine/nl/ontology.ts';
import { actualMicros, estimateTokens, reserveMicros } from './budget.ts';
import { readiness, type AiConfig, type Tier } from './config.ts';
import { dayKey, hmacHex, msToNextDay, randomId, safeEqual, sha256Hex } from './crypto.ts';
import { clientAddress, fail, json, originState, readJson } from './http.ts';
import { Meter, summarize, type Outcome } from './meter.ts';
import type { InferenceProvider, ModelCall, ModelResult } from './provider.ts';
import { bearer, issueToken, verifyToken, type Scope, type SessionClaims } from './session.ts';
import { StoreUnavailableError, type CounterSpec, type QuotaStore } from './store.ts';
import * as iv1 from './tasks/interpret-v1.ts';
import * as iv2 from './tasks/interpret-v2.ts';
import * as npc from './tasks/npc.ts';
import type { LlmReply } from '../../src/engine/nl/llm.ts';
import { sanitizeText } from '../../src/engine/nl/parse.ts';
import { REALITY_LANG } from '../../src/engine/reality/ontology.ts';
import type { WireReading } from '../../src/engine/reality/wire.ts';

/**
 * The inference service as one transport-free function: `(route, Request) → Response`. Vercel Functions in `api/`, the local
 * simulator and the tests all call this, so what is tested is what is deployed.
 *
 * Order of checks for a paid route, cheapest first, so a flood costs nothing:
 *   method → configured → origin → session token → body size and schema → cooldown → cache → one-at-a-time lease →
 *   atomic reservation (session, address, project calls, session tokens, project spend) → provider call with timeout →
 *   settle the reservation to the real cost → validate the answer against the game's own rules → respond.
 * Any failure of the shared store before the provider call refuses the request (fail closed).
 */

export type Route = 'ai-status' | 'session' | 'interpret-belief' | 'interpret-reality' | 'npc-decision' | 'ai-metrics';
export const ROUTES: Route[] = ['ai-status', 'session', 'interpret-belief', 'interpret-reality', 'npc-decision', 'ai-metrics'];

export interface AppDeps {
  config: AiConfig;
  store: QuotaStore | null;
  provider: InferenceProvider | null;
  now?: () => number;
  log?: (line: string) => void;
}

export type AiApp = (route: Route, req: Request) => Promise<Response>;

export const PRIVACY_NOTE =
  'Online interpretation sends the sentence you write and a short list of the village\'s places and features (villager decisions send the named villagers\' public facts and memories) to a language model through the Vercel AI Gateway. The game\'s operator pays for these calls. Nothing is stored that names you: the server keeps hashed counters and, for 7 days, validated readings of sentences so repeats cost nothing. The offline reader always works without any of this.';

/** The privacy note with the routing this server asks of the gateway (see gatewayRouting in sdk-provider.ts). */
export function privacyNote(zeroRetention: boolean): string {
  return `${PRIVACY_NOTE} Calls go only to model providers that do not train on what they are sent${zeroRetention ? ' and that keep nothing once they answer (zero data retention)' : '; whether a provider keeps a copy for a while is its own policy, as this server has not asked for zero data retention'}.`;
}

const SessionRequest = z.strictObject({ consent: z.literal(true), scopes: z.array(z.enum(['interpret', 'npc'])).min(1).max(2).optional() });

export function createAiApp(deps: AppDeps): AiApp {
  const cfg = deps.config;
  const L = cfg.limits;
  const now = deps.now ?? (() => Date.now());
  const log = deps.log ?? ((line: string) => console.info(line));
  const meter = new Meter(deps.store, log, now);

  const state = (): { ok: true; store: QuotaStore; provider: InferenceProvider; secret: string } | { ok: false; response: Response } => {
    const r = readiness(cfg);
    if (!r.ready) return { ok: false, response: fail(503, r.reason, r.reason === 'disabled' ? 'Online interpretation is switched off on this server. The offline reader works as always.' : 'Online interpretation is not set up on this server. The offline reader works as always.') };
    if (!deps.store || !deps.provider || !cfg.sessionSecret) return { ok: false, response: fail(503, 'not_configured', 'Online interpretation is not set up on this server. The offline reader works as always.') };
    return { ok: true, store: deps.store, provider: deps.provider, secret: cfg.sessionSecret };
  };
  const storeDown = () => fail(503, 'quota_unavailable', 'Online interpretation is paused because its usage limits cannot be checked right now. The offline reader works as always.', 30);
  const ipHash = (secret: string, req: Request) => hmacHex(secret, `ip|${clientAddress(req)}`).slice(0, 24);
  const day = () => dayKey(now());
  const ttlDay = () => msToNextDay(now());

  const publicLimits = () => ({ claimMaxChars: L.claimMaxChars, interpretCooldownMs: L.interpretCooldownMs, npcCooldownMs: L.npcCooldownMs, npcAgentsPerCall: L.npcAgentsPerCall, interpretPerSessionDay: L.interpretPerSessionDay, sessionTtlMs: L.sessionTtlMs });

  /** method, configuration, origin (a browser from another site is refused), and the session token for this scope */
  async function preflight(req: Request, scope: Scope): Promise<{ ok: true; claims: SessionClaims; store: QuotaStore; provider: InferenceProvider; secret: string } | { ok: false; response: Response }> {
    if (req.method !== 'POST') return { ok: false, response: fail(405, 'method_not_allowed', 'POST only.') };
    const s = state();
    if (!s.ok) return s;
    if (originState(req, cfg.origins) === 'denied') return { ok: false, response: fail(403, 'forbidden', 'This site may not use the interpreter.') };
    const t = verifyToken(s.secret, bearer(req.headers.get('authorization')), now(), scope);
    if (!t.ok) return { ok: false, response: fail(401, 'unauthorized', t.why === 'expired' ? 'The online session expired. Open a new one.' : 'An online session is required.') };
    return { ok: true, claims: t.claims, store: s.store, provider: s.provider, secret: s.secret };
  }

  /** Runs one provider call inside the cooldown, lease and reservation; settles the reservation to the real cost. */
  async function guarded<T>(opts: {
    route: 'interpret' | 'npc';
    store: QuotaStore;
    provider: InferenceProvider;
    sid: string;
    counters: CounterSpec[];
    reasons: { reason: 'over_quota' | 'over_budget'; message: string }[];
    call: ModelCall<T>;
    cooldownMs: number;
    agents?: number;
  }): Promise<{ ok: true; result: ModelResult<T>; costMicros: number } | { ok: false; response: Response }> {
    const { store, sid } = opts;
    const leaseKey = `l:${opts.route}:${sid}`;
    const lease = randomId(9);
    let leased = false;
    try {
      if (!(await store.claim(`cd:${opts.route}:${sid}`, '1', opts.cooldownMs))) return { ok: false, response: fail(429, 'rate_limited', 'One moment: online requests are spaced out a little.', Math.max(1, Math.ceil(opts.cooldownMs / 1000))) };
      if (!(await store.claim(leaseKey, lease, L.leaseMs))) return { ok: false, response: fail(409, 'busy', 'One online request at a time per session.', 2) };
      leased = true;
      const r = await store.reserve(opts.counters);
      if (!r.ok) {
        const why = opts.reasons[r.index] ?? opts.reasons[0];
        await store.unclaim(leaseKey, lease).catch(() => undefined);
        leased = false;
        await meter.refused(opts.route, why.reason);
        return { ok: false, response: fail(429, why.reason, why.message, Math.ceil(ttlDay() / 1000)) };
      }
    } catch (e) {
      if (leased) await store.unclaim(leaseKey, lease).catch(() => undefined);
      if (e instanceof StoreUnavailableError) return { ok: false, response: storeDown() };
      throw e;
    }
    const tokKey = opts.counters.find((c) => c.key.startsWith('q:tok:'));
    const usdKey = opts.counters.find((c) => c.key.startsWith('q:usd:'));
    let result: ModelResult<T>;
    try {
      result = await opts.provider.call(opts.call);
    } finally {
      await store.unclaim(leaseKey, lease).catch(() => undefined);
    }
    // settle: give back what was reserved and not used; record any overrun so the cap stays true
    const usedTok = result.usage.inputTokens + result.usage.outputTokens;
    const costMicros = actualMicros(result.modelId, result.usage, result.ok ? result.reportedCostUsd : null);
    const refunds: { key: string; amount: number }[] = [];
    const overruns: CounterSpec[] = [];
    for (const [spec, used] of [
      [tokKey, usedTok],
      [usdKey, costMicros],
    ] as const) {
      if (!spec) continue;
      if (used <= spec.amount) refunds.push({ key: spec.key, amount: spec.amount - used });
      else overruns.push({ ...spec, amount: used - spec.amount, limit: Number.MAX_SAFE_INTEGER });
    }
    await store.refund(refunds).catch(() => log(JSON.stringify({ evt: 'be.ai.settle_failed', route: opts.route })));
    if (overruns.length) await store.reserve(overruns).catch(() => log(JSON.stringify({ evt: 'be.ai.settle_failed', route: opts.route })));
    return { ok: true, result, costMicros };
  }

  function providerFailure(kind: string): Response {
    switch (kind) {
      case 'timeout':
        return fail(504, 'timeout', 'The interpreter took too long. Use the offline reader, or try again.');
      case 'refused':
        return fail(200, 'refused', 'The model declined this request. The offline reader still works.');
      case 'malformed':
        return fail(200, 'bad_output', 'The model gave an answer the game cannot use. Use the offline reader.');
      case 'budget':
        return fail(429, 'over_budget', 'The online budget for today is spent. The offline reader still works.', Math.ceil(ttlDay() / 1000));
      default:
        return fail(502, 'provider_unavailable', 'The interpreter could not be reached. Use the offline reader.');
    }
  }

  // ------------------------------------------------------------------------------------------ GET /api/ai-status
  async function status(req: Request): Promise<Response> {
    if (req.method !== 'GET') return fail(405, 'method_not_allowed', 'GET only.');
    const r = readiness(cfg);
    const configured = r.ready && !!deps.store && !!deps.provider && !!cfg.sessionSecret;
    let reason: string | null = configured ? null : r.ready ? 'not_configured' : r.reason;
    let budgetAvailable = false;
    if (configured) {
      try {
        budgetAvailable = Number((await deps.store!.get(`q:usd:${day()}`)) ?? '0') < cfg.dailyBudgetUsd * 1_000_000;
        if (!budgetAvailable) reason = 'over_budget';
      } catch {
        reason = 'quota_unavailable';
      }
    }
    return json(200, {
      ok: true,
      service: 'belief-engine-ai',
      api: 1,
      available: configured && budgetAvailable && reason === null,
      reason,
      provider: configured ? (deps.provider!.name === 'mock' ? 'mock' : 'vercel-ai-gateway') : null,
      models: configured ? { fast: cfg.models.fast, accurate: cfg.models.accurate } : null,
      contracts: { interpret: [1, 2], npc: [1, 2] },
      limits: publicLimits(),
      privacy: privacyNote(cfg.zeroRetention),
      routing: configured && deps.provider!.name !== 'mock' ? { noPromptTraining: true, zeroDataRetention: cfg.zeroRetention } : null,
    });
  }

  // ------------------------------------------------------------------------------------------ POST /api/session
  async function session(req: Request): Promise<Response> {
    if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'POST only.');
    const s = state();
    if (!s.ok) return s.response;
    // a session is only minted for this game's own pages; other callers must not obtain capability tokens from a browser
    if (originState(req, cfg.origins) !== 'allowed') return fail(403, 'forbidden', 'Online sessions can only be opened from the game itself.');
    const body = await readJson(req, 1024);
    if (!body.ok) return body.response;
    const parsed = SessionRequest.safeParse(body.value);
    if (!parsed.success) return fail(400, 'bad_request', 'Consent to online interpretation is required.');
    try {
      const hour = Math.floor(now() / 3600_000);
      const r = await s.store.reserve([{ key: `q:sess:ip:${ipHash(s.secret, req)}:${hour}`, amount: 1, limit: L.sessionsPerIpHour, ttlMs: 3600_000 + 60_000 }]);
      if (!r.ok) return fail(429, 'rate_limited', 'Too many online sessions from this network. Try again later; the offline reader works meanwhile.', 600);
    } catch (e) {
      if (e instanceof StoreUnavailableError) return storeDown();
      throw e;
    }
    const { token, claims } = issueToken(s.secret, now(), L.sessionTtlMs, parsed.data.scopes ?? ['interpret', 'npc']);
    return json(200, { ok: true, token, expiresAt: claims.exp * 1000, scopes: claims.scp, limits: publicLimits() });
  }

  /** Both interpret contracts draw on one allowance: per session, per network, project calls, session tokens and project spend. */
  function interpretCounters(sid: string, ip: string, modelId: string, promptChars: number, maxOut: number): { counters: CounterSpec[]; reasons: { reason: 'over_quota' | 'over_budget'; message: string }[] } {
    const d = day();
    const ttl = ttlDay();
    return {
      counters: [
        { key: `q:i:s:${sid}:${d}`, amount: 1, limit: L.interpretPerSessionDay, ttlMs: ttl },
        { key: `q:i:ip:${ip}:${d}`, amount: 1, limit: L.interpretPerIpDay, ttlMs: ttl },
        { key: `q:calls:${d}`, amount: 1, limit: L.callsPerDay, ttlMs: ttl },
        { key: `q:tok:s:${sid}:${d}`, amount: estimateTokens(promptChars) + maxOut, limit: L.tokensPerSessionDay, ttlMs: ttl },
        { key: `q:usd:${d}`, amount: reserveMicros(modelId, promptChars, maxOut), limit: Math.floor(cfg.dailyBudgetUsd * 1_000_000), ttlMs: ttl },
      ],
      reasons: [
        { reason: 'over_quota', message: 'This session has used its online readings for today. The offline reader still works.' },
        { reason: 'over_quota', message: 'This network has used its online readings for today. The offline reader still works.' },
        { reason: 'over_quota', message: 'The interpreter is at its daily capacity. The offline reader still works.' },
        { reason: 'over_quota', message: 'This session has used its online allowance for today. The offline reader still works.' },
        { reason: 'over_budget', message: 'The online budget for today is spent. The offline reader still works.' },
      ],
    };
  }

  // ------------------------------------------------------------------------------------------ POST /api/interpret-belief
  async function interpret(req: Request): Promise<Response> {
    const pre = await preflight(req, 'interpret');
    if (!pre.ok) return pre.response;
    const body = await readJson(req, L.bodyMaxBytes);
    if (!body.ok) return body.response;
    const parsed = iv1.InterpretV1Request.safeParse(body.value);
    if (!parsed.success) return fail(400, 'bad_request', `The request does not match the interpreter contract (${parsed.error.issues[0]?.path.join('.') || 'body'}).`);
    const n = iv1.normalizeV1(parsed.data);
    if (!n.text || n.text.length > L.claimMaxChars) return fail(400, 'bad_request', `Write 1 to ${L.claimMaxChars} characters.`);
    const tier: Tier = iv1.interpretTier(n.text);
    const modelId = cfg.models[tier];
    const sid = pre.claims.sid;
    const cacheKey = `c:i1:${sha256Hex(JSON.stringify({ p: iv1.INTERPRET_V1_PROMPT, o: NL_VERSION, m: modelId, t: n.text.toLowerCase(), c: n.context }))}`;
    const runPart = parsed.data.run ? `${parsed.data.run.id}|${parsed.data.run.rev}` : '-';
    const interpretationId = (reply: LlmReply) => hmacHex(pre.secret, `iid|${sid}|${runPart}|${cacheKey}|${JSON.stringify(reply)}`).slice(0, 24);
    const base = { ok: true as const, contract: 1, provider: pre.provider.name, model: { tier, id: modelId }, promptVersion: iv1.INTERPRET_V1_PROMPT };

    // a validated reading of the same sentence in the same village costs nothing (and is re-validated: a poisoned entry is dropped)
    try {
      if (!(await pre.store.claim(`cd:interpret-cache:${sid}`, '1', 250))) return fail(429, 'rate_limited', 'One moment.', 1);
      const hit = await pre.store.get(cacheKey);
      if (hit) {
        let reply: LlmReply | null = null;
        try {
          const j = JSON.parse(hit) as { reply?: unknown; model?: string };
          reply = j.model === modelId ? iv1.validReplyV1(j.reply) : null;
        } catch {
          reply = null;
        }
        if (reply) {
          await meter.record({ route: 'interpret', outcome: 'cache_hit', tier, modelId, provider: pre.provider.name });
          return json(200, { ...base, id: interpretationId(reply), cached: true, reply, usage: { inputTokens: 0, outputTokens: 0, latencyMs: 0, costUsd: 0 } });
        }
        await pre.store.del(cacheKey);
      }
    } catch (e) {
      if (e instanceof StoreUnavailableError) return storeDown();
      throw e;
    }

    const instructions = iv1.interpretV1Instructions();
    const prompt = iv1.interpretV1Prompt(n);
    const maxOut = L.maxOutputTokens.interpret;
    const q = interpretCounters(sid, ipHash(pre.secret, req), modelId, instructions.length + prompt.length, maxOut);
    const g = await guarded({
      route: 'interpret',
      store: pre.store,
      provider: pre.provider,
      sid,
      cooldownMs: L.interpretCooldownMs,
      counters: q.counters,
      reasons: q.reasons,
      call: { task: 'interpret', tier, modelId, instructions, prompt, schema: iv1.InterpretV1Output, schemaName: 'belief_reading', schemaDescription: 'Readings of one player belief in the village vocabulary', maxOutputTokens: maxOut, timeoutMs: L.timeoutMs[tier], temperature: 0, signal: req.signal },
    });
    if (!g.ok) return g.response;
    const res = g.result;
    const metered = { route: 'interpret' as const, tier, modelId: res.modelId, provider: pre.provider.name, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, cachedInputTokens: res.usage.cachedInputTokens, latencyMs: res.latencyMs, costMicros: g.costMicros };
    if (!res.ok) {
      await meter.record({ ...metered, outcome: res.kind });
      return providerFailure(res.kind);
    }
    const reply = iv1.toLlmReply(res.value);
    if (!reply) {
      await meter.record({ ...metered, outcome: 'invalid' });
      return providerFailure('malformed');
    }
    await pre.store.set(cacheKey, JSON.stringify({ reply, model: modelId }), L.cacheTtlMs).catch(() => undefined);
    await meter.record({ ...metered, outcome: 'ok' });
    return json(200, { ...base, model: { tier, id: res.modelId }, id: interpretationId(reply), cached: false, reply, usage: { inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, latencyMs: res.latencyMs, costUsd: g.costMicros / 1_000_000 } });
  }

  // ------------------------------------------------------------------------------------------ POST /api/interpret-reality
  async function interpretReality(req: Request): Promise<Response> {
    const pre = await preflight(req, 'interpret');
    if (!pre.ok) return pre.response;
    const body = await readJson(req, L.bodyMaxBytes);
    if (!body.ok) return body.response;
    const parsed = iv2.InterpretV2Request.safeParse(body.value);
    if (!parsed.success) return fail(400, 'bad_request', `The request does not match the reality interpreter contract (${parsed.error.issues[0]?.path.join('.') || 'body'}).`);
    const r = parsed.data;
    const text = sanitizeText(r.text);
    if (!text || text.length > L.claimMaxChars) return fail(400, 'bad_request', `Write 1 to ${L.claimMaxChars} characters.`);
    // the server builds the village itself: a request names it, never describes it
    const village = iv2.villageState(r);
    if (!village) return fail(400, 'bad_request', 'That village does not exist in this version of the game.');
    if (r.region && !village.world.regions.some((x) => x.id === r.region)) return fail(400, 'bad_request', 'That region does not exist in this village.');
    const tier: Tier = iv2.interpretV2Tier(text);
    const modelId = cfg.models[tier];
    const sid = pre.claims.sid;
    const cacheKey = `c:i2:${sha256Hex(JSON.stringify({ p: iv2.INTERPRET_V2_PROMPT, l: REALITY_LANG, m: modelId, t: text.toLowerCase(), s: r.scenario, g: r.region }))}`;
    const runPart = r.run ? `${r.run.id}|${r.run.rev}` : '-';
    const finish = (o: iv2.InterpretV2Output, actual: string): { reading: WireReading; id: string } | null => {
      const w = iv2.toWireV2(o, { text, state: village, day: r.day, modelId: actual, interpretationId: null });
      if (!w) return null;
      const iid = hmacHex(pre.secret, `iid2|${sid}|${runPart}|${cacheKey}|${JSON.stringify(w)}`).slice(0, 24);
      return { reading: iv2.stampId(w, iid), id: iid };
    };
    const base = { ok: true as const, contract: 2, provider: pre.provider.name, model: { tier, id: modelId }, promptVersion: iv2.INTERPRET_V2_PROMPT };

    // the model's validated answer to the same sentence in the same village is reused, and checked again on the way out
    try {
      if (!(await pre.store.claim(`cd:interpret-cache:${sid}`, '1', 250))) return fail(429, 'rate_limited', 'One moment.', 1);
      const hit = await pre.store.get(cacheKey);
      if (hit) {
        let done: ReturnType<typeof finish> = null;
        try {
          const j = JSON.parse(hit) as { output?: unknown; model?: string };
          const out = j.model === modelId ? iv2.InterpretV2Output.safeParse(j.output) : null;
          done = out?.success ? finish(out.data, modelId) : null;
        } catch {
          done = null;
        }
        if (done) {
          await meter.record({ route: 'interpret', outcome: 'cache_hit', tier, modelId, provider: pre.provider.name });
          return json(200, { ...base, id: done.id, cached: true, reading: done.reading, usage: { inputTokens: 0, outputTokens: 0, latencyMs: 0, costUsd: 0 } });
        }
        await pre.store.del(cacheKey);
      }
    } catch (e) {
      if (e instanceof StoreUnavailableError) return storeDown();
      throw e;
    }

    const instructions = iv2.interpretV2Instructions();
    const prompt = iv2.interpretV2Prompt(text, r, village);
    const maxOut = L.maxOutputTokens.interpretV2;
    const q = interpretCounters(sid, ipHash(pre.secret, req), modelId, instructions.length + prompt.length, maxOut);
    const g = await guarded({
      route: 'interpret',
      store: pre.store,
      provider: pre.provider,
      sid,
      cooldownMs: L.interpretCooldownMs,
      counters: q.counters,
      reasons: q.reasons,
      call: { task: 'interpret', tier, modelId, instructions, prompt, schema: iv2.InterpretV2Output, schemaName: 'reality_reading', schemaDescription: 'Readings of one player belief in the reality-1 rule language', maxOutputTokens: maxOut, timeoutMs: L.timeoutMs[tier], temperature: 0, signal: req.signal },
    });
    if (!g.ok) return g.response;
    const res = g.result;
    const metered = { route: 'interpret' as const, tier, modelId: res.modelId, provider: pre.provider.name, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, cachedInputTokens: res.usage.cachedInputTokens, latencyMs: res.latencyMs, costMicros: g.costMicros };
    if (!res.ok) {
      await meter.record({ ...metered, outcome: res.kind });
      return providerFailure(res.kind);
    }
    const done = finish(res.value, res.modelId);
    if (!done) {
      await meter.record({ ...metered, outcome: 'invalid' });
      return providerFailure('malformed');
    }
    await pre.store.set(cacheKey, JSON.stringify({ output: res.value, model: modelId }), L.cacheTtlMs).catch(() => undefined);
    await meter.record({ ...metered, outcome: 'ok' });
    return json(200, { ...base, model: { tier, id: res.modelId }, id: done.id, cached: false, reading: done.reading, usage: { inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, latencyMs: res.latencyMs, costUsd: g.costMicros / 1_000_000 } });
  }

  // ------------------------------------------------------------------------------------------ POST /api/npc-decision
  async function npcDecision(req: Request): Promise<Response> {
    const pre = await preflight(req, 'npc');
    if (!pre.ok) return pre.response;
    const body = await readJson(req, L.bodyMaxBytes);
    if (!body.ok) return body.response;
    const parsed = npc.NpcRequest.safeParse(body.value);
    if (!parsed.success) return fail(400, 'bad_request', `The request does not match the villager contract (${parsed.error.issues[0]?.path.join('.') || 'body'}).`);
    const r = parsed.data;
    if (r.agents.length > L.npcAgentsPerCall) return fail(400, 'bad_request', `At most ${L.npcAgentsPerCall} villagers per request.`);
    if (new Set(r.agents.map((a) => a.id)).size !== r.agents.length) return fail(400, 'bad_request', 'Each villager may appear once.');
    const tier: Tier = r.event.kind === 'conversation' ? 'accurate' : 'fast';
    const modelId = cfg.models[tier];
    const sid = pre.claims.sid;
    const instructions = npc.npcInstructions();
    const prompt = npc.npcPrompt(r);
    const maxOut = L.maxOutputTokens.npc;
    const estTok = estimateTokens(instructions.length + prompt.length) + maxOut;
    const d = day();
    const ttl = ttlDay();
    const ip = ipHash(pre.secret, req);
    const agents = r.agents.length;
    const g = await guarded({
      route: 'npc',
      store: pre.store,
      provider: pre.provider,
      sid,
      agents,
      cooldownMs: L.npcCooldownMs,
      counters: [
        { key: `q:n:s:${sid}:${d}`, amount: 1, limit: L.npcCallsPerSessionDay, ttlMs: ttl },
        { key: `q:na:s:${sid}:${d}`, amount: agents, limit: L.npcAgentsPerSessionDay, ttlMs: ttl },
        { key: `q:na:ip:${ip}:${d}`, amount: agents, limit: L.npcAgentsPerIpDay, ttlMs: ttl },
        { key: `q:calls:${d}`, amount: 1, limit: L.callsPerDay, ttlMs: ttl },
        { key: `q:tok:s:${sid}:${d}`, amount: estTok, limit: L.tokensPerSessionDay, ttlMs: ttl },
        { key: `q:usd:${d}`, amount: reserveMicros(modelId, instructions.length + prompt.length, maxOut), limit: Math.floor(cfg.dailyBudgetUsd * 1_000_000), ttlMs: ttl },
      ],
      reasons: [
        { reason: 'over_quota', message: 'This session has used its villager reasoning for today; villagers continue on their own rules.' },
        { reason: 'over_quota', message: 'This session has used its villager reasoning for today; villagers continue on their own rules.' },
        { reason: 'over_quota', message: 'This network has used its villager reasoning for today; villagers continue on their own rules.' },
        { reason: 'over_quota', message: 'The service is at its daily capacity; villagers continue on their own rules.' },
        { reason: 'over_quota', message: 'This session has used its online allowance for today; villagers continue on their own rules.' },
        { reason: 'over_budget', message: 'The online budget for today is spent; villagers continue on their own rules.' },
      ],
      call: { task: 'npc', tier, modelId, instructions, prompt, schema: npc.NpcOutput, schemaName: 'villager_decisions', schemaDescription: 'One decision per listed villager', maxOutputTokens: maxOut, timeoutMs: L.timeoutMs[tier], temperature: 0.7, signal: req.signal },
    });
    if (!g.ok) return g.response;
    const res = g.result;
    const metered = { route: 'npc' as const, tier, modelId: res.modelId, provider: pre.provider.name, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, cachedInputTokens: res.usage.cachedInputTokens, latencyMs: res.latencyMs, costMicros: g.costMicros, agents };
    if (!res.ok) {
      await meter.record({ ...metered, outcome: res.kind });
      return providerFailure(res.kind);
    }
    const { accepted, rejected } = npc.validateDecisions(r, res.value);
    await meter.record({ ...metered, outcome: accepted.length ? 'ok' : 'invalid' });
    const batchId = hmacHex(pre.secret, `npc|${sid}|${r.run.id}|${r.run.rev}|${r.event.id}|${JSON.stringify(accepted)}`).slice(0, 24);
    return json(200, { ok: true, contract: r.v, id: batchId, provider: pre.provider.name, model: { tier, id: res.modelId }, promptVersion: npc.NPC_PROMPT, run: r.run, eventId: r.event.id, decisions: accepted, rejected, usage: { inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, latencyMs: res.latencyMs, costUsd: g.costMicros / 1_000_000 } });
  }

  // ------------------------------------------------------------------------------------------ GET /api/ai-metrics (operator only)
  async function metrics(req: Request): Promise<Response> {
    if (req.method !== 'GET') return fail(405, 'method_not_allowed', 'GET only.');
    const token = bearer(req.headers.get('authorization'));
    if (!cfg.adminToken) return fail(404, 'not_found', 'Not found.');
    if (!token || !safeEqual(token, cfg.adminToken)) return fail(401, 'unauthorized', 'Operator token required.');
    if (!deps.store) return json(200, { ok: true, configured: false, missing: cfg.missing });
    try {
      const d = day();
      const raw = await deps.store.hgetall(`m:${d}`);
      const spent = Number((await deps.store.get(`q:usd:${d}`)) ?? '0');
      const calls = Number((await deps.store.get(`q:calls:${d}`)) ?? '0');
      return json(200, {
        ok: true,
        configured: readiness(cfg).ready,
        missing: cfg.missing,
        credential: cfg.credential,
        store: deps.store.kind,
        provider: deps.provider?.name ?? null,
        models: cfg.models,
        budget: { dailyUsd: cfg.dailyBudgetUsd, reservedOrSpentUsd: spent / 1_000_000, callsToday: calls, callsPerDay: L.callsPerDay },
        today: summarize(d, raw),
      });
    } catch (e) {
      if (e instanceof StoreUnavailableError) return storeDown();
      throw e;
    }
  }

  return async (route, req) => {
    try {
      switch (route) {
        case 'ai-status':
          return await status(req);
        case 'session':
          return await session(req);
        case 'interpret-belief':
          return await interpret(req);
        case 'interpret-reality':
          return await interpretReality(req);
        case 'npc-decision':
          return await npcDecision(req);
        case 'ai-metrics':
          return await metrics(req);
        default:
          return fail(404, 'not_found', 'Not found.');
      }
    } catch {
      // never echo an exception: it could carry a header or a credential from a lower layer
      log(JSON.stringify({ evt: 'be.ai.error', route }));
      return fail(500, 'provider_unavailable', 'Something went wrong on the server. The offline reader works as always.');
    }
  };
}

/** For logs and tests: the Outcome type is shared with the meter */
export type { Outcome };
