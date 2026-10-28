# Release

Phase 16 ([`prompts/16_INTEGRATION_RELEASE_TESTING.md`](../prompts/16_INTEGRATION_RELEASE_TESTING.md)). How to install, build,
verify and deploy Belief Engine V2, with the names of every setting (never values) and the cost caps. What has and has not been
verified is in [`FINAL_ACCEPTANCE.md`](FINAL_ACCEPTANCE.md).

**Status on 2026-10-28: NOT DEPLOYED** (no Vercel project exists for this repository; deploying needs the owner's authorisation and
billing). **LIVE: UNVERIFIED** (no provider credential exists in this environment; no model has ever been called). Authorised spend:
**none**; the application's default cap is $1.00 a day and nothing can be spent until the owner configures a credential.

## 1. What is released

| Part | What | Needs |
|---|---|---|
| The game | a static single-page app (`dist/`): Classic, Generative Reality (offline reader), Reality Lab, Living Village, expeditions, the 2D map and the 3D world | nothing: it runs entirely in the browser, offline |
| Online reading (optional) | five Vercel Functions in `api/` (`server/ai/`): status, sessions, reading sentences, villager decisions, operator metrics | the settings in section 4; without them the routes say "not configured" and the game reads offline |
| MCP server (optional, local) | `npm run mcp`: stdio only, for an agent on the same machine | nothing; online reading only if started with `BE_AI_ENABLED=1` and a configuration |

Classic play makes no network request at all, configured or not.

## 2. Install and build (reproducible)

```bash
git clone https://github.com/JaredVogler2/BeliefEngine_V2 && cd BeliefEngine_V2
node --version            # 22.12 or newer (package.json "engines")
npm ci                    # exact versions from package-lock.json
npm run build             # tsc --noEmit && vite build → dist/
npm run preview           # http://127.0.0.1:4173
```

## 3. Verify before any release

| Command | Expect |
|---|---|
| `npm run lint`, `npm run typecheck` | no errors |
| `npm test` | every file passes (set `BE_REQUIRE_REDIS=1` with `redis-server` installed to require the real-Redis quota tests, as CI does) |
| `npm run scan:secrets -- --history` and, after the build, `npm run scan:secrets -- --dist` | "clean" |
| `npm run size` | within every budget (entry 300 KB gzip) |
| `npm run verify:hosting` | the build served with `vercel.json`'s headers and CSP in a real browser: no violation, no console error |
| `npm run test:e2e:classic`, `npm run test:e2e:3d`, `npm run test:e2e:browsers` | Playwright: Chromium desktop and phone; the 3D world on software WebGL; the smoke in Firefox, WebKit and three iPhone sizes |
| `npm run test:sim:smoke`, `npm run test:sim:v2` | bot runs: no crash, softlock or nondeterminism; V2 runs with stored model outputs replay exactly |
| `npm run eval` | the evaluation report (offline and MOCK; LIVE only with a credential) |

CI (`.github/workflows/ci.yml`) runs all of these except `test:sim:v2` and `eval` on every push.

## 4. Vercel configuration (names only: never paste a value into a chat, an issue, a commit or a `VITE_` variable)

`vercel.json` already sets the build (`npm ci`, `npm run build`, `dist`), the single-page rewrite (which leaves `/api/` alone), and
the security headers (CSP `connect-src 'self'`, no framing, `nosniff`, no referrer). Functions run on Node.js (Vercel picks
`nodejs24.x` from `engines`).

1. **Import** `JaredVogler2/BeliefEngine_V2` as a Vercel project (framework: Vite). With no further settings the site is the
   complete offline game and the online routes answer "not configured".
2. **Quota store**: Storage → Marketplace → Upstash for Redis, connected to the project (sets `KV_REST_API_URL`,
   `KV_REST_API_TOKEN`). The per-process memory store is refused on Vercel; nothing shared lives in a function's memory.
3. **Environment variables** (Production, and Preview if wanted):
   `BE_AI_ENABLED=1`, `BE_SESSION_SECRET` (32+ random characters), `BE_ALLOWED_ORIGINS` (the exact site origin), optionally
   `BE_AI_DAILY_BUDGET_USD` (default 1), `BE_AI_CALLS_PER_DAY` (default 3000), `BE_AI_MODEL_FAST`, `BE_AI_MODEL_ACCURATE`,
   `BE_ADMIN_TOKEN` (for `npm run ai:monitor`), `BE_AI_ZERO_RETENTION=1` (Pro/Enterprise).
4. **Credentials**: do **not** set `AI_GATEWAY_API_KEY` on Vercel; enable OIDC federation (Settings → Security) and the deployment
   authenticates to the AI Gateway with its own short-lived token. A key belongs only in an untracked `.env.local` for local work.
5. **Spend**: AI Gateway → Budgets → a daily **project** budget (e.g. $2) above the application cap; it is a soft upstream cap, the
   application caps are the hard ones ([`COST_AND_QUOTAS.md`](COST_AND_QUOTAS.md)).
6. **Deploy** (only with the owner's authorisation), then check, on the live site: `/api/ai-status` reports `available: true` and
   the routing; a Classic run makes no `/api` request; a Generative run with online reading on shows a reading labelled with the
   model; `npm run ai:monitor -- --url https://<site>/api/ai-metrics` shows the call, its tokens and spend; the quota refuses past
   its cap. Record the URL and the results in [`FINAL_ACCEPTANCE.md`](FINAL_ACCEPTANCE.md); never before they exist.
7. **Rollback**: Vercel's instant rollback to the previous deployment; switching `BE_AI_ENABLED` off returns the site to offline
   reading without a redeploy of the game.

## 5. Live inference acceptance (owner, once a credential exists)

`npm run ai:smoke` makes three real calls through the server's own provider code (a supported belief, an impossible one, one
villager batch) and records model id, latency, tokens, cost and whether the game's validators accepted each answer. Phase 16's live
checklist (10 diverse clauses, named villagers over two rounds, error and refusal rates, the cost cap under the rate limiter) is
in [`FINAL_ACCEPTANCE.md`](FINAL_ACCEPTANCE.md) section "Live"; until it is run the UI never claims a live model, and every result
in this repository stays MOCK.

## 6. Versions a release carries

Engine rules `1.0.0` (Classic, hash for hash with V1), save schema 1 (with an optional ledger), written-belief rules 3 (recorded per
run; rules 1 and 2 runs replay exactly; a Living Village is created under 2), belief language `reality-1`, offline reader
`offline-v2.3`, prompts `interpret-v2.2026-10-27` and
`npc-v2.2026-10-27`, ledger 1 with validator `reality-1/npc-2/talk-1`, MCP errors version 2.
