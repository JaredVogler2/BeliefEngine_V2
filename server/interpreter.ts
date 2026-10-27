/**
 * The optional online interpreter, as a server-side proxy. It exists so that the provider's API key never reaches a browser and
 * so that every call is bounded. It is NOT deployed and has NOT been run against a live provider (no key was authorised for this
 * repository); it is tested with a mocked provider only (`tests/unit/nl-llm.test.ts`).
 *
 * What it does, in order, for one request: allow only same-origin POSTs of small JSON; accept only { text, ontology, context }
 * (never a save, never villagers); rate-limit and cap daily use; answer repeat sentences from a cache of *validated* replies;
 * otherwise ask the provider with a fixed instruction and the sentence as a JSON string, with a timeout; validate the reply
 * against a strict schema; and return either validated candidates or an explicit "use the offline composer" answer. A failure
 * of any kind (no key, outage, refusal, malformed output, schema drift, over quota) is an answer, never an error that ends a game.
 *
 * Nothing here logs the key, the claim text or the provider's output. The key is read from the environment of the function.
 */
import { createHash } from 'node:crypto';
import { LLM_SCHEMA, parseLlmReply, providerPrompt, type LlmReply } from '../src/engine/nl/llm.ts';
import { NL_VERSION } from '../src/engine/nl/ontology.ts';
import { sanitizeText } from '../src/engine/nl/parse.ts';

export interface InterpreterConfig {
  /** provider API key: from the function's environment only; absent means "not configured" */
  apiKey?: string;
  /** which provider model to ask: required, deliberately without a default */
  model?: string;
  endpoint: string;
  /** origins allowed to call (exact match); an empty list allows only same-origin requests that send no Origin header */
  allowedOrigins: string[];
  maxTextChars: number;
  maxBodyBytes: number;
  timeoutMs: number;
  /** requests per client per minute, and in total per UTC day */
  perMinute: number;
  perDay: number;
  cacheTtlMs: number;
  maxCacheEntries: number;
}

export const DEFAULT_CONFIG: Omit<InterpreterConfig, 'apiKey' | 'model'> = {
  endpoint: 'https://api.anthropic.com/v1/messages',
  allowedOrigins: [],
  maxTextChars: 160,
  maxBodyBytes: 2048,
  timeoutMs: 8000,
  perMinute: 8,
  perDay: 400,
  cacheTtlMs: 24 * 3600 * 1000,
  maxCacheEntries: 500,
};

export interface HandlerRequest {
  method: string;
  headers: Record<string, string | undefined>;
  /** the raw body text */
  body: string;
  /** an identifier for rate limiting: the caller's address as the platform reports it */
  client: string;
}

export interface HandlerResponse {
  status: number;
  body: { ok: true; cached: boolean; reply: LlmReply } | { ok: false; reason: 'not_configured' | 'bad_request' | 'forbidden' | 'rate_limited' | 'over_budget' | 'provider_unavailable' | 'bad_output' | 'timeout'; message: string; fallback: 'offline' };
}

export interface Deps {
  fetch: typeof fetch;
  now: () => number;
  config: InterpreterConfig;
}

interface State {
  perClient: Map<string, number[]>;
  day: { key: string; n: number };
  cache: Map<string, { at: number; reply: LlmReply }>;
}

/** In-memory limits and cache. On a serverless platform each instance has its own copy: real limits need a shared store (docs/NL_BELIEFS.md). */
export function newState(): State {
  return { perClient: new Map(), day: { key: '', n: 0 }, cache: new Map() };
}

const fail = (status: number, reason: Extract<HandlerResponse['body'], { ok: false }>['reason'], message: string): HandlerResponse => ({ status, body: { ok: false, reason, message, fallback: 'offline' } });

