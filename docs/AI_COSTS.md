# Inference costs and budgets

**Nothing here is a measured cost.** No model has been called from this repository (LIVE: UNVERIFIED, [`AI_SETUP.md`](AI_SETUP.md)).
Prices are list prices from the Vercel AI Gateway catalog; token counts are this code's own prompt sizes and caps; per-call
figures are arithmetic on those. Measured latency, tokens and cost will come from `npm run ai:smoke` and the evaluation runs, and
replace the estimates here when they exist.

Current daily inference budget: **$1.00 application cap** (`BE_AI_DAILY_BUDGET_USD` default), 3,000 calls per day project-wide.
Usage so far: **0 calls, 0 tokens, $0**.

## Models (chosen 2026-10-27 from https://ai-gateway.vercel.sh/v1/models, 496 models listed that day)

| Role | Default id | Input $/M tokens | Output $/M tokens | Notes from the catalog |
|---|---|---|---|---|
| fast: short beliefs, villager decisions | `anthropic/claude-haiku-5.5` | 0.10 | 0.50 | released 2026-10-07; structured output; zero-data-retention routing available ("zdr": all) |
| accurate: long or multi-clause beliefs, conversations | `anthropic/claude-sonnet-5.5` | 2.00 | 10.00 | released 2026-09-28; structured output; zdr: all |
| alternatives priced in `server/ai/budget.ts` | `openai/gpt-6-luna` 0.10 / 0.50, `openai/gpt-6.1-terra` 1.00 / 5.00, `google/gemini-3.1-flash-lite` 0.25 / 1.50 | | | |

Why these: the cheapest current models that support structured output from two quality tiers of one family, so the instructions
behave alike across tiers. This is a starting point, **not a measured choice**: phase 05's evaluation corpus is what should pick the
tiers (fidelity, false acceptance, unsupported honesty, latency, cost), and the ids are configuration (`BE_AI_MODEL_FAST`,
`BE_AI_MODEL_ACCURATE`), not code. A model id missing from the price table is costed at $10 / $50 per million tokens for
reservations, so an unknown model can only be over-reserved.

## What one call sends and may cost (estimates)

Sizes measured from the code on 2026-10-27: the belief-reading instructions are 1,609 characters, a long compound sentence with
its village context 184 characters; the villager instructions are 1,247 characters, and a six-villager batch is about 6-8 KB of
JSON. The service estimates tokens conservatively at one per three characters.

| Call | Input (est.) | Output: typical / cap | fast tier | accurate tier |
|---|---|---|---|---|
| read one belief | ~600 tokens | ~150 / 1,200 | ~$0.00014 per call | ~$0.0027 per call |
| six villagers decide | ~2,700 tokens | ~700 / 1,400 | ~$0.0006 per batch | ~$0.012 per batch |

Reservation (the worst case held against the daily cap before the call): $0.00066 for a fast reading, $0.0132 for an accurate one;
the unused part is refunded when the call settles.

Rough session costs at these list prices: a player who reads 10 beliefs (a third of them on the accurate tier) and triggers 20
fast villager batches spends about $0.02. A session's worst case is bounded by its 150,000-token daily allowance: under $0.08 if
every token were fast-tier output, and up to about $1 if every call were an accurate-tier conversation; the project-wide cap below
bounds the total either way. At the typical figure, the $1.00 default daily application cap covers roughly 30-100 active players
a day; raise it deliberately.

## The four layers that bound spend

1. **Per session**: 24 readings and 40 villager calls (120 villagers) per UTC day, 150,000 tokens, a cooldown (3 s readings,
   1.5 s villagers) and one request in flight.
2. **Per network** (hashed address): 60 readings and 300 villager decisions per day; 20 new sessions per hour.
3. **Project-wide** (shared store, atomic): 3,000 calls per day (`BE_AI_CALLS_PER_DAY`) and the daily dollar cap
   (`BE_AI_DAILY_BUDGET_USD`), reserved at worst case before each call and settled to the real cost after.
4. **Upstream**: an AI Gateway project budget (OIDC spend) or API-key budget, set in the Vercel dashboard. It is a soft cap (the
   request that crosses it completes), which is why layers 1-3 come first.

A store outage stops online reading (fail closed) rather than letting calls through unmetered.

## Watching spend

`GET /api/ai-metrics` with `Authorization: Bearer <BE_ADMIN_TOKEN>` returns today's calls by route and outcome, input, output
and cached tokens, spend (gateway-reported cost where the gateway gives one, else catalog price × tokens), cache hit rate, latency
p50/p95 (upper bucket edges, not invented precision), calls per model, and the reserved-or-spent total against the cap. The
gateway's own dashboard (AI Gateway → Usage) is the authority for what was billed.
