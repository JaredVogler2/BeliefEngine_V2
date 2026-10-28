import { NL_VERSION, REALITY_LANG, candidatesFromReply, parseLlmReply } from '../engine/index.ts';
import type { RunState } from '../engine/index.ts';
import { hashValue } from '../engine/core/hash.ts';
import type { Candidate } from '../engine/nl/parse.ts';
import type { Reading } from '../engine/reality/read.ts';
import { fromWire, type WireReading } from '../engine/reality/wire.ts';
import { buildNpcRequest, buildTalkRequest } from '../engine/mind/request.ts';
import type { NpcChoiceInput } from '../engine/core/types.ts';

/**
 * The browser side of online interpretation. It talks only to this site's own `/api/*` functions (same origin: the page's
 * Content-Security-Policy allows nothing else), never to a model provider, and it holds no credential: only a short-lived
 * session token, in memory, that the server issued after the player consented.
 *
 * It makes NO request until the player turns online reading on and accepts the notice: Classic play, and every run where the
 * player does not opt in, never touches the network. Every answer is validated again here; any failure means "use the offline
 * reader", with a sentence the player can understand.
 */

export interface AiStatus {
  available: boolean;
  reason: string | null;
  /** 'mock' means the local simulator's scripted stand-in: the interface must say so and never call it a model */
  provider: 'vercel-ai-gateway' | 'mock' | null;
  models: { fast: string; accurate: string } | null;
  privacy: string;
  limits: { claimMaxChars: number; interpretCooldownMs: number };
}

export type AiFailure = { ok: false; reason: string; why: string; retryAfterSec?: number };

export interface ReadingMeta {
  id: string;
  cached: boolean;
  provider: string;
  model: string;
  tier: string;
  promptVersion: string;
  latencyMs: number;
}

export type OnlineResult = { ok: true; readings: Candidate[]; meta: ReadingMeta } | AiFailure;
/** Decisions for today's thinkers, already held to the request by the server; the engine holds them to the live run again. */
export type NpcResult = { ok: true; rev: number; decisions: NpcChoiceInput[]; rejected: { citizenId: string; why: string }[]; meta: ReadingMeta } | AiFailure;
export type RealityResult = { ok: true; reading: Reading; meta: ReadingMeta } | AiFailure;

const REASON_TEXT: Record<string, string> = {
  disabled: 'Online reading is switched off on this server.',
  not_configured: 'Online reading is not set up on this server.',
  over_budget: 'The online budget for today is spent.',
  over_quota: 'The online allowance for today is used up.',
  quota_unavailable: 'Online reading is paused: its usage limits cannot be checked right now.',
  rate_limited: 'Please wait a moment before asking again.',
  busy: 'One online request at a time.',
  unauthorized: 'The online session ended.',
  timeout: 'The online reader took too long.',
  provider_unavailable: 'The online reader could not be reached.',
  bad_output: 'The online reader gave an answer the game cannot use.',
  refused: 'The online reader declined this sentence.',
  network: 'The server could not be reached.',
  cancelled: 'You stopped the online reading.',
};

export function explain(reason: string, message?: unknown): string {
  return REASON_TEXT[reason] ?? (typeof message === 'string' && message.length < 200 ? message : 'The online reader could not help.');
}

/** A stable, non-identifying run id for the server's records: a hash of the run's public setup, never the save. */
export function runRef(s: RunState): { id: string; rev: number } {
  return { id: hashValue([s.scenarioId, s.seed, s.mode, s.difficulty]), rev: s.nextEventId };
}

export class AiClient {
  private token: string | null = null;
  private expiresAt = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly base: string;
  private readonly now: () => number;

  constructor(opts: { fetch?: typeof fetch; base?: string; now?: () => number } = {}) {
    this.fetchImpl = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    this.base = opts.base ?? '';
    this.now = opts.now ?? (() => Date.now());
  }

