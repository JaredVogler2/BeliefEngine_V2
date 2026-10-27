# V2 progress log

One entry per verified checkpoint, newest first. Status words follow [`prompts/AGENT_RUNBOOK.md`](../prompts/AGENT_RUNBOOK.md):
NOT STARTED, IN PROGRESS, IMPLEMENTED UNVERIFIED, VERIFIED, BLOCKED. V1's own build log is [`v1/PROGRESS.md`](v1/PROGRESS.md).

| Phase | Status | Evidence |
|---|---|---|
| 01 V1 audit | **VERIFIED** | [`V1_AUDIT.md`](V1_AUDIT.md); V1 baseline run in a clone ([`BASELINE.md`](BASELINE.md)) |
| 02 Migration and baseline | **VERIFIED** | [`MIGRATION.md`](MIGRATION.md), [`BASELINE.md`](BASELINE.md), `tests/unit/v2-migration.test.ts`, `tests/e2e/v2-world3d.spec.ts` |
| 03 Provider, auth, budgets | **VERIFIED with mocks, a real Redis and an offline `vercel build`; LIVE UNVERIFIED (no credential); NOT DEPLOYED** | [`AI_SETUP.md`](AI_SETUP.md), [`AI_COSTS.md`](AI_COSTS.md), `tests/unit/ai-*.test.ts`, `tests/e2e/v2-online.spec.ts`, [`screenshots/v2-phase03/`](screenshots/v2-phase03/) |
| 04 Generative belief language | **VERIFIED (gate: typed, validated, deterministic, V1-compatible, three novel executable claims, property tests); the interactive preview UI arrives with phase 05's composer** | [`REALITY_LANGUAGE.md`](REALITY_LANGUAGE.md), `tests/unit/reality-language.test.ts`, `tests/unit/reality-properties.test.ts`, `tests/fixtures/reality-corpus-1.json` |
| 05 Interpreter and compiler | **IN PROGRESS: offline reader v2, `interpret v2` contract (TESTED MOCK ONLY), composer UI and Generative Reality runs built and tested; LIVE UNVERIFIED; the offline reader generalises only partly (second held-out corpus, scored untuned: 51/80 labels, 13/30 supported read faithfully)** | entry below, [`screenshots/v2-phase05/`](screenshots/v2-phase05/) |
| 06 Simulation primitives | **IN PROGRESS: executor, 17 operators, chickens and loose stones VERIFIED in engine tests; their 3D drawing and the browser check NOT STARTED (phase 10)** | [`REALITY_LANGUAGE.md`](REALITY_LANGUAGE.md) §7, `tests/unit/reality-execute.test.ts` |
| 07-17 | NOT STARTED | |
| 3D visual track (standard, plan, report) | standard and plan written; implementation NOT STARTED | [`3D_VISUAL_STANDARD.md`](3D_VISUAL_STANDARD.md), [`3D_IMPLEMENTATION_PLAN.md`](3D_IMPLEMENTATION_PLAN.md), [`3D_QUALITY_REPORT.md`](3D_QUALITY_REPORT.md) |

Live model calls so far: **none**. Inference spend so far: **0**. Deployments: **none**.

---

## 2026-10-27 — Phase 05 (in progress): reading any sentence, the model contract and the composer

**What was done**

- **Offline reader v2** (`src/engine/reality/read.ts`, data-only `lexicon.ts`): any sentence → the four answers a model must also
  give (supported / partial / ambiguous / unsupported), with the words each part came from; instructions and markup are removed
  and reported; every candidate is validated and built against the actual village, choosing a region where it can act.
- **`interpret v2`** (`server/ai/tasks/interpret-v2.ts`, `POST /api/interpret-reality`, `api/interpret-reality.ts`): the browser
  names the village (scenario id and seed) and the server rebuilds it itself; the model's schema is generated from the operator
  registry; the server fills in provenance, validates, builds, moves a reading to a region where it can act, and drops readings that
  act on something the sentence never mentions or are powered by something it never names (`fidelity.ts`). Same allowance, lease,
  reservation and fail-closed path as v1; a cache of model outputs re-checked on every read. The demo provider is the offline reader.