/** The shape a request must have, and nothing more: no save state, no villager data ever leaves the browser. */
function parseRequest(raw: string, cfg: InterpreterConfig): { text: string; context: { features: string[]; regions: string[] } } | string {
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return 'the body is not JSON';
  }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return 'the body must be an object';
  const o = j as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!['text', 'ontology', 'context'].includes(k)) return `unexpected field "${k.slice(0, 20)}"`;
  if (typeof o.text !== 'string' || !o.text.trim() || o.text.length > cfg.maxTextChars) return `text must be 1 to ${cfg.maxTextChars} characters`;
  if (o.ontology !== NL_VERSION) return 'ontology version mismatch';
  const c = o.context as Record<string, unknown> | undefined;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return 'context is required';
  for (const k of Object.keys(c)) if (!['features', 'regions'].includes(k)) return `unexpected context field "${k.slice(0, 20)}"`;
  const list = (x: unknown) => Array.isArray(x) && x.length <= 12 && x.every((v) => typeof v === 'string' && /^[a-z0-9_-]{1,24}$/.test(v));
  if (!list(c.features) || !list(c.regions)) return 'context must list short feature and region ids';
  return { text: sanitizeText(o.text), context: { features: (c.features as string[]).slice().sort(), regions: (c.regions as string[]).slice().sort() } };
}

export async function handleInterpret(req: HandlerRequest, deps: Deps, st: State): Promise<HandlerResponse> {
  const { config: cfg, now } = deps;
  if (req.method !== 'POST') return fail(405, 'bad_request', 'POST only');
  if (!cfg.apiKey || !cfg.model) return fail(503, 'not_configured', 'The online interpreter is not configured; the offline composer still works.');
  const origin = req.headers.origin;
  if (origin && !cfg.allowedOrigins.includes(origin)) return fail(403, 'forbidden', 'This origin may not use the interpreter.');
  if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) return fail(415, 'bad_request', 'Send application/json.');
  if (Buffer.byteLength(req.body, 'utf8') > cfg.maxBodyBytes) return fail(413, 'bad_request', 'The request is too large.');
  const parsed = parseRequest(req.body, cfg);
  if (typeof parsed === 'string') return fail(400, 'bad_request', parsed);

  // limits first, so a flood costs nothing
  const t = now();
  const recent = (st.perClient.get(req.client) ?? []).filter((x) => t - x < 60_000);
  if (recent.length >= cfg.perMinute) return fail(429, 'rate_limited', 'Too many requests. Use the offline composer, or wait a minute.');
  const dayKey = new Date(t).toISOString().slice(0, 10);
  if (st.day.key !== dayKey) st.day = { key: dayKey, n: 0 };

  const key = createHash('sha256').update(JSON.stringify({ v: NL_VERSION, s: LLM_SCHEMA, text: parsed.text.toLowerCase().replace(/\s+/g, ' '), ctx: parsed.context })).digest('hex');
  const hit = st.cache.get(key);
  if (hit && t - hit.at < cfg.cacheTtlMs) {
    recent.push(t);
    st.perClient.set(req.client, recent);
    return { status: 200, body: { ok: true, cached: true, reply: hit.reply } };
  }
  if (st.day.n >= cfg.perDay) return fail(429, 'over_budget', 'The interpreter has reached its daily limit. The offline composer still works.');
  recent.push(t);
  st.perClient.set(req.client, recent);
  st.day.n++;

  const { system } = providerPrompt();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), cfg.timeoutMs);
  let text: string;
  try {
    const res = await deps.fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 400,
        system,
        // the claim is data: a JSON string value, with the village's coarse context, never the save or its people
        messages: [{ role: 'user', content: JSON.stringify({ claim: parsed.text, village: parsed.context }) }],
      }),
      signal: ac.signal,
    });
    if (!res.ok) return fail(502, 'provider_unavailable', 'The interpreter could not be reached. Use the offline composer.');
    const j = (await res.json()) as { content?: { type?: string; text?: string }[] };
    text = (j.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  } catch (e) {
    return (e as { name?: string })?.name === 'AbortError' ? fail(504, 'timeout', 'The interpreter took too long. Use the offline composer.') : fail(502, 'provider_unavailable', 'The interpreter could not be reached. Use the offline composer.');
  } finally {
    clearTimeout(timer);
  }
  // models sometimes wrap JSON in prose or fences: take the outermost object, then hold it to the strict schema
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  let raw: unknown = null;
  if (start >= 0 && end > start) {
    try {
      raw = JSON.parse(text.slice(start, end + 1));
    } catch {
      raw = null;
    }
  }
  const checked = parseLlmReply(raw);
  if (!checked.ok) return fail(200, 'bad_output', 'The interpreter gave an answer the game cannot use. Use the offline composer.');
  if (st.cache.size >= cfg.maxCacheEntries) st.cache.delete(st.cache.keys().next().value as string);
  st.cache.set(key, { at: t, reply: checked.reply });
  return { status: 200, body: { ok: true, cached: false, reply: checked.reply } };
}
