# Continue here

Read this first after any context reset, then [`../prompts/AGENT_RUNBOOK.md`](../prompts/AGENT_RUNBOOK.md) and
[`PROGRESS.md`](PROGRESS.md).

## Phase and status

- **01 V1 audit, 02 migration and baseline: VERIFIED.**
- **03 Provider, auth and budgets: VERIFIED with mocks, a real Redis and an offline `vercel build`. LIVE: UNVERIFIED** (no
  credential exists here; `npm run ai:smoke` refuses and exits 2). **NOT DEPLOYED** (no Vercel project). Details:
  [`AI_SETUP.md`](AI_SETUP.md), [`COST_AND_QUOTAS.md`](COST_AND_QUOTAS.md).
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
- **10 3D visual effects: IN PROGRESS.** The effect registry and three physical laws drawn as the engine computed them are
  **VERIFIED** (unit tests over the recorded chains; both 3D browser suites, 46 passed). The gate's "looks like premium real-time
  gameplay" is **NOT MET** by my own reading (daylight diorama; the art stages 1-9 of [`3D_IMPLEMENTATION_PLAN.md`](3D_IMPLEMENTATION_PLAN.md)
  remain); GPU and phone frame times **UNVERIFIED**. Reference: [`3D_EFFECTS.md`](3D_EFFECTS.md).
