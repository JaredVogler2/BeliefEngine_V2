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
- **06 Simulation primitives: VERIFIED (gate)**; hens, stones and the raised bank are drawn in 3D and on the classic map (phase 09).
  Stated limits: turned-aside floodwater is not conserved elsewhere; faster growth has no water demand.
- **07 Agent cognition and memory: VERIFIED offline and with mocks; LIVE UNVERIFIED.** Reference: [`MINDS.md`](MINDS.md).
- **08 Multi-agent social dynamics: VERIFIED offline and with mocks; LIVE UNVERIFIED** (the gate's "one real provider run makes
  faction behaviour observably different" needs a credential). Reference: [`MINDS.md`](MINDS.md) §6.
- **09 Belief-to-reality bridge: VERIFIED offline and with mocks; LIVE UNVERIFIED.** Reference: [`BELIEF_TO_REALITY.md`](BELIEF_TO_REALITY.md).
- **V1's 3D work (JaredVogler2/BeliefEngine#2 and JaredVogler2/BeliefEngine#3) is merged** into V2 (`08877e7`).
- **10 3D visual effects: NOT STARTED. It is the next task (below).**

## Last good commit / branch

Branch `claude/gracious-heisenberg-x6dvn1` of `JaredVogler2/BeliefEngine_V2`. JaredVogler2/BeliefEngine_V2#2 was merged into `main`
at phase 03 (`d9312bc`); everything since is in the open follow-up JaredVogler2/BeliefEngine_V2#3 (`main` merged into the branch
without rewriting history, `2308bda`; it changed no files). Phase 03: `0344851`; phases 04/06 (engine): `e33209b`; phase 05: `e093c4f` … `70575ad`; phase 07:
`802dbe2` … `d842cc6`; phase 08: `e48a7ca`; V1 merge: `08877e7`, `1b7086b`; phase 09: `07e06f7` (engine) and the commit after it
(browser chains, drawing, provenance UI, docs).

## Working files changed in phase 09

New: `src/engine/reality/{preview,project,provenance}.ts`, `src/render/reality2d.ts`, `src/render3d/reality.ts`,
`src/ui/play/Provenance.tsx`, `scripts/record-bridge.ts`, `tests/fixtures/v2-bridge-traces.json`, `tests/unit/belief-bridge.test.ts`,
`tests/e2e/v2-bridge.spec.ts`, `docs/BELIEF_TO_REALITY.md`, `docs/screenshots/v2-phase09/`. Changed: `reality/{execute,entities,
build,operators,read,state}.ts`, `laws/effects.ts` (sinks carry their laws), `world/hazards.ts` (pooled water names its law),
`ai/routines.ts` (prediction includes written beliefs), `render/{MapRenderer,types}.ts`, `render3d/{snapshot,layers,World3D}.ts`,
`ui/play/{RealityCompose,Panels}.tsx`, `ui/screens.tsx` (debrief provenance; a generated village in the reality tab),
`tests/e2e/v2-world3d.spec.ts`, `tests/unit/reality-language.test.ts`, docs.

## Commands run and exact results

In [`PROGRESS.md`](PROGRESS.md) (phase 09 entry): typecheck and lint pass; `BE_REQUIRE_REDIS=1 npm test` 48 files, 576 passed;
`v2-bridge.spec.ts` 7 passed (5 skipped by design); `v2-world3d.spec.ts` on the 3D projects 7 passed; after the V1 merge the
classic suite 160 passed and the 3D suites 39 passed (+2 fixed); size: entry 285 KB gzip of 300; V1 golden hashes unchanged.

## Mock vs LIVE model tests

Every model-facing test used a scripted provider or the offline policy standing in for a model: **TESTED MOCK ONLY**.
**LIVE: UNVERIFIED.** Executing ASTs and running villager minds needs no model.

## Screenshots and browser/device

[`screenshots/v2-phase09/`](screenshots/v2-phase09/), from the production build: the composer's full preview (desktop, and the
compound rain belief on desktop and phone), the law ledger's provenance, the debrief's provenance, the classic map with the hens a law
saved and the raised bank, and the same states in the 3D world (desktop-3d, phone-3d; software WebGL). Earlier phases:
[`v2-phase08/`](screenshots/v2-phase08/), [`v2-phase07/`](screenshots/v2-phase07/).

## Known blockers and risks

1. **No credential, no deployment.** Every LIVE item stays UNVERIFIED until the owner privately sets the variables in
   [`AI_SETUP.md`](AI_SETUP.md) and runs `npm run ai:smoke`; deployment needs the owner's authorisation (no Vercel project exists).
   Phase 08's gate asks for one real provider run making faction behaviour observably different from the policy; it is marked
   LIVE UNVERIFIED.