  /** `cancel` is the player stopping the request (a Stop button): it ends as 'cancelled', never as a timeout or a network failure. */
  private async request(path: string, init: RequestInit, timeoutMs: number, cancel?: AbortSignal): Promise<{ status: number; body: Record<string, unknown> | null } | AiFailure> {
    // stopped before it was sent: nothing is sent
    if (cancel?.aborted) return { ok: false, reason: 'cancelled', why: explain('cancelled') };
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const stop = () => ac.abort();
    cancel?.addEventListener('abort', stop, { once: true });
    try {
      const res = await this.fetchImpl(`${this.base}${path}`, { ...init, signal: ac.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (cancel?.aborted) return { ok: false, reason: 'cancelled', why: explain('cancelled') };
      return { status: res.status, body: body && typeof body === 'object' && !Array.isArray(body) ? body : null };
    } catch (e) {
      if (cancel?.aborted) return { ok: false, reason: 'cancelled', why: explain('cancelled') };
      const timeout = (e as { name?: string })?.name === 'AbortError';
      return { ok: false, reason: timeout ? 'timeout' : 'network', why: explain(timeout ? 'timeout' : 'network') };
    } finally {
      clearTimeout(timer);
      cancel?.removeEventListener('abort', stop);
    }
  }

  private failure(body: Record<string, unknown> | null): AiFailure {
    const reason = typeof body?.reason === 'string' ? body.reason : 'provider_unavailable';
    const retry = typeof body?.retryAfterSec === 'number' ? body.retryAfterSec : undefined;
    return { ok: false, reason, why: explain(reason, body?.message), ...(retry !== undefined ? { retryAfterSec: retry } : {}) };
  }

  /** GET /api/ai-status. Only called after the player asks to turn online reading on. */
  async status(): Promise<AiStatus | AiFailure> {
    const r = await this.request('/api/ai-status', { method: 'GET' }, 6_000);
    if ('ok' in r && r.ok === false) return r;
    const { body } = r as { body: Record<string, unknown> | null };
    if (!body || body.ok !== true || typeof body.available !== 'boolean') return { ok: false, reason: 'network', why: 'This site has no online reader.' };
    const provider = body.provider === 'mock' || body.provider === 'vercel-ai-gateway' ? body.provider : null;
    const models = body.models && typeof body.models === 'object' ? (body.models as { fast?: unknown; accurate?: unknown }) : null;
    const limits = (body.limits ?? {}) as Record<string, unknown>;
    return {
      available: body.available,
      reason: typeof body.reason === 'string' ? body.reason : null,
      provider,
      models: models && typeof models.fast === 'string' && typeof models.accurate === 'string' ? { fast: models.fast, accurate: models.accurate } : null,
      privacy: typeof body.privacy === 'string' ? body.privacy.slice(0, 800) : '',
      limits: { claimMaxChars: Number(limits.claimMaxChars) || 240, interpretCooldownMs: Number(limits.interpretCooldownMs) || 3000 },
    };
  }

  hasSession(): boolean {
    return !!this.token && this.now() < this.expiresAt - 30_000;
  }

  /** POST /api/session with the player's consent. The token lives in this object only (never localStorage). */
  async openSession(): Promise<{ ok: true } | AiFailure> {
    const r = await this.request('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ consent: true }) }, 8_000);
    if ('ok' in r && r.ok === false) return r;
    const { status, body } = r as { status: number; body: Record<string, unknown> | null };
    if (status !== 200 || !body || body.ok !== true || typeof body.token !== 'string' || typeof body.expiresAt !== 'number') return this.failure(body);
    this.token = body.token;
    this.expiresAt = body.expiresAt;
    return { ok: true };
  }

  forget(): void {
    this.token = null;
    this.expiresAt = 0;
  }

  /** One sentence in the V1 vocabulary. What leaves the device: the sentence, the vocabulary version, the names of the village's features and regions, and a hashed run reference. */
  async interpretV1(state: RunState, text: string, timeoutMs = 20_000): Promise<OnlineResult> {
    if (!this.hasSession()) {
      const s = await this.openSession();
      if (!s.ok) return s;
    }
    const features = Object.entries(state.scn.features).filter(([, v]) => v).map(([k]) => k).slice(0, 16);
    const regions = state.world.regions.map((r) => r.id).slice(0, 12);
    const payload = { v: 1, text: text.slice(0, 240), ontology: NL_VERSION, context: { features, regions }, run: runRef(state) };
    const r = await this.request('/api/interpret-belief', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` }, body: JSON.stringify(payload) }, timeoutMs);
    if ('ok' in r && r.ok === false) return r;
    const { status, body } = r as { status: number; body: Record<string, unknown> | null };
    if (status === 401) this.forget();
    if (status !== 200 || !body || body.ok !== true) return this.failure(body);
    const checked = parseLlmReply(body.reply);
    if (!checked.ok) return { ok: false, reason: 'bad_output', why: explain('bad_output') };
    if (!checked.reply.understood) return { ok: false, reason: 'not_understood', why: 'The online reader found no belief it could map onto this village.' };
    const readings = candidatesFromReply(checked.reply);
    if (!readings.length) return { ok: false, reason: 'not_understood', why: 'The online reader suggested things this village cannot model.' };
    const model = (body.model ?? {}) as { id?: unknown; tier?: unknown };
    const usage = (body.usage ?? {}) as { latencyMs?: unknown };
    return {
      ok: true,
      readings,
      meta: {
        id: String(body.id ?? '').slice(0, 40),
        cached: body.cached === true,
        provider: String(body.provider ?? '').slice(0, 20),
        model: String(model.id ?? '').slice(0, 80),
        tier: String(model.tier ?? '').slice(0, 12),
        promptVersion: String(body.promptVersion ?? '').slice(0, 60),
        latencyMs: Number(usage.latencyMs) || 0,
      },
    };
  }

  /**
   * One sentence in the reality language (Generative Reality runs). What leaves the device: the sentence, which village (scenario id
   * and seed: the server rebuilds the village itself), the region the player picked if any, the day and a hashed run reference.
   * The answer is validated and every reading rebuilt against this live run before the player can confirm one.
   */
  /** Villager decisions for today's thinkers (Generative Reality runs only): only what each of them knows is sent. */
  async npcDecisions(state: RunState, opts: NpcAsk = {}): Promise<NpcResult> {
    const req = buildNpcRequest(state, runRef(state).id, null, opts.only ?? null);
    if (!req) return { ok: false, reason: 'bad_request', why: 'Nobody in the village is due to think right now.' };
    return this.postNpc(req, opts.timeoutMs ?? 25_000);
  }

  /**
   * A villager's spoken answer in a conversation, voiced by a model from their own memories. Only the line and the memories it
   * cites are used; the engine checks both again and decides what the conversation changes.
   */
  async talkReply(state: RunState, vid: string, mode: string, claim: string | null, typed: string | null = null, timeoutMs = 25_000): Promise<{ ok: true; line: string; cites: string[]; meta: ReadingMeta } | AiFailure> {
    const req = buildTalkRequest(state, runRef(state).id, vid, mode, claim, typed);
    if (!req) return { ok: false, reason: 'bad_request', why: 'That villager cannot talk now.' };
    const r = await this.postNpc(req, timeoutMs);
    if (!r.ok) return r;
    const d = r.decisions.find((x) => x.citizenId === vid);
    if (!d || !d.dialogue) return { ok: false, reason: 'bad_output', why: explain('bad_output') };
    return { ok: true, line: d.dialogue, cites: d.cites, meta: r.meta };
  }

  /** Sends one `npc` request and reads the answer; nothing here trusts it beyond its shape. */
  async postNpc(req: object & { run: { rev: number } }, timeoutMs: number): Promise<NpcResult> {
    if (!this.hasSession()) {
      const s = await this.openSession();
      if (!s.ok) return s;
    }
    const r = await this.request('/api/npc-decision', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` }, body: JSON.stringify(req) }, timeoutMs);
    if ('ok' in r && r.ok === false) return r;
    const { status, body } = r as { status: number; body: Record<string, unknown> | null };
    if (status === 401) this.forget();
    if (status !== 200 || !body || body.ok !== true) return this.failure(body);
    const decisions = (Array.isArray(body.decisions) ? body.decisions : []).map((d) => choiceInput(d as Record<string, unknown>)).filter((d): d is NpcChoiceInput => !!d).slice(0, 6);
    const rejected = (Array.isArray(body.rejected) ? body.rejected : [])
      .map((x) => x as { citizenId?: unknown; why?: unknown })
      .map((x) => ({ citizenId: String(x.citizenId ?? '').slice(0, 40), why: String(x.why ?? '').slice(0, 160) }))
      .slice(0, 6);
    const model = (body.model ?? {}) as { id?: unknown; tier?: unknown };
    const usage = (body.usage ?? {}) as { latencyMs?: unknown };
    return {
      ok: true,
      rev: req.run.rev,
      decisions,
      rejected,
      meta: { id: String(body.id ?? '').slice(0, 40), cached: false, provider: String(body.provider ?? '').slice(0, 20), model: String(model.id ?? '').slice(0, 80), tier: String(model.tier ?? '').slice(0, 12), promptVersion: String(body.promptVersion ?? '').slice(0, 60), latencyMs: Number(usage.latencyMs) || 0 },
    };
  }

  async interpretReality(state: RunState, text: string, opts: { region?: string | null; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<RealityResult> {
    if (!state.v2) return { ok: false, reason: 'bad_request', why: 'Written reality beliefs belong to Generative Reality runs.' };
    if (!this.hasSession()) {
      const s = await this.openSession();
      if (!s.ok) return s;
    }
    const payload = { v: 2, text: text.slice(0, 240), lang: REALITY_LANG, scenario: { id: state.scenarioId, seed: state.seed, lab: !!state.v2.lab }, region: opts.region ?? null, day: state.day, run: runRef(state) };
    const r = await this.request('/api/interpret-reality', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` }, body: JSON.stringify(payload) }, opts.timeoutMs ?? 25_000, opts.signal);
    if ('ok' in r && r.ok === false) return r;
    const { status, body } = r as { status: number; body: Record<string, unknown> | null };
    if (status === 401) this.forget();
    if (status !== 200 || !body || body.ok !== true) return this.failure(body);
    const w = body.reading as WireReading | undefined;
    if (!w || typeof w !== 'object' || !['supported', 'partial', 'ambiguous', 'unsupported'].includes((w as { kind?: string }).kind ?? '')) return { ok: false, reason: 'bad_output', why: explain('bad_output') };
    let reading: Reading;
    try {
      reading = fromWire(state, w);
    } catch {
      return { ok: false, reason: 'bad_output', why: explain('bad_output') };
    }
    const model = (body.model ?? {}) as { id?: unknown; tier?: unknown };
    const usage = (body.usage ?? {}) as { latencyMs?: unknown };
    return {
      ok: true,
      reading,
      meta: {
        id: String(body.id ?? '').slice(0, 40),
        cached: body.cached === true,
        provider: String(body.provider ?? '').slice(0, 20),
        model: String(model.id ?? '').slice(0, 80),
        tier: String(model.tier ?? '').slice(0, 12),
        promptVersion: String(body.promptVersion ?? '').slice(0, 60),
        latencyMs: Number(usage.latencyMs) || 0,
      },
    };
  }
}

/** One decision as the server sent it, reduced to exactly the fields the engine reads (anything else is dropped). */
function choiceInput(d: Record<string, unknown>): NpcChoiceInput | null {
  if (!d || typeof d !== 'object' || typeof d.citizenId !== 'string' || typeof d.intent !== 'string') return null;
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : null);
  return {
    citizenId: d.citizenId.slice(0, 40),
    intent: d.intent.slice(0, 20),
    target: str(d.target, 40),
    claimId: str(d.claimId, 40),
    dialogue: str(d.dialogue, 200),
    cites: Array.isArray(d.cites) ? d.cites.filter((c): c is string => typeof c === 'string').slice(0, 3).map((c) => c.slice(0, 40)) : [],
    tone: str(d.tone, 20) ?? 'calm',
    approach: str(d.approach, 20) ?? 'testimony',
    confidence: Number.isFinite(Number(d.confidence)) ? Number(d.confidence) : 0,
    thought: str(d.thought, 240) ?? '',
  };
}

export interface NpcAsk {
  /** ask about these villagers only (they must be due to think today) */
  only?: string[] | null;
  timeoutMs?: number;
}

/** The page's one client. Constructed eagerly, but it does nothing until asked. */
export const aiClient = new AiClient();