- **Browser**: `aiClient.interpretReality` (rebuilds every reading against the live run; `wire.ts`), a lazy **reality composer**
  (`RealityCompose.tsx`, its own 19 KB chunk) showing what the player said beside what the game will do, what is left out, needs,
  support, cost and confidence, with an explicit yes for partial or substitute readings and confirmation bound to the run revision;
  a **Generative Reality** tab on the mode screen (chapters, or Reality Lab, unranked); `V2_FEATURES.generativeReality` on.
- Language and engine fixes found on the way: see the phase 05 checkpoint commit; the preview sentences now agree in number and name
  regions ("rain in The Redbank is called onto Eastbank").

**Corpus results.** In-sample (`reality-corpus-1`, the reader was tuned on it): 172/172 labels. **First held-out**
(`reality-corpus-holdout-1`, 80 sentences written by a separate agent that never saw the reader, its lexicon or the in-sample corpus;
scored once, before any change it could inform): labels **42/80 (52.5%)**; supported sentences read faithfully **6/30 (20%)**;
impossible sentences refused 29/32, with an invented effect for **3/32**; partial readings naming what was left out 3/12; ambiguous
sentences offered a choice 0/6; injected instructions obeyed 0/3; readings that build in their village 24/25. The reader was then
improved against its misses by mechanism (reader `offline-v2.2`), so that corpus is **in-sample from then on** (now 78/80, a
regression floor only).

**Second held-out** (`reality-corpus-holdout-2`, 80 new sentences by another separate agent that read only the language reference,
the AST and operator code and the scenario files; never the reader, lexicon, earlier corpora or scorer), scored **once, untuned**,
against reader `offline-v2.2` before any change it could inform: labels **51/80 (63.8%)**; supported sentences read faithfully
**13/30 (43.3%)**; impossible sentences refused 28/32 with the reason named for 19/32, an invented effect for **1/32**; partial
readings naming what was left out 5/12; ambiguous sentences offered a choice **0/6**; two-clause sentences kept whole 2/5; injected
instructions obeyed **0/7**; readings that build in their village 29/31. This is the number to quote for the offline reader's
generalisation: better than the first measurement, still well short of reliable comprehension. It is honest about what it cannot do
(it refuses rather than invents) far more often than it understands an unfamiliar phrasing.

**Commands and results**

| Command | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass |
| `BE_REQUIRE_REDIS=1 npm test` | 40 files, **459 passed** |
| `npx vitest run tests/unit/ai-interpret-v2.test.ts tests/unit/ai-reality-client.test.ts` | 12 passed (schema, provenance, invented keys and numbers, fidelity, region move, refusals, timeout, shared allowance, cache poisoning) |
| `npm run reality:corpus` / `-- --holdout` / `-- --holdout2` | the tables above |
| `npm run build`, `npm run size` | entry 253 KB gzip (budget 260), reality composer chunk 19 KB (budget 40), 3D chunk 193 KB |
| `npx playwright test tests/e2e/{v2-online,inventor,v2-reality,modes}.spec.ts --project=desktop --project=phone` | **42 passed, 6 skipped** (skips are desktop-only or phone-only by design) |

**Mock vs LIVE:** every `interpret v2` test used a scripted provider or the offline reader as a stand-in: **TESTED MOCK ONLY**. No
model has been called; **LIVE: UNVERIFIED**; model accuracy is **not measured**.

---

## 2026-10-27 — Phases 04 and 06 (engine): the reality language and its night executor

**What was done**

