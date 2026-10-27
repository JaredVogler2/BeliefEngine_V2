/**
 * Configuration of the server-side inference service, read from the function's environment and nothing else. The browser never
 * sees any of it: the client asks `GET /api/ai-status`, which reports capability booleans and public model ids only.
 *
 * Every variable is optional. Without them the service answers "not configured" and the game uses its offline reader, so a
 * deployment that nobody has set up costs nothing and leaks nothing. The names are listed in `.env.example` and documented in
 * docs/AI_SETUP.md; their values belong in an untracked `.env.local` (local development) or the Vercel project settings.
 */

/** Environment variable names. Only these are read. */
export const ENV_NAMES = {
  enabled: 'BE_AI_ENABLED',
  gatewayKey: 'AI_GATEWAY_API_KEY',
  oidcToken: 'VERCEL_OIDC_TOKEN',
  onVercel: 'VERCEL',
  vercelEnv: 'VERCEL_ENV',
  modelFast: 'BE_AI_MODEL_FAST',
  modelAccurate: 'BE_AI_MODEL_ACCURATE',
  sessionSecret: 'BE_SESSION_SECRET',
  origins: 'BE_ALLOWED_ORIGINS',
  storeUrl: 'UPSTASH_REDIS_REST_URL',
  storeToken: 'UPSTASH_REDIS_REST_TOKEN',
  kvUrl: 'KV_REST_API_URL',
  kvToken: 'KV_REST_API_TOKEN',
  devMemoryStore: 'BE_AI_DEV_MEMORY_STORE',
  dailyBudgetUsd: 'BE_AI_DAILY_BUDGET_USD',
  callsPerDay: 'BE_AI_CALLS_PER_DAY',
  adminToken: 'BE_ADMIN_TOKEN',
} as const;

/**
 * Default model ids, chosen from the Vercel AI Gateway catalog (https://ai-gateway.vercel.sh/v1/models) on 2026-10-27, with that
 * day's prices in budget.ts. A fast low-cost model reads simple beliefs and voices villagers; a more accurate one is used for
 * long or multi-clause beliefs. Both support structured output. These are starting points to benchmark, not a measured choice:
 * docs/AI_COSTS.md records what has and has not been measured. Override them with BE_AI_MODEL_FAST / BE_AI_MODEL_ACCURATE.
 */
export const DEFAULT_MODELS = { fast: 'anthropic/claude-haiku-5.5', accurate: 'anthropic/claude-sonnet-5.5' } as const;

export type Tier = 'fast' | 'accurate';

/** Application-level limits. The Vercel AI Gateway budget is a soft last line behind these, never a replacement. */
export interface Limits {
  claimMaxChars: number;
  bodyMaxBytes: number;
  interpretPerSessionDay: number;
  interpretPerIpDay: number;
  interpretCooldownMs: number;
  npcCallsPerSessionDay: number;
  npcAgentsPerSessionDay: number;
  npcAgentsPerIpDay: number;
  npcCooldownMs: number;
  npcAgentsPerCall: number;
  tokensPerSessionDay: number;
  sessionsPerIpHour: number;
  sessionTtlMs: number;
  callsPerDay: number;
  timeoutMs: Record<Tier, number>;
  maxOutputTokens: { interpret: number; npc: number };
  leaseMs: number;
  cacheTtlMs: number;
}

export const DEFAULT_LIMITS: Limits = {
  claimMaxChars: 240,
  bodyMaxBytes: 24_576,
  interpretPerSessionDay: 24,
  interpretPerIpDay: 60,
  interpretCooldownMs: 3_000,
  npcCallsPerSessionDay: 40,
  npcAgentsPerSessionDay: 120,
  npcAgentsPerIpDay: 300,
  npcCooldownMs: 1_500,
  npcAgentsPerCall: 6,
  tokensPerSessionDay: 150_000,
  sessionsPerIpHour: 20,
  sessionTtlMs: 2 * 3600_000,
  callsPerDay: 3_000,
  timeoutMs: { fast: 10_000, accurate: 15_000 },
  maxOutputTokens: { interpret: 1_200, npc: 1_400 },
  leaseMs: 30_000,
  cacheTtlMs: 7 * 24 * 3600_000,
};

export type StoreConfig = { kind: 'redis-rest'; url: string; token: string } | { kind: 'memory' } | { kind: 'none' };

export interface AiConfig {
  enabled: boolean;
  /** how the gateway call is authenticated; the key itself is never serialized anywhere */
  credential: 'api_key' | 'oidc' | 'none';
  apiKey: string | null;
  models: Record<Tier, string>;
  sessionSecret: string | null;
  origins: string[];
  store: StoreConfig;
  dailyBudgetUsd: number;
  limits: Limits;
  adminToken: string | null;
  onVercel: boolean;
  /** names (never values) of what is missing for the service to run */
  missing: string[];
}

export type Env = Record<string, string | undefined>;

const MIN_SECRET = 32;

