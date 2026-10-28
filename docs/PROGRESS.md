# V2 progress log

One entry per verified checkpoint, newest first. Status words follow [`prompts/AGENT_RUNBOOK.md`](../prompts/AGENT_RUNBOOK.md):
NOT STARTED, IN PROGRESS, IMPLEMENTED UNVERIFIED, VERIFIED, BLOCKED. V1's own build log is [`v1/PROGRESS.md`](v1/PROGRESS.md).

| Phase | Status | Evidence |
|---|---|---|
| 01 V1 audit | **VERIFIED** | [`V1_AUDIT.md`](V1_AUDIT.md); V1 baseline run in a clone ([`BASELINE.md`](BASELINE.md)) |
| 02 Migration and baseline | **VERIFIED** | [`MIGRATION.md`](MIGRATION.md), [`BASELINE.md`](BASELINE.md), `tests/unit/v2-migration.test.ts`, `tests/e2e/v2-world3d.spec.ts` |
| 03 Provider, auth, budgets | **VERIFIED with mocks, a real Redis and an offline `vercel build`; LIVE UNVERIFIED (no credential); NOT DEPLOYED** | [`AI_SETUP.md`](AI_SETUP.md), [`AI_COSTS.md`](AI_COSTS.md), `tests/unit/ai-*.test.ts`, `tests/e2e/v2-online.spec.ts`, [`screenshots/v2-phase03/`](screenshots/v2-phase03/) |
| 04 Generative belief language | **VERIFIED (gate: typed, validated, deterministic, V1-compatible, three novel executable claims, property tests); the interactive preview UI arrives with phase 05's composer** | [`REALITY_LANGUAGE.md`](REALITY_LANGUAGE.md), `tests/unit/reality-language.test.ts`, `tests/unit/reality-properties.test.ts`, `tests/fixtures/reality-corpus-1.json` |
| 05 Interpreter and compiler | **VERIFIED offline and with mocks; LIVE UNVERIFIED** (no provider configured: model accuracy, latency and token cost not measured). On sentences neither reader was tuned on, the offline reader v2 reads 13/30 supported sentences faithfully against V1's 3/30 (labels 51/80 against 34/80); it refuses rather than invents (1 invented effect in 32 impossible sentences, 0/7 injections obeyed); written beliefs become executable rules that change the world (integration test, two villages) | entry below, [`screenshots/v2-phase05/`](screenshots/v2-phase05/) |
| 06 Simulation primitives | **VERIFIED (gate)**: executor, 17 operators, chickens and loose stones in engine tests; hens, stones and the raised bank drawn on the classic map and in 3D and checked in the browser from belief to changed scene (phase 09). Stated limits: floodwater turned aside is not conserved elsewhere, faster growth has no water demand; effects are drawn as state, animated in phase 10 | [`REALITY_LANGUAGE.md`](REALITY_LANGUAGE.md) §7, `tests/unit/reality-execute.test.ts`, `tests/e2e/v2-world3d.spec.ts` |
| 07 Agent cognition and memory | **VERIFIED offline and with mocks; LIVE UNVERIFIED** (no provider: no model-backed decision has been made). Every villager of a V2 run has a personality, goals and memories with provenance; a few a day decide at moments that matter (legal moves only, V1 rules decide the effect); the player can talk with any of them; a model may propose decisions and voice answers, checked twice and recorded so replays need no model | [`MINDS.md`](MINDS.md), entry below, [`screenshots/v2-phase07/`](screenshots/v2-phase07/) |
| 08 Multi-agent social dynamics | **VERIFIED offline and with mocks; LIVE UNVERIFIED.** Influence journal with cause chains; faction leanings; skeptics demanding proof (answered, failed, ignored); competing claims villagers write in the same language (announced, withdrawable, capped, contestable); lies the engine flags and witnesses discover; social energy so decisions redirect rather than add influence. Measured: the social layer moves the outcome of knife-edge chapters (table in the entry) | [`MINDS.md`](MINDS.md) §6, entry below, [`screenshots/v2-phase08/`](screenshots/v2-phase08/) |
| 09 Belief-to-reality bridge | **VERIFIED offline and with mocks; LIVE UNVERIFIED.** A typed sentence becomes law only through the whole chain (preview → hashed confirmation → real persuasion → threshold with hysteresis → catalyst → executor → V1 hazards), proven in the browser for the three proof claims plus a complete win and a complete loss; below threshold nothing happens; replays need no model and no network. Measured: written beliefs reach law in 6-9 days, so they rarely decide a chapter (phase 11) | [`BELIEF_TO_REALITY.md`](BELIEF_TO_REALITY.md), entry below, [`screenshots/v2-phase09/`](screenshots/v2-phase09/) |
| 10 3D visual effects | **IN PROGRESS: the effect registry and three physical laws in 3D VERIFIED (they match canonical state, tested over the recorded chains and in the browser); the gate's "looks like premium real-time gameplay" NOT MET by my own reading (the art stages of the 3D plan remain); frame times on a GPU or phone UNVERIFIED** | [`3D_EFFECTS.md`](3D_EFFECTS.md), `tests/unit/render3d-reality.test.ts`, `tests/e2e/v2-world3d.spec.ts`, [`screenshots/v2-phase10/`](screenshots/v2-phase10/) |
| 11-17 | NOT STARTED | |
| 3D visual track (standard, plan, report) | standard and plan written; stage 0 (V1's 3D work merged) done; stages 1-9 NOT STARTED | [`3D_VISUAL_STANDARD.md`](3D_VISUAL_STANDARD.md), [`3D_IMPLEMENTATION_PLAN.md`](3D_IMPLEMENTATION_PLAN.md), [`3D_QUALITY_REPORT.md`](3D_QUALITY_REPORT.md) |

Live model calls so far: **none**. Inference spend so far: **0**. Deployments: **none**.

---

## 2026-10-28 — Phase 10: written laws in the 3D world (effects VERIFIED; premium look NOT MET; GPU UNVERIFIED)

**What was done** (reference: [`3D_EFFECTS.md`](3D_EFFECTS.md))

- **An effect registry keyed by logged events** (`render3d/plan.ts`, plain data): each written-law event (`REALITY_EFFECT` by its
  operator, `BANK_RAISED`, `STONE_RAMS_BRIDGE`, `WATER_POOLED`, `FIRE_WARDS_COOLED`, `STRAYS_FLEW_HOME`) and each villager's own choice
  (`NPC_ACT`, tests, lies, claims) maps to an effect planned from positions and amounts the engine computed; `effects.ts` plays them
  (lift, chill, gesture added), skippable and reduced-motion aware.
- **Forces**: the executor now records what each entity effect amounted to once every law's pull was combined (`amount` on the
  applied effect); a bell night lifts exactly the hens it lifted, to that height, with blob shadows that shrink as they rise.