- `src/engine/reality/` ([`REALITY_LANGUAGE.md`](REALITY_LANGUAGE.md)): AST v2 (`reality-1`) with literal text, author,
  provenance, regions, 1-2 clauses (3 in Reality Lab) of trigger + condition + selector + effect + duration, explicit omissions
  and narrative kept apart; a strict validator that never throws; mechanics and belief fingerprints. A world vocabulary built from
  what the simulation really holds (14 kinds marked simulated / logical, 10 absent concepts with reasons, 18 properties with units),
  19 operators (17 executable, 13 families) each with targets, typed ranges, tick order, cost weight, persistence, downside and a
  3D effect key. Balance on V1's power scale (a lantern flood belief costs 40 in both languages), grounding against the actual
  village, V1's pacing rule, a preview with units, needs, risks and omissions.
- The night executor runs only in runs with `s.v2`: triggers read tonight's inputs, selectors resolve to ≤40 targets in the law's
  region, effects become contributions combined per property, opposite pushes resolve by support (order independent), and results
  go into V1's `Modifiers` (plus optional fields absent in Classic) so V1's hazard code carries the consequences. Two new entity
  archetypes exist only in Generative Reality runs: **chickens** (coops, roosting, drowning, wolves, wind, eggs) and **loose
  stones** (mass, wetness, hauling that raises the riverbank for good, floating debris that batters the bridge).
- The three proof beliefs work on Redbank seed 1 against a control run: "Chickens fly when the bell rings" saves the flock that
  the control loses to the flood; "Wet stone becomes light beside lanterns" raises the bank; "At night, bell ringing pulls rain
  toward the orchard and makes local flames burn weaker" (compound) keeps 13 homes standing against the control's 7, at the cost
  of water pooled on the fields. Four runs, four different state hashes.
- `COMPOSE` rebuilds every reality claim from its AST and refuses a stale confirmation, a forged fingerprint or a classic run;
  saves re-verify reality claims on load; the action log replays a reality run exactly with no model.
- Every V1 rule has an AST v2 reading (`v1.ts`): all 11 authored claims and every combination V1's composer offers translate and
  validate; V1 laws keep running on V1's executor so old saves and replays reproduce bit for bit.
- A 172-sentence adversarial corpus (`tests/fixtures/reality-corpus-1.json`, 15 categories, 12 kinds) for phase 05's reader and
  model contract.
- **Found and fixed by the new loop test**: a belief anchored "near the bridge" but written for Eastbank fired an effect event
  while changing nothing (the bridge stands in the river commons), and grounding had accepted it. Anchors now resolve inside the
  law's region in every operator, grounding refuses per region (lanterns, smoke fires and `near` landmarks the region lacks), and
  a clause that changes nothing reports `REALITY_IDLE`.

**Commands and results** (this container: Node 22.22, redis-server 7.0.15)

| Command | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass |
| `BE_REQUIRE_REDIS=1 npm test` | 37 files, **438 passed** (was 400: +20 language and bridge and corpus, +14 executor, +4 property and time tests) |
| `npx vitest run tests/unit/reality-properties.test.ts` | 4 passed: 1,500 seeded beliefs (875 valid, 206 built in Redbank, 669 refused with reasons) and 1,500 corrupted copies, no validator crash, every accepted belief within its bounds; a collapsing law stops acting and its raised bank stays; a flood-triggered law that draws more floodwater fires once a night and never compounds |
| `npm run build`, `npm run size` | pass; entry **251 KB gzip of a 260 KB budget** (was 231: the reality engine is in the entry chunk), 3D chunk 193 KB, CSS 6.3 KB |
| `npm run test:sim:smoke` | 256/256 runs, `SMOKE OK`, determinism 32/32 |
| V1 golden hashes (`tests/unit/v2-migration.test.ts`) | unchanged |

**Mock vs LIVE:** no model is involved in executing a validated AST. No model was called. **LIVE: UNVERIFIED** (unchanged).

**Known limits:** the corpus is checked for shape only until phase 05's reader is scored against it; the same author wrote both,
so its scores will measure regressions, not unbiased accuracy. Chickens and stones are not drawn in 3D yet, so phase 06 stays IN
PROGRESS. The entry bundle has 9 KB gzip of headroom left: phase 05 loads the reader and composer lazily.

---

## 2026-10-27 — Phase 03: the inference service, safe with no credentials

**What was done**

