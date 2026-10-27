# Continue here

Read this first after any context reset, then [`../prompts/AGENT_RUNBOOK.md`](../prompts/AGENT_RUNBOOK.md) and
[`PROGRESS.md`](PROGRESS.md).

## Phase and status

- **01 V1 audit, 02 migration and baseline: VERIFIED.**
- **03 Provider, auth and budgets: VERIFIED with mocks, a real Redis and an offline `vercel build`. LIVE: UNVERIFIED** (no
  credential exists here; `npm run ai:smoke` refuses and exits 2). **NOT DEPLOYED** (no Vercel project). Details:
  [`AI_SETUP.md`](AI_SETUP.md), [`AI_COSTS.md`](AI_COSTS.md).
- **04 Generative belief language: NOT STARTED. It is the next task (below)**, together with the executor core of phase 06,
  because the phase 04 gate asks for novel claims that are "mechanically testable".

## Last good commit / branch

Branch `claude/gracious-heisenberg-x6dvn1` of `JaredVogler2/BeliefEngine_V2`, on top of `main@534448e` (phases 01-02 merged as
JaredVogler2/BeliefEngine_V2#1). Phase 03 is the commit that adds `server/ai/`, `api/`, `src/ai/`, this file's update and
[`AI_SETUP.md`](AI_SETUP.md).

## Working files changed in phase 03

`server/ai/{config,crypto,store,session,budget,provider,sdk-provider,mock-provider,http,meter,app,vercel,dev-server}.ts`,
`server/ai/tasks/{interpret-v1,npc}.ts`, `api/{ai-status,session,interpret-belief,npc-decision,ai-metrics}.ts`, `src/ai/client.ts`,
`src/ui/play/Compose.tsx` (consent notice, source labels), `src/styles.css`, `src/v2/features.ts` (`serverInference: true`),
`scripts/ai-live-smoke.ts`, `scripts/lib/redis-rest-shim.ts`, `scripts/check-bundle.ts` (bundle secret scan), `tsconfig.json`
(`rewriteRelativeImportExtensions`, `api` included), `vercel.json` (rewrite excludes `/api/`), `vite.config.ts` (`/api` proxy),
`playwright.config.ts` (simulator web server), `package.json` (`ai`, `zod` as dependencies; `dev:api`, `ai:smoke`),
`.env.example`, `.github/workflows/ci.yml` (redis-server; `BE_REQUIRE_REDIS=1`). Removed: `server/interpreter.ts`,
`server/vercel-function.example.ts`, `src/ui/interpreter.ts`. Tests: `tests/unit/ai-*.test.ts` (5 files), `tests/helpers/ai.ts`,
rewritten `tests/unit/nl-online-client.test.ts`, trimmed `tests/unit/nl-llm.test.ts`, extended `tests/unit/no-unsafe-code.test.ts`,
`tests/e2e/v2-online.spec.ts`.

## Commands run and exact results

In [`PROGRESS.md`](PROGRESS.md) (phase 03 entry): typecheck, lint, 400/400 unit tests with `BE_REQUIRE_REDIS=1`, build, size,
verify:hosting, the online-reading browser spec 4/4, the full Playwright suite, an offline `vercel build` whose functions were run
with plain Node, and `npm run ai:smoke` (LIVE: UNVERIFIED).

## Mock vs LIVE model tests

Every inference test used a scripted provider or the AI SDK's `MockLanguageModelV4`: **TESTED MOCK ONLY**. **LIVE: UNVERIFIED.**

## Screenshots and browser/device

[`screenshots/v2-phase03/`](screenshots/v2-phase03/): the composer's consent notice and a simulated reading (desktop 1366x768,
phone 390x844), from the production build in headless Chromium with the local simulator. No real phone, Safari or GPU.

## Known blockers and risks

1. **No credential, no deployment.** Every LIVE item stays UNVERIFIED until the owner privately sets the variables in
   [`AI_SETUP.md`](AI_SETUP.md) and runs `npm run ai:smoke`; deployment needs the owner's authorisation (no Vercel project exists).
   Not a blocker for phases 04-06, which are offline engine work.
2. **V1's pull request JaredVogler2/BeliefEngine#2 (3D part 2) is not in V2.** Merge it before touching `src/render3d/` or
   `src/ui/play/` heavily (procedure at the end of this file). Phases 04-06 add engine code and only small UI hooks.
3. **3D tests are slow on a software rasteriser** (≈3 fps): keep new 3D browser tests short; long traces behind `BE_SLOW_3D=1`.
4. V1 defects D7, D8, D9 ([`V1_AUDIT.md`](V1_AUDIT.md) §12) are still open.

## Next exact code changes (phases 04 + 06 core)

The design, decided now so the next session does not re-derive it:

- **Where state lives.** A Generative Reality run is created with a new option (`reality: true`) that adds `s.v2` (language version,
  entities, applied effects). Classic runs never have `s.v2`, and V1 claims never have the new field, so every V1 hash is
  unchanged (`canonicalize` drops absent keys; the tripwire in `tests/unit/v2-migration.test.ts` must not move).
