# Cost and quotas

Phases 03 and 15 ([`prompts/15_SECURITY_PRIVACY_COST_AND_FAILURE.md`](../prompts/15_SECURITY_PRIVACY_COST_AND_FAILURE.md)). Formerly
`AI_COSTS.md`. Companion documents: [`SECURITY.md`](SECURITY.md), [`PRIVACY.md`](PRIVACY.md), [`AI_SETUP.md`](AI_SETUP.md).

**Nothing here is a measured cost.** No model has been called from this repository (LIVE: UNVERIFIED; NOT DEPLOYED). Prices are
list prices from the Vercel AI Gateway catalog; token counts are this code's own prompt sizes and caps; per-call figures are
arithmetic on those. Measured latency, tokens and cost will come from `npm run ai:smoke` and `npm run ai:monitor` once a provider is
configured, and replace the estimates here.

Current daily inference budget: **$1.00 application cap** (`BE_AI_DAILY_BUDGET_USD` default), **3,000 calls a day** project-wide
(`BE_AI_CALLS_PER_DAY` default). Usage so far: **0 calls, 0 tokens, $0**. Classic play never calls anything and is unaffected by any
of this being down.

## Models (chosen 2026-10-27 from https://ai-gateway.vercel.sh/v1/models, 496 models listed that day)

| Role | Default id | Input $/M tokens | Output $/M tokens | Notes from the catalog |
|---|---|---|---|---|
| fast: short beliefs, villager decisions | `anthropic/claude-haiku-5.5` | 0.10 | 0.50 | released 2026-10-07; structured output; zero-data-retention routing available ("zdr": all) |
| accurate: long or multi-clause beliefs, conversations | `anthropic/claude-sonnet-5.5` | 2.00 | 10.00 | released 2026-09-28; structured output; zdr: all |
| alternatives priced in `server/ai/budget.ts` | `openai/gpt-6-luna` 0.10 / 0.50, `openai/gpt-6.1-terra` 1.00 / 5.00, `google/gemini-3.1-flash-lite` 0.25 / 1.50 | | | |

Why these: the cheapest current models that support structured output from two quality tiers of one family, so the instructions
behave alike across tiers. This is a starting point, **not a measured choice**: the evaluation corpus ([`REPLAY_V2.md`](REPLAY_V2.md)
section 5) is what should pick the tiers once a provider is configured, and the ids are configuration (`BE_AI_MODEL_FAST`,
`BE_AI_MODEL_ACCURATE`), not code. A model id missing from the price table is costed at $10 / $50 per million tokens for
reservations, so an unknown model or a typo can only over-reserve (tested in `tests/unit/security-chaos.test.ts`).

## What one call sends and may cost (estimates)

Sizes measured from the code on 2026-10-27 (prompt texts) and in phase 14 (prompt sizes over the evaluation corpus): about 765
input tokens a reading, about 2,500 for a six-villager batch. The service estimates tokens conservatively at one per three
characters when it reserves.

| Call | Input (est.) | Output: typical / cap | fast tier | accurate tier |
|---|---|---|---|---|
| read one belief | ~600-800 tokens | ~150 / 1,200 (2,400 for Generative Reality readings) | ~$0.00015 per call | ~$0.003 per call |
| six villagers decide (one batch, never six calls) | ~2,500-2,700 tokens | ~700 / 1,400 | ~$0.0006 per batch | ~$0.012 per batch |

