import { NL_VERSION, candidatesFromReply, parseLlmReply } from '../engine/index.ts';
import type { RunState } from '../engine/index.ts';
import { hashValue } from '../engine/core/hash.ts';
import type { Candidate } from '../engine/nl/parse.ts';

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

  private async request(path: string, init: RequestInit, timeoutMs: number): Promise<{ status: number; body: Record<string, unknown> | null } | AiFailure> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.base}${path}`, { ...init, signal: ac.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      return { status: res.status, body: body && typeof body === 'object' && !Array.isArray(body) ? body : null };
    } catch (e) {
      const timeout = (e as { name?: string })?.name === 'AbortError';
      return { ok: false, reason: timeout ? 'timeout' : 'network', why: explain(timeout ? 'timeout' : 'network') };
    } finally {
      clearTimeout(timer);
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
}

/** The page's one client. Constructed eagerly, but it does nothing until asked. */
export const aiClient = new AiClient();