- **11 Generative gameplay and balance: VERIFIED offline (gate met by measurement); LIVE UNVERIFIED** (the gate's "the model adds
  strategic variety" needs a provider). Written-belief rules 2 are recorded per run (older runs keep rules 1 and replay exactly).
  Reference: [`GAMEPLAY_V2.md`](GAMEPLAY_V2.md); tournament reports in [`data/tournament-v2/`](data/tournament-v2/).
- **12 Desktop and iPhone UX: VERIFIED in Chromium** (desktop 1366×768, the phone profile and four iPhone sizes); WebKit, the
  iPhone 14 profile and Firefox run the new Generative Reality smoke in CI only; **real iPhone Safari UNVERIFIED**; the dialog
  staying above the iOS keyboard UNVERIFIED (no device). Reference: [`UX_V2.md`](UX_V2.md).
- **13 MCP and tool play: VERIFIED locally** (stdio, the official SDK client, on the browser's hash); online reading through MCP
  **TESTED MOCK ONLY**; a model-powered V2 agent session NOT RUN; remote Streamable HTTP **NOT BUILT**. Reference: [`MCP_V2.md`](MCP_V2.md).
- **14 Replay, persistence and evals: VERIFIED offline (gate met)**; LIVE evals not run. Reference: [`REPLAY_V2.md`](REPLAY_V2.md).
- **15 Security, privacy, cost and failure: VERIFIED with scripted providers and a real Redis; LIVE UNVERIFIED; NOT DEPLOYED.**
  References: [`SECURITY.md`](SECURITY.md), [`PRIVACY.md`](PRIVACY.md), [`COST_AND_QUOTAS.md`](COST_AND_QUOTAS.md).
- **16 Integration and release testing: integrated but not live-tested** (journeys A-F PASS offline and with scripted providers;
  LIVE UNVERIFIED; NOT DEPLOYED). References: [`FINAL_ACCEPTANCE.md`](FINAL_ACCEPTANCE.md), [`RELEASE.md`](RELEASE.md).
- **17 Adversarial fun review: done (review, not a gate): two P0 and five P1 issues found and fixed, verified offline, with mocks
  and in Chromium; FUN SUBJECTIVE/UNVERIFIED (no playtest); LIVE UNVERIFIED; NOT DEPLOYED.** Written-belief rules 3 and reader
  `offline-v2.3` for new runs; rules 1 and 2 runs replay exactly. Reference: [`FUN_REVIEW_V2.md`](FUN_REVIEW_V2.md).
- **V2 is not complete** by the program's strict finish: no real provider call, no deployment, no human playtest, the premium 3D
  look not met. Everything else is built and verified offline. What is left needs the owner (below).

## Last good commit / branch

Branch `claude/gracious-heisenberg-x6dvn1` of `JaredVogler2/BeliefEngine_V2`. JaredVogler2/BeliefEngine_V2#2 was merged into `main`
at phase 03 (`d9312bc`); everything since is in the open follow-up JaredVogler2/BeliefEngine_V2#3 (`main` merged into the branch
without rewriting history, `2308bda`; it changed no files). Phase 03: `0344851`; phases 04/06 (engine): `e33209b`; phase 05: `e093c4f` … `70575ad`; phase 07:
`802dbe2` … `d842cc6`; phase 08: `e48a7ca`; V1 merge: `08877e7`, `1b7086b`; phase 09: `07e06f7` (engine) and the commit after it
(browser chains, drawing, provenance UI, docs); phase 10: `48693d1` (effect registry, lifts) and the commit after it (hen model,
matrix, docs, `39ab15b`); phase 11: `e9d6847` (rules 2, modes, tournament, docs); phase 12: the commit after `e9d6847` (menu,
composer draft and Stop, who tells it first, villager glance and Why?, retry in mode, phone and keyboard work, docs: `49beb00`);
phase 13: `6ba4996` (MCP V2 tools, error kinds, online reader, stdio proof, docs); phase 14: `c656869` (ledger, saves, replay
check, privacy controls, evals); phase 15: `bd223ed` (chaos suite, physics limits, secret scan in CI, privacy routing, cost
monitor, SECURITY/PRIVACY/COST_AND_QUOTAS). JaredVogler2/BeliefEngine_V2#3 was merged into `main` at phase 14 (`dc56db9`); phase 15
onwards is in JaredVogler2/BeliefEngine_V2#4 (`main` merged into the branch at `877a3a2`, no file changes; history never rewritten).
Phase 16: `9946f67`, `bef3af9`, `5132f26` (journey tests, sim-v2, FINAL_ACCEPTANCE, RELEASE). Phase 17: `d3b83c1` (the fixes:
rules 3, effect fidelity, price truth, ideas, offers, reader v2.3) and the commit after it (FUN_REVIEW_V2, the reader's speed-up, the
sim re-run, docs).

## Working files changed in phase 17

New: `src/engine/reality/ideas.ts`, `scripts/fun-review-v2.ts`, `tests/unit/reality-rules3.test.ts`, `tests/e2e/v2-review.spec.ts`,
`tests/fixtures/{novice-holdout-3,novice-dev-4,v2-bridge-traces-rules2}.json`, `docs/FUN_REVIEW_V2.md`, `docs/data/fun-review-v2/`,
`docs/data/tournament-v2/rules3-*`, `docs/screenshots/v2-phase17/`. Changed: `src/engine/reality/{balance,cost,build,preview,state}.ts`
(rules 3: coverage pricing, the charge from the whole power, "Every night"/"any home", the acting reach), `src/engine/core/create.ts`
(a Living Village always under rules 2), `src/engine/reality/fidelity.ts` (the effect held to the words: `changesNamed`), `src/engine/
reality/{read,lexicon,ast}.ts` (reader v2.3: flavour as narrative, helpful offers, place words, merged repeats, anchor phrases indexed
by word, `sameChange`), `src/ui/play/RealityCompose.tsx` (village ideas, "kept as words only", no repeated left-out note),
`scripts/{eval,sim-v2}.ts`, `tests/fixtures/{v2-bridge-traces,npc-cases-1}.json` (re-recorded / regenerated), the tests named in
[`FUN_REVIEW_V2.md`](FUN_REVIEW_V2.md), `tests/e2e/v2-world3d.spec.ts` (a person-click aimed only where the raycast answers with them).

## Working files changed in phase 16

New: `tests/unit/journeys-v2.test.ts`, `tests/e2e/v2-journeys.spec.ts`, `scripts/sim-v2.ts`, `docs/FINAL_ACCEPTANCE.md` (V2),
`docs/RELEASE.md`, `docs/data/sim-v2/REPORT.md`, `docs/screenshots/v2-phase16/`. Moved: V1's `docs/FINAL_ACCEPTANCE.md` to
`docs/v1/FINAL_ACCEPTANCE.md` (references repointed, including three engine comments). Changed: `tests/unit/mcp-v2-stdio.test.ts`
(journey E), `playwright.config.ts` and `package.json` (WebKit iPhone SE and 14 Pro Max in the cross-browser smoke;
`test:sim:v2`), `scripts/verify-hosting.ts` (a Generative Reality run under the production CSP), `README.md`, `docs/README.md`.

## Working files changed in phase 15

New: `tests/unit/{security-chaos,scan-secrets,ai-monitor}.test.ts`, `scripts/scan-secrets.ts`, `scripts/ai-monitor.ts`,
`server/ai/monitor.ts`, `docs/SECURITY.md`, `docs/PRIVACY.md`; `docs/AI_COSTS.md` renamed to `docs/COST_AND_QUOTAS.md` and rewritten.
Changed: `src/engine/save/serialize.ts` (impossible entity counts refused at load; living-hen cap), `src/engine/reality/{lexicon,read}.ts`
(`absolute` for "the whole world", `measure` for a number with a unit), `server/ai/sdk-provider.ts` (privacy routing; the
`no_providers_available` error), `server/ai/{config,vercel,app,meter}.ts` (`BE_AI_ZERO_RETENTION`, routing in the status, refusals
metered, the lease released on a refusal, spend per model, fallbacks), `src/ui/play/online.tsx` (one consent line),
`.github/workflows/ci.yml` (full-depth checkout; the scan before the tests and after the build), `package.json` (`scan:secrets`,
`ai:monitor`), `.env.example`, `tests/unit/{ai-app,ai-sdk-provider}.test.ts`.

## Working files changed in phase 14

New: `src/engine/save/ledger.ts`, `src/engine/core/meta.ts`, `src/ui/ReplayCheck.tsx`, `scripts/verify-replay.ts`, `scripts/eval.ts`,
`scripts/lib/npc-cases.ts`, `tests/unit/{ledger,ledger-save,evals}.test.ts`, `tests/fixtures/npc-cases-1.json`, `docs/REPLAY_V2.md`,
`docs/data/evals/`, `docs/screenshots/v2-phase14/`. Changed: `src/engine/core/{session,actions,types}.ts` (the ledger in the session;
`InferenceMeta` cleaned before it is recorded), `src/engine/save/serialize.ts` (the ledger beside the state), `src/engine/index.ts`,
`src/ui/store.ts` (save/restore the ledger, delete game/everything), `src/ui/screens.tsx` (replay check, Your data, Restart keeps the
mode, Credits line), `src/ui/play/RealityCompose.tsx` (online metadata), `mcp/service.ts` (run files carry and verify the ledger;
export_replay returns it), `tests/e2e/v2-bridge.spec.ts`, `tests/e2e/v2-ux.spec.ts`, `tests/unit/mcp-v2.test.ts`, `package.json`
(`npm run eval`).

## Working files changed in phase 13

New: `mcp/v2.ts` (variants, error kinds, reading/region/object/graph/rule views), `mcp/online.ts` (the inference service in-process,
off by default), `tests/unit/mcp-v2.test.ts`, `tests/unit/mcp-v2-stdio.test.ts`, `scripts/mcp-v2-session.ts`, `docs/MCP_V2.md`,
`docs/data/mcp/v2-hens-session.md`. Changed: `mcp/service.ts` (the tools), `mcp/server.ts` (registrations, async runner, the online
reader from the environment), `mcp/guide.ts` (rules and tool guide for V2), `docs/MCP.md` (pointer).

## Working files changed in phase 12

New: `src/ui/play/TellFirst.tsx` (who tells it first), `src/ui/viewport.ts` (visual viewport → `--vvh`/`--vvt`),
`tests/e2e/v2-ux.spec.ts`, `docs/UX_V2.md`, `docs/screenshots/v2-phase12/`. Changed: `src/ui/play/RealityCompose.tsx` (draft kept in
`store.ui.realityDraft`, Stop, manual retry, the tell-first step), `src/ui/play/Panels.tsx` (villager glance, `showEvent`, the log's
focused event), `src/ui/screens.tsx` (menu modes, reading explainer, New seed keeps the mode), `src/ui/store.ts` (`realityDraft`,
`keepDraft`, `logFocus`), `src/ui/play/Provenance.tsx` (what it cost), `src/ai/client.ts` (a player's Stop ends as `cancelled`),
`src/engine/core/selectors.ts` (`BeliefView.whyEvent`), `src/engine/reality/provenance.ts` (`harm`), `src/engine/progress/options.ts`
(`v2ModeOf`), `src/main.tsx`, `src/styles.css`, the three V2 specs that write a belief (they close the new step), `smoke.spec.ts`
(a Generative Reality run for CI's WebKit/iPhone/Firefox), `tests/unit/{ai-reality-client,belief-bridge}.test.ts`.

## Working files changed in phase 11

New: `src/engine/reality/{demonstrate,twin,harm}.ts`, `src/engine/ai/bots/reality.ts`, `scripts/tournament-v2.ts`,
`tests/unit/gameplay-v2.test.ts`, `tests/e2e/v2-modes.spec.ts`, `tests/fixtures/v2-bridge-traces-rules1.json` (the phase 09 chains
as recorded under rules 1), `docs/GAMEPLAY_V2.md`, `docs/data/tournament-v2/`, `docs/screenshots/v2-phase11/`. Changed:
`reality/{balance,build,read,state}.ts` (rules 2, the authored floor, every-hamlet beliefs, demonstrations), `core/{actions,create,
memory,resolve,types}.ts` (`stagingOmen`, `realityRules`/`living` options, `law_harmed` memories, the harm step), `mind/{claims,
decide,types}.ts` (leaders against harm, six thinkers in a Living Village), `progress/{progress,types,options}.ts` (records per mode,
invented laws in the atlas), `ai/bots/generic.ts` (tactics exported; staging omens), `ui/play/{Hand,Panels}.tsx`, `ui/screens.tsx`,
`tests/fixtures/v2-bridge-traces.json` (re-recorded under rules 2), `tests/unit/{belief-bridge,reality-properties}.test.ts`, docs.

## Commands run and exact results

Phase 17 (entry in [`PROGRESS.md`](PROGRESS.md)): `npm test` 60 files, 684 passed; the V2 browser specs on desktop and phone 52
passed, 20 skipped; `v2-review.spec.ts` 6 passed; the V2 3D specs on desktop-3d 4 passed; `test:sim:v2` 620 of 620 replayed exactly
under rules 3; the rules-3 tournament published; reading p50 2.5 ms. Phase 16: `npm test` 59 files, 670 passed; the whole Chromium suite 195 passed, 73 skipped, 0 failed;
`test:sim:v2` 620 of 620 replayed exactly; `test:sim:smoke` 256/256; hosting verified with a Generative Reality run. Phase 15: lint and typecheck clean; `npm test` 58 files, 662 passed; the consent-touching browser specs (desktop and phone) 42 passed, 14 skipped, 0 failed; entry
295 KB gzip of 300; the secret
scan clean over the tree, the history and `dist/`. Phase 14: `npm test` 56 files, 641 tests (two timing-sensitive ones need a quiet machine);
the whole Chromium suite 192 passed, 72 skipped, 0 failed; `npm run eval` (report in `docs/data/evals/`). Phase 13 (entry in [`PROGRESS.md`](PROGRESS.md)): the MCP tests 62 passed (V1's 45 unchanged); the stdio proof ends on the
browser's state hash; `npm test` 52 files, 625 passed. In [`PROGRESS.md`](PROGRESS.md) (phase 12 entry): typecheck and lint pass; `npm test` 50 files, 608 passed; `v2-ux.spec.ts` and
`smoke.spec.ts` 21 passed (7 skipped by design); the whole Chromium suite 189 passed, 71 skipped, 0 failed; size: entry 292 KB gzip
of 300; V1 golden hashes unchanged (Classic engine untouched).

## Mock vs LIVE model tests

Every model-facing test used a scripted provider or the offline policy standing in for a model: **TESTED MOCK ONLY**.
**LIVE: UNVERIFIED.** Executing ASTs and running villager minds needs no model.

## Screenshots and browser/device

[`screenshots/v2-phase12/`](screenshots/v2-phase12/), production build, Chromium: the main menu (desktop, phone), the reality tab with
the reading explainer, who tells it first (desktop and 320/375/390/430 wide), the composer preview at each phone width, the villager
glance, the log opened by "Why?", and the outage fallback. [`screenshots/v2-phase11/`](screenshots/v2-phase11/): the mode screen, a Living Village conversation, a written belief offered for
staging at the bell tower (desktop and phone, production build). [`screenshots/v2-phase10/`](screenshots/v2-phase10/): the 3D effect
matrix. [`screenshots/v2-phase09/`](screenshots/v2-phase09/), from the production build: the composer's full preview (desktop, and the
compound rain belief on desktop and phone), the law ledger's provenance, the debrief's provenance, the classic map with the hens a law
saved and the raised bank, and the same states in the 3D world (desktop-3d, phone-3d; software WebGL). Earlier phases:
[`v2-phase08/`](screenshots/v2-phase08/), [`v2-phase07/`](screenshots/v2-phase07/).

## Known blockers and risks

1. **No credential, no deployment.** Every LIVE item stays UNVERIFIED until the owner privately sets the variables in
   [`AI_SETUP.md`](AI_SETUP.md) and runs `npm run ai:smoke`; deployment needs the owner's authorisation (no Vercel project exists).
   Phase 08's gate asks for one real provider run making faction behaviour observably different from the policy; it is marked
   LIVE UNVERIFIED.
2. **V2 balance** (phase 11): written beliefs now decide chapters (Redbank 27/30, Harvest 28/30, Ashwood 21/30 for the best written
   plan); the strongest written law in each chapter does what one of the chapter's own stories does (priced at least as high);
   Harvest's growth belief leaves about 3.5 idle days once it holds (dead time). Generated villages were not in the tournament.
   Classic is unchanged.
3. **Entry bundle**: 296 of 300 KB gzip (measured at phase 17). New V2 engine code ships in the entry (it must be present wherever a day resolves). If
   headroom runs out, move the V2-only engine to a chunk installed before any V2 run starts (a hook in `resolve.ts`), never after.
4. **V1's later 3D work is merged**; any further V1 change would merge the same way (procedure at the end of this file). CI now
   has a separate 3D job (software WebGL, about 30-45 minutes).
5. **3D tests are slow on a software rasteriser** (≈3 fps): keep new 3D browser tests short; long traces behind `BE_SLOW_3D=1`.
6. V1 defects D7, D8, D9 ([`V1_AUDIT.md`](V1_AUDIT.md) §12) are still open.
7. The offline reader understands about half of a first-time player's sentences (35 of 69 written blind, phase 17); the model
   contracts are where broad comprehension and richer villager voices are meant to come from, and they are unmeasured until a
   provider is configured.
8. **Ashwood is harder under rules 3**: the three-hamlet smoke ward now costs the 3 Influence it always showed; the best bot policy
   wins 15 of 30 seeds (phase 11: 21). A measurement of bots, not people.
9. Open P2s from phase 17: a doubter's model-proposed "spread" is logged as telling the story (text in hashed events: needs a minds
   version); "never" is not named as a promise; skeptics rarely act; the phone's low 3D tier reads as blocks and outlines.

## Next exact actions

All seventeen program phases have been worked. What remains needs the owner, or a person:

1. **LIVE**: configure a credential privately ([`RELEASE.md`](RELEASE.md) §4), run `npm run ai:smoke` and the live checklist in
   [`FINAL_ACCEPTANCE.md`](FINAL_ACCEPTANCE.md); then `npx tsx scripts/fun-review-v2.ts` with a real model behind the server (compare
   no-key and live) and record the results there, never before they exist.
2. **Deployment**: only with the owner's authorisation ([`RELEASE.md`](RELEASE.md)).
3. **A human playtest** by [`PLAYTEST_PROTOCOL.md`](PLAYTEST_PROTOCOL.md), phone first, uncoached; record first sentences (with consent)
   to measure the reader where it matters.
4. **Code that can still be done without the owner**: the phase 17 P2s above; the 3D art stages ([`3D_IMPLEMENTATION_PLAN.md`](3D_IMPLEMENTATION_PLAN.md));
   reader coverage measured only on new blind sets (never quote the dev set).

## Parallel track: the 3D world

[`3D_IMPLEMENTATION_PLAN.md`](3D_IMPLEMENTATION_PLAN.md): stage 0 (merge V1's 3D work) is done; stage 1 is mostly done (wolf packs,
fire, smoke and ash are drawn: `src/render3d/hazards.ts`; the forecast and the social lens reach the 3D world; a lost graphics context
is told to the player and the pixel density is followed); high contrast in 3D, labels and the console-warning watcher remain of stage 1,
then stage 2 (time of day), and with them phase 10's "premium" bar. Written laws'
effects are drawn and animated from logged events (phase 10, [`3D_EFFECTS.md`](3D_EFFECTS.md)).

## What MUST NOT be rewritten

`src/engine/**` and `tests/fixtures/**` behaviour for Classic (any change that moves a golden hash is a rules change: bump
`RULES_VERSION`, re-record, update the tripwire, say why); `GameSession` as the only mutation path; the `WorldRenderer` observer
contract; save, archive, catalog and MCP run formats, the MCP server name and resources, `localStorage` keys; the offline composer
as the Classic reader and fallback; the `server/ai` checks order (cheap before paid, fail closed) and the no-request-before-consent
rule in `src/ai/client.ts`; villager minds as data the engine records (a model proposes decisions and voices answers, never
writes memories, beliefs or trust); the reality language's closed vocabulary (a new operator, kind or trigger is a language version bump,
`reality-2`, never a silent change to `reality-1`, whose saves must keep replaying), the executor's order independence and
support-weighted conflicts, and V1 laws running on V1's executor in every run; the written-belief rules versions (a change to how
written beliefs are priced, staged or punished is a new `REALITY_RULES`, gated by `realityRules(s)`, never a silent change to an
existing version: every run records its version and older runs must replay exactly).

## Private configuration needed (names only, never values)

For LIVE: `BE_AI_ENABLED`, `AI_GATEWAY_API_KEY` (local) or Vercel OIDC (deployed), `BE_SESSION_SECRET`, `BE_ALLOWED_ORIGINS`,
`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` + `KV_REST_API_TOKEN`), optionally
`BE_AI_DAILY_BUDGET_USD`, `BE_AI_CALLS_PER_DAY`, `BE_ADMIN_TOKEN`, `BE_AI_ZERO_RETENTION` (Pro/Enterprise); plus an AI Gateway
budget in the Vercel dashboard. Never paste a value into a prompt,
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
