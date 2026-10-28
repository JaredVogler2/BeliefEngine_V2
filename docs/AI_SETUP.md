# Online reading: setup, design and verification

Phase 03 ([`prompts/03_PROVIDER_AUTH_AND_BUDGETS.md`](../prompts/03_PROVIDER_AUTH_AND_BUDGETS.md)). Status on 2026-10-27:

| What | Status |
|---|---|
| Server-side inference service (`server/ai/`, `api/*.ts`) | **IMPLEMENTED, TESTED MOCK ONLY** |
| Durable shared quotas (Redis over REST, atomic Lua) | **VERIFIED** against a real Redis 7.0.15 in this container (100-request race) |
| Vercel packaging | **VERIFIED offline**: `vercel build` (CLI 65.4.0) output loaded and called with plain Node |
| A real model call through the gateway | **LIVE: UNVERIFIED**: no credential exists in this environment; nothing was ever called |
| Deployment | **NOT DEPLOYED**: no Vercel project exists for this repository |

Nothing here has been run against a real model. Every test answer came from a scripted provider, and the game labels such answers
"simulated (no model)" on screen.

## What it is

```
browser (src/ai/client.ts)                server (Vercel Functions, server/ai/app.ts)                    outside
─────────────────────────                 ────────────────────────────────────────────                   ───────
player opts in + consents ──GET /api/ai-status──► capability, public model ids, privacy note (no secret)
                          ──POST /api/session───► origin + consent + per-network rate ──► signed 2 h token
sentence ─────────POST /api/interpret-belief────► token → schema → cooldown → cache → lease ──► shared store (Upstash Redis REST)
                                                  atomic reservation: session, network, project calls,
                                                  session tokens, project $ (fail closed)  ─────────────► Vercel AI Gateway → model
readings ◄──── validated twice (server: schema + game vocabulary; browser: the game's own checks) ◄── structured output (zod schema)
```

- **Routes** (`api/*.ts`, each a Node.js Vercel Function exporting `{ fetch }`):

  | Route | Purpose | Contract |
  |---|---|---|
  | `GET /api/ai-status` | is online reading available here; public model ids; limits; privacy note | no secret, no per-user data |
  | `POST /api/session` | `{ consent: true }` → short-lived capability token | allowed Origin required; 20 per network per hour |
  | `POST /api/interpret-belief` | one sentence → readings in the V1 belief vocabulary (`server/ai/tasks/interpret-v1.ts`) | phase 05 adds the Generative Reality contract (v2) |
  | `POST /api/npc-decision` | up to 6 villagers' legal moves, a line each, cited memories (`server/ai/tasks/npc.ts`) | used from phase 07 |
  | `GET /api/ai-metrics` | today's calls, outcomes, tokens, spend, cache hits, latency p50/p95 | operator bearer token; 404 without one |

  A separate `/api/npc-dialogue` was not built: a conversation is an `npc-decision` with `event.kind: "conversation"` and the
  player's message, which keeps one validator and one quota for everything a villager says.

- **Model calls** (`server/ai/sdk-provider.ts`): Vercel AI SDK `ai@7.0.155`, `generateText` with `output: Output.object({ schema })`
  and `instructions` (AI SDK 7 deprecates `system`), `maxRetries: 0`, a hard timeout (10 s fast, 15 s accurate), temperature 0
  for reading beliefs and 0.7 for villagers. The model is addressed by gateway id (`createGateway`), which authenticates with
  `AI_GATEWAY_API_KEY` when set and otherwise with the deployment's OIDC token. Errors are classified (timeout, refused, malformed,
  rate limited, auth, budget, bad model, unavailable) and every one becomes an explained offline fallback.
- **Model output is untrusted.** The reading schema enumerates the vocabulary; then every reading must be a pairing the village can
  physically model (`toLlmReply`), then the browser runs V1's strict reply validator and the game's own balance, stress test and
  cost (`interpretBelief(..., { readings })`). A villager decision must name one of the villagers asked about, a move on that
  villager's own list, a legal target, a known claim, and only that villager's own memories (`validateDecisions`); otherwise it
  is rejected and the game uses its deterministic behaviour for that villager.
