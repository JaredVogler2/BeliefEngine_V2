# Continue here

Read this first after any context reset, then [`../prompts/AGENT_RUNBOOK.md`](../prompts/AGENT_RUNBOOK.md) and
[`PROGRESS.md`](PROGRESS.md).

## Phase and status

- **01 V1 audit, 02 migration and baseline: VERIFIED.**
- **03 Provider, auth and budgets: VERIFIED with mocks, a real Redis and an offline `vercel build`. LIVE: UNVERIFIED** (no
  credential exists here; `npm run ai:smoke` refuses and exits 2). **NOT DEPLOYED** (no Vercel project). Details:
  [`AI_SETUP.md`](AI_SETUP.md), [`AI_COSTS.md`](AI_COSTS.md).
- **04 Generative belief language: VERIFIED** (engine gate). **06 Simulation primitives: IN PROGRESS** (executor, 17 operators,
  chickens and loose stones verified in engine tests; 3D drawing waits for phase 10). Reference:
  [`REALITY_LANGUAGE.md`](REALITY_LANGUAGE.md).
- **05 Interpreter and compiler: NOT STARTED. It is the next task (below).**

## Last good commit / branch

Branch `claude/gracious-heisenberg-x6dvn1` of `JaredVogler2/BeliefEngine_V2` (open pull request JaredVogler2/BeliefEngine_V2#2),
on top of `main@534448e`. Phase 03 is commit `0344851`; phases 04/06 (engine) are the commit that adds `src/engine/reality/` and
[`REALITY_LANGUAGE.md`](REALITY_LANGUAGE.md).

## Working files changed in phases 04/06

New: `src/engine/reality/{ontology,operators,ast,state,balance,execute,entities,ground,build,cost,v1}.ts`,
`tests/helpers/reality.ts`, `tests/unit/reality-{language,execute,properties}.test.ts`, `tests/fixtures/reality-corpus-1.json`,
`docs/REALITY_LANGUAGE.md`. Changed (every change is inert without `s.v2` or the new optional fields, so Classic hashes hold):
`core/types.ts` (`RealityClaim`, `ClaimDef.reality?`, `RunState.v2?`, `CreateRunOptions.reality?/realityLab?`), `core/create.ts`,
`core/resolve.ts` (executor after `computeModifiers`; entity steps at dusk, night, dawn), `core/actions.ts` (`COMPOSE` for
reality claims; cost), `laws/effects.ts` (optional `Modifiers` fields; `stampShield` exported), `world/hazards.ts` (bounded V2
sinks; optional bridge hardness, home shield and fire cut, fireproof villagers), `world/wolves.ts` (optional step change),
`save/serialize.ts` (re-verify reality claims on load), `index.ts` (exports).

## Commands run and exact results

In [`PROGRESS.md`](PROGRESS.md) (phases 04/06 entry): typecheck, lint, 438/438 unit tests with `BE_REQUIRE_REDIS=1`, build and
size (entry 251 of 260 KB gzip), simulation smoke 256/256 with determinism, V1 golden hashes unchanged.

## Mock vs LIVE model tests

Executing a validated AST needs no model. Phase 03's inference tests are **TESTED MOCK ONLY**. **LIVE: UNVERIFIED.**

## Screenshots and browser/device

None new: phases 04/06 are engine-only so far. Phase 03's are in [`screenshots/v2-phase03/`](screenshots/v2-phase03/).

## Known blockers and risks

1. **No credential, no deployment.** Every LIVE item stays UNVERIFIED until the owner privately sets the variables in
   [`AI_SETUP.md`](AI_SETUP.md) and runs `npm run ai:smoke`; deployment needs the owner's authorisation (no Vercel project exists).
   Phase 05 is built and scored offline and with mocks; its LIVE column stays UNVERIFIED.
2. **Entry bundle headroom is 9 KB gzip.** Load the reader v2 and the reality composer with a dynamic `import()` (a separate
   chunk), and add that chunk to `scripts/check-bundle.ts` with its own budget.
3. **V1's pull request JaredVogler2/BeliefEngine#2 (3D part 2) is not in V2.** Merge it before touching `src/render3d/` or
   `src/ui/play/` heavily (procedure at the end of this file); phase 05 adds a composer panel and a run option, so re-check them.
4. **3D tests are slow on a software rasteriser** (≈3 fps): keep new 3D browser tests short; long traces behind `BE_SLOW_3D=1`.
5. V1 defects D7, D8, D9 ([`V1_AUDIT.md`](V1_AUDIT.md) §12) are still open.

## Next exact code changes (phase 05)

1. **Offline reader v2** (`src/engine/reality/read.ts` + data-only `lexicon.ts`): sentence → a reading union, exactly the shape
   the model must return: `supported` (1-3 candidate ASTs, each clause mapped to the words it came from), `ambiguous` (1-2
   choices), `partial` (what is included and what is left out, consent needed), `unsupported` (the absent concept, with up to 2
   honestly related alternatives). Kinds from `KINDS[].words`, anchors from `ANCHOR_WORDS`, absent concepts from `ABSENT`, plus
   phrases per operator, trigger and condition words, negation, quantifiers, strength words, and V1's injection and coercion
   handling (`nl/parse.ts` `sanitizeText`). Ground every candidate with `buildRealityClaim`; never map an absent concept to a
   nearby operator ("reverse time" is not faster crops). Score it against `tests/fixtures/reality-corpus-1.json` in a test with
   floors (supported cases: right kinds, operators and triggers; unsupported: abstains, no invented effect; injection: never
   obeyed) and `npm run reality:corpus` printing the table; record the scores in `PROGRESS.md`.
2. **Model contract `interpret v2`** (`server/ai/tasks/interpret-v2.ts`): a zod schema mirroring the reading union and AST v2,
   instructions carrying the ontology, operator parameters, trigger and condition names, anchors and absent concepts, the
   scenario context (regions, landmark kinds present, features) sent by the client (no private data), the claim as untrusted
   data, no chain of thought. Server-side checks before anything reaches the browser: `validateRealityAst`, grounding against the
   context, a fidelity check against the offline reader (a candidate's target kinds must be named in the text), power recomputed
   by the engine (a model's claimed strength is ignored). Same guarded path as v1 (cooldown, lease, reservation, cache keyed by
   normalized text + language version + context digest); the demo provider is the offline reader v2.
3. **Client and composer**: a Generative Reality run option behind a new `V2_FEATURES.realityRuns` switch (modes proper are phase
   11); a reality composer (lazy chunk): text ≤240, optional region, read offline or online (phase 03 consent), a preview card
   ("You said" / "The game will do": mechanics with units, conditions, duration, support needed, downsides, cost, confidence,
   omissions; choices for ambiguous; consent for partial; alternatives for unsupported); confirm sends `COMPOSE` bound to the run
   revision and the candidate's hash; the AST keeps `source` (reader, model, prompt version, interpretation id) so replays never
   reinterpret.
4. **Tests**: reader corpus floors; server mock tests (structured output, refusal, timeout, injection, ambiguous, unsupported,
   stale confirmation, quota); an integration test where three new sentences yield materially different physics after activation
   in two chapters; a browser test composing a reality belief offline; screenshots of the preview on desktop and phone.

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