- **The language** (`src/engine/reality/`): `ontology.ts` (entity kinds and properties from the real scene and simulation, each
  marked *simulated and visible*, *logical only* or *unsupported*), `ast.ts` (AST v2: literal text, author, source provenance,
  day, language version, regions, 1-3 clauses of trigger + optional condition + selector + effect + duration, explicit omissions,
  narrative kept apart; strict validator, canonical form, hash), `operators.ts` (registry: units, legal targets, ranges, tick
  order, cost weight, log text, persistence), `v1.ts` (every V1 `RuleSpec` → AST v2), `balance.ts` (power from magnitude, reach,
  duration, trigger ease and scope → support thresholds, AP and upkeep).
- **The executor**: `execute.ts` runs at night after `computeModifiers` in `core/resolve.ts`, only when `s.v2` exists: evaluate
  triggers (bell rung, beacon lit, smoke fire, rain, night, watchers...), resolve selectors to bounded targets, collect intents,
  resolve opposite pushes by support-weighted sum (never update order), then write V1 `Modifiers` fields (so the existing hazard
  code carries the physical consequences) and entity/world state, with an event per change. A property test must show that a V1
  claim translated to AST v2 yields exactly V1's `computeModifiers` output.
- **New entities** (`entities.ts`, generative runs only): **chickens** (coops near homes; forage by day, roost at night, drown in
  floodwater and are taken by wolves unless airborne; eggs feed the village) and **loose stones** (mass, wetness; light stones near
  workers are hauled to the riverbank and raise it; light stones in floodwater are carried downstream against the bridge).
- **Three proof claims** to make executable first: "Chickens fly when the bell rings" (Redbank: lift at the belltower; survive
  the flood night; wind drift strands some across the river), "Wet stone becomes light beside lanterns" (compound condition;
  hauling raises the bank; the downside batters the bridge), "At night, bell ringing pulls rain toward the orchard and makes local
  flames burn weaker" (compound clause: rain redistribution plus fire damage cut; "orchard" grounds to Redbank's fields, with a
  note saying so).
- Then the ≥150-sentence adversarial corpus as a versioned fixture (`tests/fixtures/reality-corpus-1.json`) with expected labels,
  which phase 05's offline reader and the model contract (`interpret v2`) are scored against.

## Parallel track: the 3D world

[`3D_IMPLEMENTATION_PLAN.md`](3D_IMPLEMENTATION_PLAN.md): stage 0 (merge V1's 3D pull request), stage 1 (draw packs, fire,
smoke, forecast, lens and labels in 3D), stage 2 (time of day). Phase 10 needs chickens and stones drawn in 3D.

## What MUST NOT be rewritten

`src/engine/**` and `tests/fixtures/**` behaviour for Classic (any change that moves a golden hash is a rules change: bump
`RULES_VERSION`, re-record, update the tripwire, say why); `GameSession` as the only mutation path; the `WorldRenderer` observer
contract; save, archive, catalog and MCP run formats, the MCP server name and resources, `localStorage` keys; the offline composer
as the Classic reader and fallback; the `server/ai` checks order (cheap before paid, fail closed) and the no-request-before-consent
rule in `src/ai/client.ts`.

## Private configuration needed (names only, never values)

For LIVE: `BE_AI_ENABLED`, `AI_GATEWAY_API_KEY` (local) or Vercel OIDC (deployed), `BE_SESSION_SECRET`, `BE_ALLOWED_ORIGINS`,
`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` + `KV_REST_API_TOKEN`), optionally
`BE_AI_DAILY_BUDGET_USD`, `BE_ADMIN_TOKEN`; plus an AI Gateway budget in the Vercel dashboard. Never paste a value into a prompt,
an issue, a commit or a `VITE_` variable. Steps: [`AI_SETUP.md`](AI_SETUP.md).

## Current daily inference budget / usage

Application cap: $1.00 per UTC day (default), 3,000 calls per day. Usage so far: 0 calls, 0 tokens, $0.

## Merging V1's 3D part-2 pull request (JaredVogler2/BeliefEngine#2) when it lands

```bash
git fetch https://github.com/JaredVogler2/BeliefEngine main    # after JaredVogler2/BeliefEngine#2 is merged there
git merge FETCH_HEAD                                           # common ancestor 6a92862: ordinary history
```

A trial merge of JaredVogler2/BeliefEngine#2's head (`37ed18a`), made in a scratch copy before phase 03, conflicted in exactly four
files (`README.md`: keep V2's, carry V1's edits into `docs/v1/README.md`; `docs/PROGRESS.md`: keep V2's, carry V1's entries into
`docs/v1/PROGRESS.md`; `docs/3D_VISUAL_STANDARD.md`: keep V2's, save V1's as `docs/v1/3D_VISUAL_STANDARD.md`; `docs/ASSETS.md`:
take V1's new rows, keep the three.js runtime line). Phase 03 touched `src/ui/play/Compose.tsx` and `src/styles.css`, so re-check
those two. Then regenerate the licence inventories (`npx tsx scripts/licenses.ts [--prod] --write`), run the unit suite (the
tripwire must not move), both 3D browser suites, the 2D suite, and recapture the visual matrix.