function num(v: string | undefined, fallback: number, min: number, max: number): number {
  const n = v === undefined || v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** An exact-match origin list. Anything that is not a plain http(s) origin is dropped rather than half-trusted. */
export function parseOrigins(raw: string | undefined): string[] {
  const out: string[] = [];
  for (const part of (raw ?? '').split(',')) {
    const s = part.trim();
    if (!s) continue;
    try {
      const u = new URL(s);
      if ((u.protocol === 'https:' || u.protocol === 'http:') && u.origin === s.replace(/\/$/, '')) out.push(u.origin);
    } catch {
      // not an origin
    }
  }
  return [...new Set(out)];
}

export function loadAiConfig(env: Env): AiConfig {
  const onVercel = env[ENV_NAMES.onVercel] === '1';
  const apiKey = (env[ENV_NAMES.gatewayKey] ?? '').trim() || null;
  // On Vercel the gateway reads the deployment's OIDC token itself (from the request context or VERCEL_OIDC_TOKEN)
  const credential: AiConfig['credential'] = apiKey ? 'api_key' : env[ENV_NAMES.oidcToken] || onVercel ? 'oidc' : 'none';
  const secret = (env[ENV_NAMES.sessionSecret] ?? '').trim();
  const url = (env[ENV_NAMES.storeUrl] ?? env[ENV_NAMES.kvUrl] ?? '').trim();
  const token = (env[ENV_NAMES.storeToken] ?? env[ENV_NAMES.kvToken] ?? '').trim();
  // TLS is required, except for a store on the developer's own machine (the local REST shim over a real Redis)
  const storeUrlOk = /^https:\/\/[^\s/]+/.test(url) || (!onVercel && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url));
  // The in-memory store is per-instance: never acceptable on a deployment, allowed only for a developer's own machine.
  const store: StoreConfig = url && token && storeUrlOk ? { kind: 'redis-rest', url: url.replace(/\/$/, ''), token } : env[ENV_NAMES.devMemoryStore] === '1' && !onVercel ? { kind: 'memory' } : { kind: 'none' };
  const origins = parseOrigins(env[ENV_NAMES.origins]);
  const enabled = env[ENV_NAMES.enabled] === '1';
  const missing: string[] = [];
  if (!enabled) missing.push(ENV_NAMES.enabled);
  if (credential === 'none') missing.push(`${ENV_NAMES.gatewayKey} (or Vercel OIDC)`);
  if (secret.length < MIN_SECRET) missing.push(`${ENV_NAMES.sessionSecret} (${MIN_SECRET}+ characters)`);
  if (store.kind === 'none') missing.push(`${ENV_NAMES.storeUrl} + ${ENV_NAMES.storeToken} (or ${ENV_NAMES.kvUrl} + ${ENV_NAMES.kvToken})`);
  if (origins.length === 0) missing.push(ENV_NAMES.origins);
  const limits: Limits = { ...DEFAULT_LIMITS, callsPerDay: Math.round(num(env[ENV_NAMES.callsPerDay], DEFAULT_LIMITS.callsPerDay, 1, 100_000)) };
  return {
    enabled,
    credential,
    apiKey,
    models: {
      fast: modelId(env[ENV_NAMES.modelFast]) ?? DEFAULT_MODELS.fast,
      accurate: modelId(env[ENV_NAMES.modelAccurate]) ?? DEFAULT_MODELS.accurate,
    },
    sessionSecret: secret.length >= MIN_SECRET ? secret : null,
    origins,
    store,
    dailyBudgetUsd: num(env[ENV_NAMES.dailyBudgetUsd], 1, 0, 1_000),
    limits,
    adminToken: (env[ENV_NAMES.adminToken] ?? '').trim().length >= MIN_SECRET ? (env[ENV_NAMES.adminToken] ?? '').trim() : null,
    onVercel,
    missing,
  };
}

/** A gateway model id is "creator/model"; anything else is ignored so a typo cannot become an arbitrary string in a request. */
function modelId(v: string | undefined): string | null {
  const s = (v ?? '').trim();
  return /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9._-]{0,80}$/.test(s) ? s : null;
}

/** The local simulator's scripted provider runs no model, so it needs no gateway credential. Never applies on Vercel. */
export function withoutCredential(cfg: AiConfig): AiConfig {
  return cfg.onVercel ? cfg : { ...cfg, missing: cfg.missing.filter((m) => !m.startsWith(ENV_NAMES.gatewayKey)) };
}

/**
 * Local-simulator defaults (server/ai/dev-server.ts only, never on Vercel): the local browser origins, and a throw-away session
 * signing secret that changes on every start, unless the developer set their own.
 */
export function withDevDefaults(env: Env, randomSecret: string): Env {
  if (env[ENV_NAMES.onVercel] === '1') return env;
  return {
    ...env,
    [ENV_NAMES.origins]: env[ENV_NAMES.origins] || 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173',
    [ENV_NAMES.sessionSecret]: env[ENV_NAMES.sessionSecret] || randomSecret,
  };
}

export type Readiness = { ready: true } | { ready: false; reason: 'disabled' | 'not_configured'; missing: string[] };

export function readiness(cfg: AiConfig): Readiness {
  if (!cfg.enabled) return { ready: false, reason: 'disabled', missing: cfg.missing };
  if (cfg.missing.length) return { ready: false, reason: 'not_configured', missing: cfg.missing };
  return { ready: true };
}