- **Written laws described by their own clauses** in the snapshot (trigger, target, operator, what powers them tonight), never by
  the neutral V1 spec they carry; the ledger in the world no longer shows a bell law as wanting a lantern.
- **Things drawn legibly**: hens with body, head, comb, beak and tail; stones by state (placed, wet, dry); the bank's courses at the
  waterline.
- **The screenshot matrix** (`scripts/capture-matrix-v2.ts`, `capture-3d.ts --trace/--save`): day 1, two activations, compound
  weather aftermath, debate near the bridge, a law let go (constructed save), the end-of-run scene, 390×844 and 320×568.

**Tests and results**

| Command | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass |
| `npx vitest run tests/unit/render3d-reality.test.ts` | **9 passed**: every planned effect names an event of that very night (four chains); lifts only on the nights the law acted, exactly the executor's hens at its height; a law that never woke shows nothing; written laws described by their clauses |
| `npx playwright test --project=desktop-3d --project=phone-3d` | **46 passed, 4 skipped by design** (29.3 minutes, software WebGL): V1's 3D suite (tiers, context loss, restart memory, picking, camera limits, axe) and V2's (the outcome of a law drawn; a bell night with hens rising and settling) |
| Matrix frames (`info()`) | high tier 1440×900: 515-750 draw calls, 0.49-0.67 M triangles; low tier 320×568: 147 calls, 0.23 M (SwiftShader, not a GPU) |

**Not met / not verified:** the gate asks that the laws "look like premium real-time gameplay": by my reading of these frames they do
not (a daylight diorama, not the dusk standard; hens drawn about twice life size; no human has judged it). Frame times on real
hardware are UNVERIFIED. Both are carried by the 3D plan's stages 1-9.

## 2026-10-28 — Phase 09: imagine → persuade → manifest → consequences (VERIFIED offline and with mocks; LIVE UNVERIFIED)

**What was done** (reference: [`BELIEF_TO_REALITY.md`](BELIEF_TO_REALITY.md))

- **V1's 3D work merged** (V1 `main` at `22b7b1c`: JaredVogler2/BeliefEngine#2 and JaredVogler2/BeliefEngine#3): immersive HUD,
  end-of-run scene, finishing chain, 3D browser projects and CI job. Conflicts resolved as planned (V2's docs kept, V1's copies in
  `docs/v1/`); V2's specs updated for the new HUD (the selection card, the sheet opened on request).