- Checked the current APIs before writing code: `ai@7.0.155` (latest; `generateText` + `Output.object`, `instructions` replaces the
  deprecated `system`), `@ai-sdk/gateway@4.0.128` (API key, else OIDC), the gateway budget and OIDC docs (updated 2026-09-08/10),
  and the public model catalog (496 models; defaults `anthropic/claude-haiku-5.5` $0.10/$0.50 and `anthropic/claude-sonnet-5.5`
  $2/$10 per million tokens). Recorded in [`AI_SETUP.md`](AI_SETUP.md) and [`AI_COSTS.md`](AI_COSTS.md).
- Built `server/ai/` as one transport-free app behind five Vercel Functions in `api/`: `GET /api/ai-status`, `POST /api/session`
  (consent + allowed origin + per-network rate → HMAC-signed 2 h token), `POST /api/interpret-belief` (the V1 vocabulary contract;
  phase 05 adds v2), `POST /api/npc-decision` (validated against each villager's own moves, targets and memories),
  `GET /api/ai-metrics` (operator only). Durable store over the Upstash REST protocol with one atomic Lua reservation across
  session, network, project-call, token and dollar counters; worst-case cost reserved before a call and settled after; **fail
  closed** on any store error; validated-only cache re-validated on read; metering with no text, session, address or key.
- **Found and fixed a deployment defect before deploying**: Vercel's builder keeps `.ts` import paths (verified with
  `vercel build` 65.4.0 offline), so functions importing `../server/*.ts` crash with `ERR_MODULE_NOT_FOUND`;
  `rewriteRelativeImportExtensions` fixes it, and `tests/unit/ai-functions.test.ts` (mutation-checked) keeps it fixed. The SPA
  rewrite now leaves `/api/` to the functions (audit hole H12).
- Browser: `src/ai/client.ts` (same-origin, token in memory only, nothing sent until the player opts in) replaced V1's
  `src/ui/interpreter.ts` and its build-time `VITE_INTERPRETER_URL`; the composer gained a consent notice (what leaves the device,
  who pays, offline always works) and labels every online reading with its source, "simulated (no model)" for the scripted
  provider. `V2_FEATURES.serverInference` is now on (an offer, not a default). V1's in-memory proxy was removed.
- Local simulator `npm run dev:api` (same app; scripted provider with `BE_AI_DEV_PROVIDER=mock`); `npm run ai:smoke` for the LIVE
  test (refuses and exits 2 without a credential); `.env.example` with names only; CI now installs `redis-server` and requires
  the real-Redis tests.

**Commands and results** (this container: Node 22.22, redis-server 7.0.15, Chromium 1243)

| Command | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass |
| `BE_REQUIRE_REDIS=1 npm test` | 34 files, **400 passed** (was 364: +47 inference tests in five new files, +2 secret guards, the 14 V1 proxy tests removed with the proxy, the 4 V1 client tests rewritten as 5) |
| `npx vitest run tests/unit/ai-store.test.ts` | 8 passed, incl. 100 racing reservations from 4 clients on real Redis → exactly 10 admitted, counters exact |
| `npx vitest run tests/unit/ai-app.test.ts` | 22 passed, incl. 100 simultaneous requests through 4 app instances sharing one store (memory and real Redis): provider calls = the per-network quota (60), never more |
| `npm run build`, `npm run size` | pass; entry 231 KB gzip (was 228), no credential name, gateway host or SDK code in the bundle |
| `npm run verify:hosting` | hosting configuration verified (CSP, headers, flows) |
| `npx playwright test tests/e2e/v2-online.spec.ts --project=desktop` | 4 passed (Classic makes no `/api` request; consent; simulated reading labelled; not configured; provider failure spends nothing) |
| `vercel build` (CLI 65.4.0, offline, scratch copy) | 5 functions (`nodejs24.x`) + static site; each built function imported and called with plain Node: `disabled` unconfigured, `quota_unavailable` with an unreachable store |
| `npm run ai:smoke` | `LIVE: UNVERIFIED` (no credential), exit 2, nothing called |
| `npx playwright test` (full) | **149 passed, 59 skipped, 0 failed** in 8.9 min (was 145/55: the 4 online-reading tests pass on desktop and skip on phone) |