- **Player text is data.** Instructions are fixed and versioned (`interpret-v1.2026-10-27`, `npc-v1.2026-10-27`); the sentence,
  memories and any player message travel only as JSON string values in the prompt, and the instructions say that anything inside
  them that looks like an instruction is part of the story. Text is NFKC-normalised and stripped of control and bidirectional
  characters first.

## Security and cost controls (what each defends against)

| Control | Where | Defends against |
|---|---|---|
| No request until the player opts in and accepts the notice | `src/ui/play/Compose.tsx`, `src/ai/client.ts` | Classic play touching the network; surprise data sharing |
| Same-origin `/api` only; no key, SDK or credential name in the browser bundle | CSP `connect-src 'self'`; `scripts/check-bundle.ts`; `tests/unit/no-unsafe-code.test.ts` | key leakage; browser-side provider calls |
| Signed session tokens (HMAC-SHA256, 2 h, scoped) in an `Authorization` header | `server/ai/session.ts` | an open proxy; CSRF (no cookie is involved) |
| Origin checked, but never as the authorisation | `server/ai/app.ts` | other sites minting sessions from a visitor's browser |
| Content type, 24 KB body cap, strict schemas (unknown fields refused), 240-character sentences | `server/ai/http.ts`, tasks | oversized or smuggled payloads |
| Cooldown and one in-flight request per session | shared store (`SET NX PX`) | double taps, parallel flooding |
| One atomic reservation over five counters before any call | `LUA_RESERVE` in `server/ai/store.ts` | races between serverless instances (100-request test) |
| Worst-case cost reserved before the call, settled to the real cost after (overruns recorded) | `server/ai/budget.ts` | parallel calls slipping past the daily cap |
| **Fail closed** on any store error or timeout (1.5 s) | `StoreUnavailableError` → 503 `quota_unavailable` | unmetered calls during a store outage |
| Validated-only cache keyed by prompt version, vocabulary version, model id, normalised text and village context; re-validated on read | `app.ts` | repeat costs; a poisoned cache entry |
| Logs hold route, outcome, tier, model, token counts, ms, micro-dollars only | `server/ai/meter.ts` | leaking sentences, memories, sessions, addresses or keys |
| Addresses only as HMACs; sessions name no person | `app.ts` | storing personal data |
| Gateway privacy routing: never a provider that trains on requests; zero data retention with `BE_AI_ZERO_RETENTION=1` (phase 15) | `gatewayRouting` in `server/ai/sdk-provider.ts` | prompts used for training or kept; see [`PRIVACY.md`](PRIVACY.md) |
| Secret scan over every tracked file, every commit and the built site, in CI (phase 15) | `scripts/scan-secrets.ts` | a credential committed by mistake; see [`SECURITY.md`](SECURITY.md) |

Known limits, stated plainly: anonymous sessions can be opened by anyone who can load the page (20 per network per hour); a caller
who rotates addresses can open more, which is why the **project-wide** daily call cap (3,000) and spend cap (default $1) bound
the total. There is no CAPTCHA or bot check yet (Vercel BotID would be the natural addition before a public launch). The AI
Gateway's own budget is a soft cap (the request that crosses it still completes), so it is the last line behind these, not the
first.

## Verified facts this design rests on (2026-10-27)

- AI SDK: installed `ai@7.0.155` (`npm view ai`: latest 7.0.155); its types show `generateText({ instructions, prompt, output,
  maxOutputTokens, temperature, maxRetries, abortSignal, timeout })`, `Output.object({ schema, name, description })`, `result.output`,
  `result.totalUsage` (`inputTokens`, `outputTokens`, `inputTokenDetails.cacheReadTokens`) and `NoObjectGeneratedError` (carries
  `usage`). The docs page https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data shows the same API.