- **Preview of the whole chain** (`reality/preview.ts`, composer): per clause target and count now, reach, duration, catalyst and
  whether it could act tonight; support from how many voters; upkeep; side effects only as the engine plays them; who may push back.
- **Honest side effects**: operator downsides corrected; cooler flames now cool the hearths (V1 cold) and lower fire-kept flood wards.
- **Fixes the chain exposed**: river-commons effects did nothing (keyed to `river`); district protections summed per target;
  forecast and evacuations ignored written beliefs (now `reality/project.ts`); stones never lay within reach of a lantern; "the
  orchard" read as fields without saying so.
- **Lifted strays fly home** over the river on a still night; WATER_POOLED and CHICKENS_ROSE name the law that caused them.
- **Provenance** of each written belief from the log, in the debrief and the law ledger.
- **Drawn**: coops, hens, stones and the raised bank on the classic map and in the 3D world (`render/reality2d.ts`,
  `render3d/reality.ts`); both expose `realityInfo()` for tests.
- A generated village can be started as a Generative Reality run from the reality tab.

**Proof chains** (recorded by `scripts/record-bridge.ts`, real persuasion, replayed by hash):

| Chain | Result |
|---|---|
| A, Redbank seed 2 | law day 6; 22 hens saved on two flood nights; complete loss (4 drowned) |
| A told once (control) | never law; bell rung daily; every hen drowned |
| B, Redbank seed 3 | law day 6; stones made light, one carried; 3 bank tiles raised for good |
| C, generated village x1.2 (Eastbank) | law day 9; river one step lower, 7 tiles pooled, fire cut, hearths cooled; a skeptic's demand went unanswered |
| Win, Redbank seed 1 | victory by the Fire Wall; the written belief spread but never became law |

**Tests and results**

| Command | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass |
| `BE_REQUIRE_REDIS=1 npm test` | 48 files, **576 passed** (27 in `belief-bridge.test.ts`) |
| `npx playwright test tests/e2e/v2-bridge.spec.ts --project=desktop --project=phone` | **7 passed** (five full chains on desktop; the preview on both), 5 skipped by design |
| `npx playwright test tests/e2e/v2-world3d.spec.ts --project=desktop-3d --project=phone-3d` | **7 passed**, 3 skipped (slow or other-profile tests); the hens a law saved and the raised bank drawn in 3D |
| V2 browser specs (`v2-reality`, `v2-minds`, `v2-online`, `v2-bridge`) on desktop and phone | 26 passed, 12 skipped by design |
| After the merge: classic suite (desktop, phone) | **160 passed**, 60 skipped by design |
| After the merge: 3D suites (desktop-3d, phone-3d) | 39 passed; the 2 failures were V2's own spec expecting the old side panel, fixed and re-run green |
| `npm run build`, `npm run size` | entry 285 KB gzip (budget 300), 3D chunk 212 KB (270), composer 25 KB (40), mind panel 3 KB (20) |

**Mock vs LIVE:** no model has been called. A model-proposed reading (scripted) replays to the same hash with the network switched
off (unit test); live interpretation is **LIVE UNVERIFIED**.

## 2026-10-28 — Phase 08: social dynamics that change outcomes (VERIFIED offline and with mocks; LIVE UNVERIFIED)

**What was done** (reference: [`MINDS.md`](MINDS.md) §6)

- Influence journal (`src/engine/mind/journal.ts`) and cause chains; Log tab "who influenced whom" with "how it happened".
- Faction leanings in the policy (empiricists, storykeepers, council, hearth).
- `request_test`: skeptics and empiricists demand to see a story shown; met, failed or lapsed, each with its consequence; open
  demands shown with a button to the place.
- Competing claims villagers write (`claims.ts`): the opposite of a story a leader doubts, in the reality language, through
  `buildRealityClaim`; announced a day ahead, withdrawn if the author changes their mind, one per faction per run, three days apart,
  not counted against the player's allowance; both stories crowd each other out (V2 only).
