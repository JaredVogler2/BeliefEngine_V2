# Continue here

Read this first after any context reset, then [`../prompts/AGENT_RUNBOOK.md`](../prompts/AGENT_RUNBOOK.md) and
[`PROGRESS.md`](PROGRESS.md).

## Phase and status

- **01 V1 audit, 02 migration and baseline: VERIFIED.**
- **03 Provider, auth and budgets: VERIFIED with mocks, a real Redis and an offline `vercel build`. LIVE: UNVERIFIED** (no
  credential exists here; `npm run ai:smoke` refuses and exits 2). **NOT DEPLOYED** (no Vercel project). Details:
  [`AI_SETUP.md`](AI_SETUP.md), [`AI_COSTS.md`](AI_COSTS.md).
- **04 Generative belief language: VERIFIED** (engine gate). Reference: [`REALITY_LANGUAGE.md`](REALITY_LANGUAGE.md).
- **05 Interpreter and compiler: VERIFIED offline and with mocks; LIVE UNVERIFIED.** Offline reader v2 (`offline-v2.2`), the
  `interpret v2` server contract, the lazy reality composer, Generative Reality runs, and an integration test in two villages.
  Generalisation (second held-out corpus, scored untuned): 51/80 labels, 13/30 supported sentences read faithfully; V1's composer
  on the same sentences: 34/80 and 3/30.
- **06 Simulation primitives: IN PROGRESS** (executor, 17 operators, chickens and loose stones verified in engine tests; their 3D
  drawing waits for phase 10).
- **07 Agent cognition and memory: NOT STARTED. It is the next task (below).**

## Last good commit / branch