2. **V2 chapter balance moved** with minds (Harvest Moonlight 4/10 → 9/10, Ashwood Decoy 4/10 → 8/10, Smoke Ring 8/10 → 6/10;
   doing nothing still loses everywhere), and **written beliefs are slow**: 6-9 days to law through the greedy bot, chapters last
   7-9, so they rarely decide a chapter (a written flood ward never became law in Redbank). Phase 11 owns both; Classic is unchanged.
3. **Entry bundle**: 285 of 300 KB gzip. New V2 engine code ships in the entry (it must be present wherever a day resolves). If
   headroom runs out, move the V2-only engine to a chunk installed before any V2 run starts (a hook in `resolve.ts`), never after.
4. **V1's later 3D work is merged**; any further V1 change would merge the same way (procedure at the end of this file). CI now
   has a separate 3D job (software WebGL, about 30-45 minutes).
5. **3D tests are slow on a software rasteriser** (≈3 fps): keep new 3D browser tests short; long traces behind `BE_SLOW_3D=1`.
6. V1 defects D7, D8, D9 ([`V1_AUDIT.md`](V1_AUDIT.md) §12) are still open.
7. The offline reader understands about half of unfamiliar phrasings; the model contracts are where broad comprehension and
   richer villager voices are meant to come from, and they are unmeasured until a provider is configured.

## Next exact code changes (phase 10: make generated laws beautiful and physically honest in 3D)

[`../prompts/10_THREE_D_VISUAL_EFFECTS.md`](../prompts/10_THREE_D_VISUAL_EFFECTS.md). Start from V1's renderer (now merged): capture
the merged renderer against [`3D_VISUAL_STANDARD.md`](3D_VISUAL_STANDARD.md) first (the baseline report predates the merge).

1. **A visual effect registry keyed by event codes and law ids** (`REALITY_EFFECT` with its clause's operator, `CHICKENS_ROSE`,
   `BANK_RAISED`, `STONE_RAMS_BRIDGE`, `WATER_POOLED`, `FIRE_WARDS_COOLED`, `STRAYS_FLEW_HOME`): each plays only for a logged event,
   from positions the engine computed, skippable, reduced-motion aware. Read `render3d/effects.ts` (V1's planner) first.
2. **Forces**: hens rising on the bell night along an arc to the engine's altitude, with ground shadows, drifting with the logged
   wind, coming down at dawn; strays crossing the river.
3. **Materials and water**: light stones' tint and bob, the haul to the bank, the bank's courses rising; pooled water spreading on the
   low ground; flood wards sinking when flames cool.
4. **Fire and temperature**: cooler flames visibly smaller and dimmer where the law acts; hearth smoke thinner.
5. **Social**: villagers gesture when they tell, argue or demand proof (the people layer's `gesture`), filaments only along trust
   edges.
6. **Art pass** to the standard (night and dusk, lanterns as local light, sculpted valley) and the screenshot matrix of the prompt
   (day 1, two activations, compound weather, debate near the bridge, suppressed rule, debrief; 390×844 and 320×568; quality tiers,
   context loss, restart memory). Performance on a real GPU stays UNVERIFIED unless measured on one.

## Parallel track: the 3D world

[`3D_IMPLEMENTATION_PLAN.md`](3D_IMPLEMENTATION_PLAN.md): stage 0 (merge V1's 3D work) is done; stage 1 (draw packs, fire,
smoke, forecast, lens and labels in 3D) and stage 2 (time of day) remain. Hens, stones and the raised bank are drawn (phase 09);
their effects are not yet animated (phase 10).

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

## Merging later V1 changes

V1's `main` up to `22b7b1c` (JaredVogler2/BeliefEngine#2 and JaredVogler2/BeliefEngine#3) was merged on 2026-10-28 as ordinary
history (`08877e7`). Anything newer merges the same way:

```bash
git fetch https://github.com/JaredVogler2/BeliefEngine main
git merge FETCH_HEAD
```

Last time the conflicts were `README.md` (keep V2's; V1's goes to `docs/v1/README.md` with links re-pointed), `docs/PROGRESS.md`
(keep V2's; V1's entries appended to `docs/v1/PROGRESS.md`), the three `docs/3D_*.md` (keep V2's; V1's saved under `docs/v1/`),
`docs/ASSETS.md`, the licence inventories (regenerate: `npx tsx scripts/licenses.ts [--prod] --write`), `src/styles.css` (keep both),
`src/ui/play/Hand.tsx` and `Play.tsx` (V1's HUD with V2's reality button and lazy composer). Then the unit suite (the tripwire must
not move), the classic suite, both 3D suites, and V2's own specs.