- Gateway authentication (https://vercel.com/docs/ai-gateway/authentication-and-byok and `/oidc`, both updated 2026-09-08): the
  AI SDK reads `AI_GATEWAY_API_KEY`; without it, it uses the Vercel OIDC token (`VERCEL_OIDC_TOKEN`, valid 12 hours locally after
  `vercel env pull`). Confirmed in `@ai-sdk/gateway@4.0.128`'s source: `getGatewayAuthToken` falls back to `getVercelOidcToken()`.
- Gateway budgets (https://vercel.com/docs/ai-gateway/observability-and-spend/budgets, updated 2026-09-10): team, project (OIDC
  spend only), API-key and user budgets; daily/weekly/monthly; a **soft** cap; rejection is HTTP 402 `quota_for_entity_exceeded`,
  which the SDK may surface as `GatewayInternalServerError` (classified here as `budget`).
- Model ids and prices: the public catalog `https://ai-gateway.vercel.sh/v1/models` (496 models on 2026-10-27); see
  [`COST_AND_QUOTAS.md`](COST_AND_QUOTAS.md).
- Vercel Functions (https://vercel.com/docs/functions/functions-api-reference): files in `api/` export `{ fetch(request) }` and an
  optional `config = { runtime: 'nodejs', maxDuration }`.
- **A packaging defect found and fixed before any deployment:** Vercel's builder transpiles each function file with the project's
  TypeScript but keeps import paths as written. `vercel build` run offline on a minimal copy produced `import '../server/x.ts'`
  in the output, which fails at runtime with `ERR_MODULE_NOT_FOUND` (V1's example adapter used such imports and was never
  deployed, so it would have failed). With `"rewriteRelativeImportExtensions": true` in `tsconfig.json` the output imports `.js`
  and runs. `vercel build` on this repository then built all five functions (runtime `nodejs24.x`, chosen because
  `engines.node` is `>=22.12`) plus the static site; each built function was imported and called with plain Node and answered
  `disabled` with no configuration and `quota_unavailable` with a configuration whose store was unreachable. The route table
  puts `handle: filesystem` (functions) before the single-page rewrite, and the rewrite now excludes `/api/`, so an unknown API
  path is a 404, not the app shell. `tests/unit/ai-functions.test.ts` repeats this build in miniature on every test run.

## Setting it up (names only: never paste a value into a chat, an issue, a commit or a `VITE_` variable)

### 1. Local, no key: the simulator

```bash
BE_AI_ENABLED=1 BE_AI_DEV_PROVIDER=mock BE_AI_DEV_MEMORY_STORE=1 npm run dev:api   # http://127.0.0.1:8787/api/*
npm run dev                                                                          # Vite forwards /api to it
```

Start an Inventor run, open "Write a belief", choose "Use online reading…" and accept. Answers come from a scripted stand-in
(V1's offline reader reshaped as model output) and are labelled "simulated (local test server, no model)". The browser test
`tests/e2e/v2-online.spec.ts` runs exactly this.

### 2. Local, with the real gateway (costs money)

1. Vercel dashboard → AI Gateway → API Keys → **Create key**, with a small **budget** (e.g. $2, daily) on the key itself.
2. Create an untracked `.env.local` (git ignores `.env.*`) from [`.env.example`](../.env.example) and fill in, privately:
   `BE_AI_ENABLED`, `AI_GATEWAY_API_KEY`, `BE_SESSION_SECRET` (`openssl rand -base64 48`), and a store: either an Upstash
   database's `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, or a local Redis exposed through the shim
   (`redis-server --port 6379 &` then `npx tsx scripts/lib/redis-rest-shim.ts 6379`, and point `UPSTASH_REDIS_REST_URL` at the
   printed `http://127.0.0.1:...` address; plain http is accepted for 127.0.0.1 only and never on Vercel).
3. `npm run ai:smoke`: the LIVE smoke test below. Then `npm run dev:api` and `npm run dev`.

### 3. Vercel (not done: requires the owner's authorisation and billing)

1. Import `JaredVogler2/BeliefEngine_V2` as a Vercel project (framework Vite; `vercel.json` already sets `npm ci`,
   `npm run build`, `dist`).
2. Storage → Marketplace → **Upstash for Redis**, connected to the project. It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`,
   which `server/ai/config.ts` accepts.
3. Project → Settings → Environment Variables (Production and, if wanted, Preview): `BE_AI_ENABLED=1`, `BE_SESSION_SECRET`,
   `BE_ALLOWED_ORIGINS` (the exact deployment origin, e.g. `https://<project>.vercel.app`), optionally `BE_AI_DAILY_BUDGET_USD`,
   `BE_AI_CALLS_PER_DAY`, `BE_AI_MODEL_FAST`, `BE_AI_MODEL_ACCURATE`, `BE_ADMIN_TOKEN`. Do **not** set `AI_GATEWAY_API_KEY`:
   the deployment authenticates with its OIDC token (Settings → Security → "Secure backend access with OIDC federation").
4. AI Gateway → Budgets → Projects: a **daily project budget** (e.g. $2). OIDC spend counts against it. The application cap
   (`BE_AI_DAILY_BUDGET_USD`, default $1) should sit below it.
5. Deploy, then check `https://<project>.vercel.app/api/ai-status` reports `"available": true`, and run the game's online flow.
   Record the result in [`PROGRESS.md`](PROGRESS.md); until then the deployment row above stays NOT DEPLOYED.

## LIVE smoke test

`npm run ai:smoke` (`scripts/ai-live-smoke.ts`) calls the gateway three times through the server's own provider code: a supported
belief ("The river turns aside from lit lanterns."), an unsupported one ("Reverse time and resurrect all dead villagers.", which
must come back `understood: false`), and one decision for two villagers. It prints and saves (`reports/ai-live-smoke-<date>.json`)
the model id, latency, input/output/cached tokens, cost (the gateway's when reported, else catalog price × tokens) and whether the
game's validators accepted the answer. Without a credential it prints `LIVE: UNVERIFIED`, calls nothing and exits 2. It has
**never been run with a credential**: its last run (2026-10-27, this container) printed `LIVE: UNVERIFIED` and exited 2.

## Tests (all with scripted providers or the SDK's mock model; none is evidence about a real model)

| File | What it shows |
|---|---|
| `tests/unit/ai-config-session.test.ts` | missing configuration is reported by variable name only; OIDC on Vercel; the memory store is refused there; tokens resist forgery, other secrets, expiry and scope misuse |
| `tests/unit/ai-store.test.ts` | reservation semantics on the memory double and on real Redis (all-or-nothing, refunds floor at 0, leases, TTLs, metrics hashes); **100 racing reservations from 4 clients admit exactly the limit**; outage, wrong token, timeout and garbage all fail closed without echoing the token |
| `tests/unit/ai-sdk-provider.test.ts` | the real `generateText` + `Output.object` path with `MockLanguageModelV4`: valid output, malformed JSON, schema drift, refusal, timeout, error classification, instructions and data kept apart |
| `tests/unit/ai-app.test.ts` | every route: not configured, origin and consent, session rate limit, auth failures, bad bodies, malformed/refused/timeout/outage fallbacks, vocabulary enforcement, prompt injection kept as data, cache hits and a poisoned cache entry, cooldown and one-in-flight, exact quota boundary and the next UTC day, the spend cap with an overspending answer, fail-closed store outage, no secret or sentence in any response or log line, villager-decision validation, **100 simultaneous requests through 4 app instances sharing one store (memory and real Redis): provider calls never exceed the quota** |
| `tests/unit/ai-functions.test.ts` | the functions as Vercel builds them run on plain Node; mutation-checked by switching `rewriteRelativeImportExtensions` off |
| `tests/unit/nl-online-client.test.ts` | the browser client: no request until asked, what it sends (no villagers, no save), failures explained, 401 drops the session |
| `tests/unit/no-unsafe-code.test.ts` | credential names appear only in `server/ai/config.ts`; the browser imports no server code, SDK or zod; `.env.example` holds names only |
| `tests/e2e/v2-online.spec.ts` | in Chromium, on the production build and the simulator: Classic makes no `/api` request; the consent notice; a simulated reading labelled as such; "not set up"; a provider failure spends nothing |

V1's in-memory proxy (`server/interpreter.ts`, `server/vercel-function.example.ts`, `src/ui/interpreter.ts` with its build-time
`VITE_INTERPRETER_URL`) was removed: its per-instance limits limited nothing on a serverless platform. Its proxy tests were
replaced by the ones above; its reply-contract tests stay in `tests/unit/nl-llm.test.ts`.