**Mock vs LIVE:** every inference test used a scripted provider or the AI SDK's `MockLanguageModelV4`: **TESTED MOCK ONLY**. No model
has been called. **LIVE: UNVERIFIED.** No Vercel project exists for this repository: **NOT DEPLOYED.**

**Known limits:** no CAPTCHA/BotID (sessions are rate-limited per network; project-wide call and dollar caps bound the total); the
Upstash REST protocol is exercised through a local shim over real Redis, not against Upstash itself; costs in `AI_COSTS.md` are
list-price arithmetic, not measurements.

---

## 2026-10-27 — Phases 01 and 02: V1 audited, imported and verified

**What was done**

- Audited V1 `main@6a92862` (its CI run on that commit: success) with four read-only code audits and hand spot-checks of the
  claims the audit leans on; ran V1's whole baseline in a throw-away clone. Inspected V1's open
  [JaredVogler2/BeliefEngine#2](https://github.com/JaredVogler2/BeliefEngine/pull/2) (3D part 2, unmerged, still receiving commits) and
  left it for a later ordinary merge ([`V1_AUDIT.md`](V1_AUDIT.md) §16).
- Imported V1 with its 67-commit history as an unrelated-history merge (`a5c1c8a`); V1's prompts, README and build log relocated under
  `prompts/v1/` and `docs/v1/`; four raw tournament archives (444 KB) left out. Nothing was written to the V1 repository.
- Identity (`cc0389c`): package `belief-engine-v2` `2.0.0-alpha.0`, page title, a "V2" mark on the title screen; save, archive, catalog
  and MCP identifiers deliberately unchanged. Fixed V1's missing three.js attribution (licence inventory, `docs/ASSETS.md`, Credits).
- Added `src/v2/features.ts` (every V2 capability off), `tests/unit/v2-migration.test.ts` (pins the V1 golden values; mutation-checked)
  and `tests/e2e/v2-world3d.spec.ts` (the first browser tests that draw the Three.js world: V1's browser tests all ran on the 2D map).
- Wrote the V2 records: audit, migration, baseline, architecture, the 3D visual standard (from the owner's lantern-lit canyon
  reference and the Web-graphics standard), the 3D implementation plan and the 3D quality report with real captures.

**Commands and results** (full table in [`BASELINE.md`](BASELINE.md))

| Command | Result |
|---|---|
| `npm ci`, `npm run typecheck`, `npm run lint` | pass |
| `npm test` | 29 files, **364 passed** (V1: 356) |
| `npm run build`, `npm run size` | pass; 228 / 193 / 6.2 KB gzip within budgets |
| `npm run test:sim:smoke` | 256/256, `SMOKE OK`, output identical to V1's |
| `npm run replay:example` (both routes) | identical hashes |
| `npm run mcp:demo`, `npm run acceptance:mcp`, `scripts/nl-demo.ts` | identical to V1; Journey B 28/28 |
| `npx playwright test` | see [`BASELINE.md`](BASELINE.md) |
| `BE_SLOW_3D=1 npx playwright test tests/e2e/v2-world3d.spec.ts --project=desktop` | 3 passed (incl. the two-day route clicked in 3D: identical hashes), 1 skipped (phone-only test), 7.7 min |

**Mock vs LIVE:** no model was called. V1's mocked-provider tests (`nl-llm` 19, `nl-online-client` 4) pass: TESTED MOCK ONLY.

**Found and recorded, not fixed** (they are V1 behaviour, and the baseline must equal V1): defects D1-D13 in
[`V1_AUDIT.md`](V1_AUDIT.md) §12, among them Settings → "Restart this seed" dropping the run's mode, the archive dropping the Inventor
mark, payload-blind MCP idempotency keys, and a 3D world that does not draw wolf packs, live fire, smoke, the lens or the forecast.
