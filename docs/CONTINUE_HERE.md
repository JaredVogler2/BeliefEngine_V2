# Continue here

Read this first after any context reset, then [`../prompts/AGENT_RUNBOOK.md`](../prompts/AGENT_RUNBOOK.md) and
[`PROGRESS.md`](PROGRESS.md).

## Phase and status

- **01 V1 audit, 02 migration and baseline: VERIFIED.**
- **03 Provider, auth and budgets: VERIFIED with mocks, a real Redis and an offline `vercel build`. LIVE: UNVERIFIED** (no
  credential exists here; `npm run ai:smoke` refuses and exits 2). **NOT DEPLOYED** (no Vercel project). Details:
  [`AI_SETUP.md`](AI_SETUP.md), [`AI_COSTS.md`](AI_COSTS.md).
- **04 Generative belief language: VERIFIED** (engine gate). Reference: [`REALITY_LANGUAGE.md`](REALITY_LANGUAGE.md).
- **05 Interpreter and compiler: VERIFIED offline and with mocks; LIVE UNVERIFIED.** Generalisation (second held-out corpus,
  scored untuned): 51/80 labels, 13/30 supported sentences read faithfully; V1's composer on the same sentences: 34/80 and 3/30.
- **06 Simulation primitives: IN PROGRESS** (executor, 17 operators, chickens and loose stones verified in engine tests; their 3D
  drawing waits for phase 10).
