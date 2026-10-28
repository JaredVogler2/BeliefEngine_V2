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
- **08 Multi-agent social dynamics: NOT STARTED. It is the next task (below).**

## Last good commit / branch

Branch `claude/gracious-heisenberg-x6dvn1` of `JaredVogler2/BeliefEngine_V2` (open pull request JaredVogler2/BeliefEngine_V2#2),
on top of `main@534448e`. Phase 03: `0344851`; phases 04/06 (engine): `e33209b`; phase 05: `e093c4f` … `70575ad`; phase 07:
`802dbe2` (minds), `823184f` (decisions), `818bc11` (npc v2 contract, budget), and the commit that adds `docs/MINDS.md`.

## Working files changed in phase 07

New: `src/engine/mind/{types,init,memory,decide,policy,run,request,talk,view}.ts`, `src/ui/play/MindPanel.tsx` (lazy chunk),
`tests/unit/mind-{memory,decide,talk}.test.ts`, `tests/unit/ai-npc-v2.test.ts`, `tests/e2e/v2-minds.spec.ts`, `docs/MINDS.md`,
`docs/screenshots/v2-phase07/`. Changed: `core/{create,resolve,actions,types}.ts` (minds created for V2 runs; captured twice a
day; decisions at dusk; `NPC_DECIDE` and `TALK`), `ai/routines.ts` (evacuation reads early moves and offered floors, V2 only),
`social/persuasion.ts` (reason `NEIGHBOUR_CHALLENGE`), `reality/state.ts` (`minds?`), `server/ai/tasks/npc.ts` + `app.ts`
(contract v2, lists from the engine), `src/ai/client.ts` (`npcDecisions`, `talkReply`), `src/ui/play/Panels.tsx`,
`src/styles.css`, `scripts/check-bundle.ts` (entry 300, mind panel 20).

## Commands run and exact results

In [`PROGRESS.md`](PROGRESS.md) (phase 07 entry): typecheck and lint pass; `BE_REQUIRE_REDIS=1 npm test` 45 files, 524 passed;
`npx playwright test tests/e2e/v2-minds.spec.ts tests/e2e/v2-reality.spec.ts --project=desktop --project=phone` 13 passed, 3
skipped by design; size: entry 270 KB gzip of 300; V1 golden hashes unchanged.

## Mock vs LIVE model tests

Every model-facing test used a scripted provider or the offline policy standing in for a model: **TESTED MOCK ONLY**.
**LIVE: UNVERIFIED.** Executing ASTs and running villager minds needs no model.

## Screenshots and browser/device

[`screenshots/v2-phase07/`](screenshots/v2-phase07/): a villager's mind, a conversation answer, and "who is thinking today" with
the last dusk's decisions, on desktop (1366×768) and phone (390×844), from the production build.

## Known blockers and risks

1. **No credential, no deployment.** Every LIVE item stays UNVERIFIED until the owner privately sets the variables in
   [`AI_SETUP.md`](AI_SETUP.md) and runs `npm run ai:smoke`; deployment needs the owner's authorisation (no Vercel project exists).
   Phase 08's gate asks for one real provider run making faction behaviour observably different from the policy: build and verify
   it offline and with mocks, and mark that part UNVERIFIED.
2. **Entry bundle**: 270 of 300 KB gzip. New V2 engine code ships in the entry (it must be present wherever a day resolves). If
   headroom runs out, move the V2-only engine to a chunk installed before any V2 run starts (a hook in `resolve.ts`), never after.
3. **V1's pull request JaredVogler2/BeliefEngine#2 (3D part 2) is not in V2.** Merge it before touching `src/render3d/` or
   `src/ui/play/` heavily (procedure at the end of this file).
4. **3D tests are slow on a software rasteriser** (≈3 fps): keep new 3D browser tests short; long traces behind `BE_SLOW_3D=1`.
5. V1 defects D7, D8, D9 ([`V1_AUDIT.md`](V1_AUDIT.md) §12) are still open.
6. The offline reader understands about half of unfamiliar phrasings; the model contracts are where broad comprehension and
   richer villager voices are meant to come from, and they are unmeasured until a provider is configured.

## Next exact code changes (phase 08: social dynamics that change outcomes)

Build on phase 07's minds (`src/engine/mind/`); keep every change under `s.v2` and every effect inside V1's rules.

1. **A social journal** (`src/engine/mind/journal.ts` or `social/journal.ts`): who influenced whom, why (trust, evidence,
   faction, a villager's decision, the Keeper), and what reality change followed; selectors and a lazy panel; the debrief reads it.
2. **Factions with incentives**: map the three chapters' factions onto archetypes (empiricists, mystics, civic/merchants) with
   different scoring weights in the policy (empiricists investigate and demand tests, mystics spread and stage, the council weighs
   damage to property), and faction moves that rally members (bounded, telegraphed a day ahead like V1's rivals).
3. **Request evidence and truth tests**: a skeptic's `investigate` or a new `request_test` move that the player can answer with a
   ritual at the right place; eyewitness conversion that propagates to connected neighbours.
4. **NPC claims through the same language**: rare, forecastable, contestable villager-written beliefs (a mayor's competing claim
   after market damage) built with the reality reader/AST and charged against a social allowance; telegraphed, never more than
   one active per faction.
5. **Lies and their discovery**: a villager may misreport to protect family (a decision flagged as untrue in the engine, never in
   their words alone); discovery when a witness's memory contradicts it reduces trust and triggers a rebuttal.
6. **Paired and bounded tests**: identical seed and claim with different social evidence give different, explainable decisions;
   the destroyed bridge stops cross-bank gossip; private testimony stays private; model calls bounded per day; 100 agents / 30
   active laws stay within a time budget; authored win/loss still reachable; replay exact.

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