Branch `claude/gracious-heisenberg-x6dvn1` of `JaredVogler2/BeliefEngine_V2` (open pull request JaredVogler2/BeliefEngine_V2#2),
on top of `main@534448e`. Phase 03 is commit `0344851`; phases 04/06 (engine) `e33209b`; phase 05 is the run of commits from
`e093c4f` (reader) to the one that adds `tests/unit/reality-integration.test.ts`.

## Working files changed in phase 05

New: `src/engine/reality/{read,lexicon,wire,fidelity}.ts`, `server/ai/tasks/interpret-v2.ts`, `api/interpret-reality.ts`,
`src/ui/play/{RealityCompose,online}.tsx`, `scripts/reality-corpus.ts`, `scripts/lib/reality-score.ts`,
`tests/unit/reality-{reader,integration}.test.ts`, `tests/unit/ai-{interpret-v2,reality-client}.test.ts`,
`tests/e2e/v2-reality.spec.ts`, `tests/fixtures/reality-corpus-holdout-{1,2}.json`. Changed: `server/ai/{app,config,vercel}.ts`,
`src/ai/client.ts`, `src/ui/play/{Play,Compose,Hand,screens}.tsx`, `src/engine/progress/options.ts`, `src/v2/features.ts`
(`generativeReality` on), `scripts/check-bundle.ts` (composer chunk budget), and engine fixes the reader and the integration
test exposed in `src/engine/reality/{execute,entities,ground,balance,build,operators,ast}.ts`, `laws/effects.ts` (optional
`bridgeFlow`) and `world/hazards.ts` (bridge damage reads it; absent in Classic).

## Commands run and exact results

In [`PROGRESS.md`](PROGRESS.md) (phase 05 entry): typecheck and lint pass; `BE_REQUIRE_REDIS=1 npm test` 41 files, 475 passed;
`npx playwright test tests/e2e/v2-reality.spec.ts --project=desktop --project=phone` 7 passed, 1 skipped by design; V1 golden
hashes unchanged (`tests/unit/v2-migration.test.ts`).

## Mock vs LIVE model tests

Every `interpret v2` test used a scripted provider or the offline reader standing in for a model: **TESTED MOCK ONLY**.
**LIVE: UNVERIFIED.** Executing a validated AST needs no model.

## Screenshots and browser/device

[`screenshots/v2-phase05/`](screenshots/v2-phase05/): the mode screen, a compound reading, a partial reading and a refusal, on
desktop (1366×768) and phone (390×844), from the production build.

## Known blockers and risks

1. **No credential, no deployment.** Every LIVE item stays UNVERIFIED until the owner privately sets the variables in
   [`AI_SETUP.md`](AI_SETUP.md) and runs `npm run ai:smoke`; deployment needs the owner's authorisation (no Vercel project exists).
   Phase 07's gate asks for six villagers deciding through a real provider: build and verify it offline and with mocks, and mark
   the LIVE part UNVERIFIED.
2. **Entry bundle headroom is about 7 KB gzip** (253 of 260). New UI for phase 07 (a conversation panel) should be a lazy chunk
   with its own budget in `scripts/check-bundle.ts`, as the reality composer is.
3. **V1's pull request JaredVogler2/BeliefEngine#2 (3D part 2) is not in V2.** Merge it before touching `src/render3d/` or
   `src/ui/play/` heavily (procedure at the end of this file).
4. **3D tests are slow on a software rasteriser** (≈3 fps): keep new 3D browser tests short; long traces behind `BE_SLOW_3D=1`.
5. V1 defects D7, D8, D9 ([`V1_AUDIT.md`](V1_AUDIT.md) §12) are still open.
6. The offline reader understands about half of unfamiliar phrasings; the model contract is where broad comprehension is meant to
   come from, and it is unmeasured until a provider is configured.

## Next exact code changes (phase 07: hybrid cognitive villagers)

Everything below lives under `s.v2` (absent in Classic, so Classic hashes hold) and works offline with a deterministic policy;
a model only proposes, through the same schema, and every proposal is validated and recorded as an action so replays never call it.

1. **Minds in the engine** (`src/engine/mind/`): per villager, a personality derived from V1 traits and archetype (curiosity,
   skepticism, ambition, fear, altruism, stubbornness, courage; bounded), goals from role, household and district, and **episodic
   memories** captured from the event log each night: what they witnessed (within sight of the event's tile) or heard (from whom,
   with that person's credibility), salience, valence, the event id as provenance, private or public. Caps per villager, keeping
   high-salience events and every event needed to judge a law; a deterministic summary with source pointers past the cap. Bounded
   personality drift from major events. Save/load and replay cover it.
2. **Decisions** (`src/engine/mind/decide.ts`): an `NpcDecision` schema shared with the server (villager id, input revision,
   intent from an explicit enum: spread, ask, investigate, challenge, comfort, persuade, move, stage evidence, support rescue,
   wait; target ids; one short line; cited memory ids; tone; confidence as an estimate only); `eligibleIntents`, a validator
   (ids exist, intent legal now, cited memories are theirs), and an engine action that applies an accepted decision through the
   existing persuasion and evidence rules (a line of dialogue never changes a belief by itself). A deterministic fallback policy
   proposes in the same schema.
3. **When to think**: salience triggers (a new player claim heard, a contradiction witnessed, a personal loss, a law activating or
   failing, a faction move, the player talking to them, a crisis), a per-day queue of at most a few agents with 1-3 decisions
   each, and a per-run budget; the cheap utility AI handles everyone else.
4. **Server**: `npc` contract v2 in `server/ai/tasks/npc.ts` (memories and eligible intents in the context, structured output,
   ids validated, hallucinated memories refused); the demo provider is the deterministic policy.
5. **Conversation** (lazy UI chunk): select a villager, ask / persuade / challenge / ask for a guess; answers come only from what
   they witnessed or heard (no omniscience), and results are local events resolved by trust and evidence.
6. **Tests**: 50+ mock schema cases (hallucinated person or claim, no such memory, injection, stale revision, contradictory
   evidence); six named villagers given the same claim and evidence choose differently by their memories and personality (offline
   policy); replay of recorded decisions without a model; memories across save/load; 12-20 agents per night within a time budget.

## Parallel track: the 3D world

[`3D_IMPLEMENTATION_PLAN.md`](3D_IMPLEMENTATION_PLAN.md): stage 0 (merge V1's 3D pull request), stage 1 (draw packs, fire,
smoke, forecast, lens and labels in 3D), stage 2 (time of day). Phase 10 needs chickens and stones drawn in 3D.

## What MUST NOT be rewritten

`src/engine/**` and `tests/fixtures/**` behaviour for Classic (any change that moves a golden hash is a rules change: bump
`RULES_VERSION`, re-record, update the tripwire, say why); `GameSession` as the only mutation path; the `WorldRenderer` observer
contract; save, archive, catalog and MCP run formats, the MCP server name and resources, `localStorage` keys; the offline composer
as the Classic reader and fallback; the `server/ai` checks order (cheap before paid, fail closed) and the no-request-before-consent
rule in `src/ai/client.ts`; the reality language's closed vocabulary (a new operator, kind or trigger is a language version bump,
`reality-2`, never a silent change to `reality-1`, whose saves must keep replaying), the executor's order independence and
support-weighted conflicts, and V1 laws running on V1's executor in every run.

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