Reservation (the worst case held against the daily cap before the call): $0.00066 for a fast reading, $0.0132 for an accurate one;
the unused part is refunded when the call settles to its real cost (the gateway's reported cost where it gives one).

Rough session costs at these list prices: a player who reads 10 beliefs (a third on the accurate tier) and triggers 20 fast villager
batches spends about $0.02. A session's worst case is bounded by its 150,000-token daily allowance: under $0.08 if every token were
fast-tier output, up to about $1 if every call were an accurate-tier conversation; the project caps bound the total either way. At
the typical figure, the $1.00 default covers roughly 30-100 active players a day; raise it deliberately.

## The limits, layer by layer

| Layer | Limit (default) | Where |
|---|---|---|
| **Per request** | sentence 1-240 characters; body 24 KB; JSON only (415 otherwise); output capped at 1,200 / 2,400 / 1,400 tokens (reading / Generative reading / villagers); timeout 10 s fast, 15 s accurate; **no retries**; at most 6 villagers per batch, chosen by salience (one statement never fans out into per-villager calls) | `server/ai/config.ts` `DEFAULT_LIMITS`, `http.ts`, tasks |
| **Per session** (signed token, 2 h, scoped to reading and/or villagers) | 24 readings and 40 villager batches (120 villagers) a UTC day; 150,000 tokens a day; cooldown 3 s between readings, 1.5 s between batches; one request in flight | shared store, `server/ai/app.ts` |
| **Per network** (address kept only as an HMAC) | 20 new sessions an hour; 60 readings and 300 villager decisions a day | shared store |
| **Project-wide** (atomic, shared by every instance) | 3,000 calls a day (`BE_AI_CALLS_PER_DAY`, 1-100,000) and the daily dollar cap (`BE_AI_DAILY_BUDGET_USD`, 0-1,000), reserved at worst case before each call, settled after | `LUA_RESERVE` in `server/ai/store.ts`, `budget.ts` |
| **Upstream** | an AI Gateway project budget (OIDC spend) or API-key budget, set in the Vercel dashboard. A **soft** cap: the request that crosses it completes, which is why the layers above come first | Vercel dashboard |

Every counter lives in the shared store (Upstash Redis over REST, atomic Lua), so a cold start or a new serverless instance resets
nothing (`a cold start changes nothing` in `security-chaos.test.ts`; 100 racing requests through 4 instances in `ai-app.test.ts`
and `ai-store.test.ts`, on the in-memory double and on a real Redis). **A store outage stops online reading** (fail closed, 503
`quota_unavailable`): nothing is ever called unmetered. A refused or failed call costs the player nothing: reading is free in the
game (influence is spent only when a belief is written), and the offline reader answers instead.

## Watching spend: `npm run ai:monitor`

`GET /api/ai-metrics` (operator token `BE_ADMIN_TOKEN`, 32+ characters; 404 without one) reports today's calls by route and
outcome, **fallbacks** (answers the player got from the offline reader or the villagers' own rules because a model's could not be
used, including the application's own quota refusals), input / output / cached tokens, **spend per model**, total spend, cache hit
rate, latency p50/p95 (upper bucket edges, not invented precision), and the reserved-or-spent total against the cap with the
project call counter. `npm run ai:monitor` prints it as a panel (`server/ai/monitor.ts`, `scripts/ai-monitor.ts`):

```bash
BE_ADMIN_TOKEN=... npm run ai:monitor                                   # the local simulator (npm run dev:api)
BE_ADMIN_TOKEN=... npm run ai:monitor -- --url https://<project>.vercel.app/api/ai-metrics --watch 30
npm run ai:monitor -- --demo                                            # no server, no key: in-process, scripted provider
```

The token is read from the environment (or an untracked `.env.local`) and sent only in the `Authorization` header; it is never
printed. The `--demo` output from this machine (2026-10-28; MOCK: no model was called, so spend is zero by construction):

```
Inference service, UTC day 2026-10-28
  service    ready · provider mock · credential none · store memory
  budget     $0 of $1.00 reserved or spent (0%) · 2 of 3,000 calls
  calls      readings 3 (cache hits 1, 33.3%) · villager batches 0
  fallbacks  0 of 3 (0%): answered by the offline reader or the villagers' own rules
  outcomes   interpret.ok 2 · interpret.cache_hit 1
  tokens     in 320 · out 120 · cached in 0
  spend      $0 today (the gateway's reported cost where it gave one, else list price x tokens)
  latency    p50 <= 250 ms · p95 <= 250 ms (2 calls; bucket edges, not exact)
  model      anthropic/claude-haiku-5.5: 2 calls, $0
  tiers      fast anthropic/claude-haiku-5.5 · accurate anthropic/claude-sonnet-5.5
```

`tests/unit/ai-monitor.test.ts` drives the real app with a scripted provider that reports tokens (so list-price spend is non-zero):
one reading, one timeout, one cache hit and one quota refusal show up as 3 calls, 2 fallbacks of 4 answers, spend on the model, and
no key, token or sentence anywhere in the panel. The gateway's own dashboard (AI Gateway → Usage) is the authority for what was
billed; the monitor's dollars are the application's accounting.

## Configuration (names only: never paste a value into a chat, an issue, a commit or a `VITE_` variable)

1. **Application caps** (Vercel → Project → Settings → Environment Variables, or `.env.local` locally): `BE_AI_DAILY_BUDGET_USD`
   (default 1) and `BE_AI_CALLS_PER_DAY` (default 3000). Keep the dollar cap **below** the gateway budget.
2. **Gateway budget** (Vercel dashboard → AI Gateway → Budgets): a daily **project** budget (e.g. $2) when the deployment uses
   OIDC, or a budget on the API key when developing locally with `AI_GATEWAY_API_KEY`.
3. **Monitor**: set `BE_ADMIN_TOKEN` (32+ random characters, e.g. `openssl rand -base64 48`) on the server, and the same value in your
   shell when you run `npm run ai:monitor`.
4. **Privacy routing**: `BE_AI_ZERO_RETENTION=1` on Pro and Enterprise plans (no extra cost per request; see [`PRIVACY.md`](PRIVACY.md)).
5. Run `npm run ai:smoke` (three live calls) once a credential exists, and record its latency, tokens and cost here in place of the
   estimates.

## Evidence

| What | Status |
|---|---|
| Caps, reservations, settlement, fail-closed store, races across instances, cold start, metrics, monitor | **VERIFIED with scripted providers** (memory store and a real Redis 7 through the REST shim); `ai-app`, `ai-store`, `ai-monitor`, `security-chaos` tests |
| Prices | list prices read from the public catalog on 2026-10-27; not billed amounts |
| Any real model call, token count or bill | **LIVE: UNVERIFIED** (no credential in this environment; nothing was called) |
| Deployment and the gateway budget | **NOT DEPLOYED** |

## Known limitations

- Anonymous sessions: anyone who can load the page can open one (20 per network per hour); a caller who rotates addresses can open
  more, which is why the project-wide call and dollar caps bound the total. There is no bot check yet (Vercel BotID or a Turnstile
  check on `/api/session` would be the natural addition before a public launch).
- Metrics are best effort: if the store fails *after* a paid call, that call's metric can be lost (its quota and spend are settled
  separately and still count).
- Latency percentiles are bucket edges (250 ms ... 32 s), not exact values.
- The gateway budget is a soft cap; the application caps are the hard ones.