- Lies with a family motive, flagged by the engine, discovered by witnesses (trust −20, rebuttal).
- Social energy: deliberate arguing replaces that villager's broadcast in the night's gossip; small extra for a retelling.
- Player inspection: beliefs beside how they are known; a law's firm believers who saw it themselves.
- Fixes the measurements found: (1) moments from daytime events (the Keeper's words, demonstrations) never queued anyone: day and
  night memories now both feed the next day's queue; (2) **hens' eggs made Harvest unlosable** (one food per five hens every dawn
  cancelled the chapter's grain deficit; doing nothing won 10/10): eggs now feed the household that keeps the coop (less hunger),
  every third dawn, never the granary; (3) villagers' moves were almost all pro-story and nobody challenged: skeptics may now
  challenge unshown stories, and arguing spends the night's gossip.

**Win rates, strategy bots, seeds 1-10** (`runPolicy`, same seeds, Classic vs V2 Generative Reality runs with minds):

| Chapter | Strategy | Classic | V2 |
|---|---|---|---|
| Redbank | do nothing | 0/10 | 0/10 |
| Redbank | Fire Wall | 9/10 | 9/10 |
| Redbank | Witness Bridge | 10/10 | 10/10 |
| Harvest | do nothing | 0/10 | 0/10 |
| Harvest | Moonlight | 4/10 | 9/10 |
| Harvest | Caravans | 10/10 | 10/10 |
| Ashwood | do nothing | 0/10 | 0/10 |
| Ashwood | Smoke Ring | 8/10 | 6/10 |
| Ashwood | Decoy | 4/10 | 8/10 |

With minds removed, V2 matches Classic exactly on these strategies (ablation). The social layer brings some laws a day earlier in
chapters that turn on a single day (Harvest: Moonlight forming on day 5 instead of 6 means one more harvest), and costs Smoke Ring
some of its edge. This is the phase's intended effect (social dynamics change results), but it is a balance change to the V2
chapters; phase 11 (generative gameplay and balance) owns re-tuning them. Classic is unchanged.

**Tests and results**

| Command | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass |
| `BE_REQUIRE_REDIS=1 npm test` | 46 files, **541 passed** |
| `npx vitest run tests/unit/social-dynamics.test.ts` | 17 passed: journal and chains; paired proof demand (same seed and story, shown vs ignored: different, explainable outcomes); faction leanings; competing claims made, withdrawn, capped, contestable, not counted against the player; lies only with a motive, discovered by witnesses; a fallen bridge cuts who can be reached; requests never carry others' memories; bounded thinkers per day; 100 villagers and 30 laws within budget; chapters still winnable and losable; exact replay |
| `npx playwright test tests/e2e/v2-minds.spec.ts --project=desktop --project=phone` | **8 passed, 2 skipped** (online tests on desktop only) |
| `npm run build`, `npm run size` | entry 276 KB gzip (budget 300), mind panel 4 KB (20) |

**Mock vs LIVE:** no model has been called. The gate's "one real provider run makes faction behaviour observably different from
the deterministic fallback" is **LIVE UNVERIFIED**.

## 2026-10-28 — Phase 07: villager minds, decisions and conversation (VERIFIED offline and with mocks; LIVE UNVERIFIED)

**What was done** (reference: [`MINDS.md`](MINDS.md))

- **Minds** for every villager of a V2 run (`s.v2.minds`; Classic has none): personality from V1 traits, archetype and seed
  (bounded, drifting at most 15 after major events); goals from household, work and character.
- **Memories** captured twice a day from the engine's own log, each with its event id, seen or heard and from whom, credibility,
  salience, valence and privacy: what a villager saw within sight, was told, lost, or heard their law decided. Bounded (24 kept,
  older minor ones folded into summary lines that keep their sources); memories that judge a story are never dropped.
- **Decisions**: each night the strongest moments queue at most four villagers; each picks one legal move at dusk (spread,
  persuade, challenge, ask, investigate, comfort, stage evidence, and in a flood leaving early or taking in a neighbour); effects
  only through V1's persuasion and evidence rules. The game's own deterministic policy decides offline.
- **Model path** (`npc v2`): the engine builds the request (only what each thinker knows); the server checks the answer against
  the request; `NPC_DECIDE` checks it against the live run, bound to the run revision, with a per-run allowance; refused or stale
  proposals fall back to the policy. Recorded, so replays never call a model.
- **Conversation** (`TALK`): ask, argue for (1 Influence), challenge (1 Influence) or ask what they make of things; answers come
  only from the villager's own memories; a model may voice them (checked against those memories), never decide what changes.
- **UI**: a lazy mind panel in the villager card (traits, goals, memories with "saw it" / "heard from …", what they did at the
  last dusk, the conversation, its own online opt-in) and a "who is thinking today" section in the village panel with an opt-in
  "let them decide now".
- Fixes found on the way: asking about a story no longer plants it; evacuation reads early moves and offered floors (V2 only).
- Bundle: the entry budget was raised from 260 to 300 KB gzip (the V2 engine is part of the deterministic core; measured 266 KB
  before the mind panel moved to its own 3 KB chunk; now 270 KB including small shared chunks). The script says why and how to
  split it later.

**Tests and results**

| Command | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass |
| `BE_REQUIRE_REDIS=1 npm test` | 45 files, **524 passed** |
| `npx vitest run tests/unit/mind-*.test.ts tests/unit/ai-npc-v2.test.ts` | memories and provenance, bounds, drift, saves; queue limits, legal moves, effects, refusals, stale requests, allowance, replay with recorded model decisions, six villagers choosing differently on the same story and evidence, flood choices, cost; conversation answers and knowledge limits, costs, effects, model lines checked; npc v2 requests from real runs always match the contract, simulated answers legal, 50+ forged answers refused |
| `npx playwright test tests/e2e/v2-minds.spec.ts tests/e2e/v2-reality.spec.ts --project=desktop --project=phone` | **13 passed, 3 skipped** (online tests run on desktop only by design) |
| `npm run build`, `npm run size` | entry 270 KB gzip (budget 300), mind panel 3 KB (20), reality composer 23 KB (40), 3D 193 KB (270) |

**Mock vs LIVE:** every model-facing test used a scripted provider standing in for a model: **TESTED MOCK ONLY**. The phase gate's
"six named villagers make legal model-backed decisions under a real configured provider" is **LIVE UNVERIFIED**; latency, tokens,
cost and a fallback-versus-model comparison are not measured.

## 2026-10-27 — Phase 05: reading any sentence, the model contract and the composer (VERIFIED offline and with mocks; LIVE UNVERIFIED)

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
- **Integration test** (`tests/unit/reality-integration.test.ts`): three sentences written for the test (in no corpus) per village,
  in Redbank and Harvest, read offline, written through `COMPOSE`, believed (white-box social shortcut) and played 7 nights against a
  control on the same seed. Each reads as a different mechanic and leaves a different, measured world: hens rise and more of the
  flock lives; rain called onto Eastbank pools there and more homes stand; the river turned from the bridge leaves the bridge
  standing where the control's collapses; wheat ripens and is harvested that the control never ripens; rain called onto the valley
  keeps its fields from parching; tireless farmhands add a little growth (less than the wheat belief) and no water. Eight distinct
  state hashes.
- What that test found and fixed: (1) water a belief turned from the bridge never reached the bridge (bank shields skip river tiles;
  the stamp was also centred on the bell tower, not the bridge the sentence named): positional effects now measure from the named
  landmark, and a new optional `bridgeFlow` modifier changes the river level the bridge takes (V1 arithmetic unchanged when absent);
  (2) "work without tiring" logged an effect but changed nothing unless a moonlight law was draining workers: diligence now makes the
  fields its believers work give a little more, says when it found nothing it could change, and is refused where nobody works
  fields; (3) the reader offered readings the village could not hold as "understood": it now refuses them with the reason
  (`not_here`); one in-sample label that expected such a reading was corrected; (4) logs named "the source" instead of the place.

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

**Against V1** (the gate's "parsed more broadly than V1"): V1's offline composer (`nl/interpret.ts`), its claims carried into AST v2
by `astFromV1`, scored by the same scorer on the same sentences (`npm run reality:corpus -- --holdout2 --v1`): labels **34/80**,
supported sentences read faithfully **3/30**, invented effects 1/32, injections obeyed 0/7 (V1 names no v2 reason ids, so "reason
named" does not apply). The v2 reader reads four times as many unfamiliar sentences faithfully, mostly because V1's vocabulary has
no chickens, stones, light, temperature, motivation or status at all. A unit test keeps v2 above three times V1 on this corpus.

**Gate.** Novel sentences are read more broadly than V1 (above); unsupported meaning is acknowledged with the reason (holdout-2:
28/32 refused, 1 invented effect; every reading the reader offers now builds in its village); validated ASTs become executable
rules that change the world (integration test). "Actual model-provider evidence where configured": no provider is configured, so
the LIVE column is UNVERIFIED, not failed. Model accuracy, latency and token cost are **not measured**.

**Commands and results**

| Command | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass |
| `BE_REQUIRE_REDIS=1 npm test` | 41 files, **475 passed** |
| `npx vitest run tests/unit/reality-integration.test.ts` | 10 passed (two villages × three new sentences, each against a control) |
| `npx vitest run tests/unit/ai-interpret-v2.test.ts tests/unit/ai-reality-client.test.ts` | 12 passed (schema, provenance, invented keys and numbers, fidelity, region move, refusals, timeout, shared allowance, cache poisoning) |
| `npm run reality:corpus` / `-- --holdout` / `-- --holdout2` | the tables above |
| `npm run build`, `npm run size` | entry 254 KB gzip (budget 260), reality composer chunk 23 KB (budget 40), 3D chunk 193 KB |
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