- **07 Agent cognition and memory: VERIFIED offline and with mocks; LIVE UNVERIFIED.** Reference: [`MINDS.md`](MINDS.md).
- **08 Multi-agent social dynamics: VERIFIED offline and with mocks; LIVE UNVERIFIED** (the gate's "one real provider run makes
  faction behaviour observably different" needs a credential). Reference: [`MINDS.md`](MINDS.md) §6.
- **09 Belief-to-reality bridge: NOT STARTED. It is the next task (below).**

## Last good commit / branch

Branch `claude/gracious-heisenberg-x6dvn1` of `JaredVogler2/BeliefEngine_V2` (open pull request JaredVogler2/BeliefEngine_V2#2),
on top of `main@534448e`. Phase 03: `0344851`; phases 04/06 (engine): `e33209b`; phase 05: `e093c4f` … `70575ad`; phase 07:
`802dbe2` … `d842cc6`; phase 08: the commit after `d842cc6` ("social dynamics that change outcomes").

## Working files changed in phase 08

New: `src/engine/mind/{journal,claims}.ts`, `tests/unit/social-dynamics.test.ts`, `docs/screenshots/v2-phase08/`. Changed:
`mind/{types,decide,policy,run,memory,request,view}.ts` (request_test, lies, faction leanings, social energy, proof moments),
`core/{resolve,actions}.ts` (day and night memories both queue thinkers; competing claims at night and dusk; written-belief limit
counts only the player's), `social/propagation.ts` (social energy; contested stories crowd each other out),
`reality/entities.ts` (eggs feed the coop's household every third dawn), `ui/play/{MindPanel,Panels,RealityCompose}.tsx`,
`styles.css`, `tests/unit/reality-execute.test.ts`, `tests/e2e/v2-minds.spec.ts`, docs.

## Commands run and exact results

In [`PROGRESS.md`](PROGRESS.md) (phase 08 entry): typecheck and lint pass; `BE_REQUIRE_REDIS=1 npm test` 46 files, 541 passed;
`npx playwright test tests/e2e/v2-minds.spec.ts --project=desktop --project=phone` 8 passed, 2 skipped by design; size: entry
276 KB gzip of 300, mind panel 4 KB of 20; V1 golden hashes unchanged.

## Mock vs LIVE model tests

Every model-facing test used a scripted provider or the offline policy standing in for a model: **TESTED MOCK ONLY**.
**LIVE: UNVERIFIED.** Executing ASTs and running villager minds needs no model.

## Screenshots and browser/device

[`screenshots/v2-phase08/`](screenshots/v2-phase08/): a skeptic's open demand for proof, a villager's beliefs beside how they
know them, and the influence journal with a cause chain, on desktop (1366×768) and phone (390×844), from the production build.
Phase 07's are in [`screenshots/v2-phase07/`](screenshots/v2-phase07/).

## Known blockers and risks

1. **No credential, no deployment.** Every LIVE item stays UNVERIFIED until the owner privately sets the variables in
   [`AI_SETUP.md`](AI_SETUP.md) and runs `npm run ai:smoke`; deployment needs the owner's authorisation (no Vercel project exists).
   Phase 08's gate asks for one real provider run making faction behaviour observably different from the policy; it is marked
   LIVE UNVERIFIED.
2. **V2 chapter balance moved** with minds (Harvest Moonlight 4/10 → 9/10, Ashwood Decoy 4/10 → 8/10, Smoke Ring 8/10 → 6/10;
   doing nothing still loses everywhere). Phase 11 owns re-tuning; Classic is unchanged.
3. **Entry bundle**: 276 of 300 KB gzip. New V2 engine code ships in the entry (it must be present wherever a day resolves). If
   headroom runs out, move the V2-only engine to a chunk installed before any V2 run starts (a hook in `resolve.ts`), never after.
4. **V1's pull request JaredVogler2/BeliefEngine#2 (3D part 2) is not in V2.** Merge it before touching `src/render3d/` or
   `src/ui/play/` heavily (procedure at the end of this file).
5. **3D tests are slow on a software rasteriser** (≈3 fps): keep new 3D browser tests short; long traces behind `BE_SLOW_3D=1`.
6. V1 defects D7, D8, D9 ([`V1_AUDIT.md`](V1_AUDIT.md) §12) are still open.
7. The offline reader understands about half of unfamiliar phrasings; the model contracts are where broad comprehension and
   richer villager voices are meant to come from, and they are unmeasured until a provider is configured.

## Next exact code changes (phase 09: imagine → persuade → manifest → consequences)

[`../prompts/09_BELIEF_TO_REALITY_BRIDGE.md`](../prompts/09_BELIEF_TO_REALITY_BRIDGE.md). Most links exist (reader, AST, build,
COMPOSE, V1 propagation and laws, the executor, minds); phase 09 proves the whole chain and closes its gaps.

1. **Preview everything before confirming**: target, effect, radius, duration, upkeep, opposition, the population threshold and
   the distinct supporters required, the catalyst (trigger), and side effects (the clauses' downsides), from engine data.
2. **Confirmation bound to the revision and a hash of the AST**; stale or altered confirmations refused; no double charge.
3. **Distinct supporters and catalysts**: a written law activates only with enough firm believers in the region (V1 thresholds
   with hysteresis) and its trigger present; never because a model said the village believes.
4. **The three proof claims** (flying chickens on the bell crossing a real obstacle; wet stone light beside lanterns, with
   carrying/placement consequences and an end when the lantern goes out; night bell pulling rain toward the orchard and weakening
   flames, with a downside), each executed in engine tests and shown in the browser.
5. **An opponent's counteraction** (phase 08's challenges and competing claims) and **one belief causing unintended harm** that
   makes a different strategy better.
6. **Debrief provenance**: player → first listeners → supporting network → threshold crossed → the property changed → the
   survival or damage it caused, from the log's cause links (`chainOf`).
7. **Tests**: below threshold nothing happens; above threshold with the catalyst the canonical state changes (not only the 3D
   view); opposed laws resolve by support whatever their order; browser full chain for the three claims plus a win and a loss;
   exact replay from stored model outputs with the network off; V1 goldens green.

## Parallel track: the 3D world

[`3D_IMPLEMENTATION_PLAN.md`](3D_IMPLEMENTATION_PLAN.md): stage 0 (merge V1's 3D pull request), stage 1 (draw packs, fire,
smoke, forecast, lens and labels in 3D), stage 2 (time of day). Phase 10 needs chickens and stones drawn in 3D.

## What MUST NOT be rewritten

`src/engine/**` and `tests/fixtures/**` behaviour for Classic (any change that moves a golden hash is a rules change: bump
`RULES_VERSION`, re-record, update the tripwire, say why); `GameSession` as the only mutation path; the `WorldRenderer` observer
contract; save, archive, catalog and MCP run formats, the MCP server name and resources, `localStorage` keys; the offline composer
as the Classic reader and fallback; the `server/ai` checks order (cheap before paid, fail closed) and the no-request-before-consent
rule in `src/ai/client.ts`; villager minds as data the engine records (a model proposes decisions and voices answers, never
writes memories, beliefs or trust); the reality language's closed vocabulary (a new operator, kind or trigger is a language version bump,
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
