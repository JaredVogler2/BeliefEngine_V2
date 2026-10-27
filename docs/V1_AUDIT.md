# V1 audit (phase 01)

The audited code map of BeliefEngine V1 as imported into V2: how it works, what it can and cannot do, what is broken, and what V2
keeps, extends or replaces. It is the phase 01 deliverable of [`prompts/01_V1_REPOSITORY_AUDIT.md`](../prompts/01_V1_REPOSITORY_AUDIT.md).

**Source:** https://github.com/JaredVogler2/BeliefEngine at `6a928620ad30eeaeaf3a0e4d670e3c958e673368` (`main`, 2026-10-27). Every
`file:line` below refers to that commit; the V2 import changed none of the engine, MCP or proxy files, so the same lines hold in V2
([`MIGRATION.md`](MIGRATION.md)).

**Method.** Four read-only code audits ran in parallel over a throw-away clone (engine and simulation; natural-language pipeline and
interpreter proxy; rendering; MCP, modes, persistence and tests), each citing `file:line` for every claim. The claims this document
leans on hardest were then re-read in the source by hand (the shadow-map fallback, the automation quality tier, `COMPOSE` validation,
the proxy's Origin check, the wolf, restart, archive, moonlit and score-weight defects in §12). The V1 build and test baseline was run
in the same clone: those are measurements, the rest of this document is reading. Words such as "never" or "no caller" come from
repository-wide greps.

## 1. Provenance, licence, toolchain, CI

| | |
|---|---|
| History | 67 commits, 2026-10-26 to 2026-10-27; the 3D world landed last (`7b5bfa0`, then a test fix `15257dc`) |
| Licence | MIT, "Copyright (c) 2026 Belief Engine contributors". No third-party art, music, fonts or sound files: every texture, model, sound and sprite is generated in code (`docs/ASSETS.md`) |
| Runtime dependencies | `react` 19.3.1, `react-dom` 19.3.1, `three` 0.186.1 (the 3D chunk only). V1's licence inventory and Credits omitted three.js; fixed in V2 |
| Toolchain | Node ≥ 22.12; Vite 8.3.5, TypeScript 6.0.3 (strict, `allowImportingTsExtensions`, every relative import carries `.ts`), Vitest 5.0.5, Playwright 1.63.0, ESLint 10 with a rule forbidding `Math.random`, `Date.now` and `new Date` in `src/engine` (`eslint.config.js:22-31`), `@modelcontextprotocol/sdk` 1.32.2, zod 4.6.7 |
| CI (`.github/workflows/ci.yml`) | on pushes to `main` and `claude/**` and on pull requests. Job 1: lint, typecheck, unit tests, build, bundle budget, `verify:hosting` (CSP in a real browser), 256-run simulation smoke. Job 2: the Playwright suite (desktop 1366×768 and Pixel 7 390×844), then a smoke test in Firefox, WebKit and an iPhone 14 profile |
| CI on the pinned commit | GitHub Actions run [40507996077](https://github.com/JaredVogler2/BeliefEngine/actions/runs/40507996077) on `6a92862`: success (2026-10-27 12:58-13:05 UTC) |
| Hosting | `vercel.json`: static Vite build, strict CSP (`connect-src 'self'`, no inline script), SPA rewrite. Never deployed: no live URL exists |
| Secrets | none: no `.env` file is tracked, no key-shaped string exists in tracked files, the browser reads no key (`tests/unit/no-unsafe-code.test.ts` enforces it) |

## 2. Baseline (measured)

Run in the V1 clone on 2026-10-27, Node 22.22.0, Chromium 1243 headless (SwiftShader, no GPU). Full logs and the V2 re-run side by side:
[`BASELINE.md`](BASELINE.md).

| Check | Result |
|---|---|
| `npm ci` / `typecheck` / `lint` | pass (280 packages) / pass / pass |
| `npm test` | **28 files, 356 tests, all pass** (64 s) |
| `npm run build` / `npm run size` | pass; entry 228 KB gzip (budget 260), 3D chunk 193 KB (270), CSS 6.2 KB (12) |
| `npm run test:sim:smoke` | 256/256 runs, determinism 32/32 repeated runs identical, `SMOKE OK` |
| `npm run replay:example` (Fire Wall) / `-- witnessBridge` | identical: `11ec6d73416e26` / `1786c582e48ec0`; `1fd91495f0ef6e` / `0067ab92df806f` |
| `npm run test:e2e` | **140 passed, 52 skipped (project-specific), 0 failed** (7.5 min) — but see §9.7: every one of them ran on the 2D map |
| `npm run mcp:demo` / `npm run acceptance:mcp` | scripted agent over real stdio: defeat on seed 7 (score 526), replay identical / Journey B **28 of 28** checks |
| `npx tsx scripts/nl-demo.ts --village redbank` | every written belief replays with no model to an identical hash |

## 3. Code map

| Path | Size | Role |
|---|---|---|
| `src/engine/` | ~12 k lines | the deterministic simulation: `core` (types, actions, night resolution, RNG, hashing, replay, selectors, debrief, counterfactuals), `social`, `laws`, `world` (flood, fire, crops, wolves, sickness, economy, navigation), `ai` (routines, utility intents, rivals, factions, 8 bot policies), `content` (3 chapters), `gen` (procedural villages, modifiers, verified catalog, share links), `nl` (belief language), `progress` (Atlas, badges, unlocks), `save` |
| `src/render3d/` | 26 files, 7,459 lines | the Three.js world (§9) |
| `src/render/` | 2,270 lines | the Canvas2D map (fallback and title backdrop), the renderer contract and chooser |
| `src/ui/` | React screens, HUD, panels, belief composer, store, persistence | |
| `src/audio/audio.ts` | procedural Web Audio | |
| `mcp/` | local stdio MCP server, transport-free game service, scripted demo agent, run verifier | |
| `server/` | the optional interpreter proxy (never deployed) and a Vercel adapter example | |
| `scripts/` | 22 tools and 2 shared libraries: tournaments, trace recording, replay example, catalog verification, acceptance journeys, capture and profiling | |
| `tests/` | 28 unit files, 14 browser specs, 7 fixture files (golden traces, belief corpora) | |

## 4. Engine

### 4.1 State and action lifecycle

- **`RunState`** (`src/engine/core/types.ts:532-568`) is plain JSON: versions, seed/difficulty/mode/modifiers, day/phase/outcome,
  Influence (`ap`), villagers (traits, needs, `keeperTrust`, per-claim `Belief {conv, heard, lastDay, lastSource, evidence, cause, stale}`,
  capped `memory`), trust `edges` (`ab`/`ba` directional, `rate`, `kind`), factions, claims, laws, rivals, the tile world, the
  jittered threat schedule, the event log and day history, stats and flags. `scn` (the static scenario) is shared by reference and
  never mutated (`:566-567`).
- **`GameSession`** (`core/session.ts`) is the only way to change a run, used by the browser store, the MCP service, the bots, the
  composer and the tests. `act()` routes `END_DAY` to `resolveDay` and everything else to `applyAction`; undo restores whole earlier
  states and cannot cross a night (`:39-65`).
- **Actions and costs** (`core/actions.ts:33-57`, validation `:113-130`): `PICK_STARTER` 0; `SCOUT` 0 for the first each day, then
  1; `SEED` (tell a story) 1, once per villager per day, refused at `conv ≥ 88` or `keeperTrust < 8`; `MESSENGER` 1 (speaker
  `conv ≥ 35`, a tie of trust ≥ 15); `RITUAL` its own cost + 1 when staged as proof; `GATHER` 2; `COUNTER` 1; `TRADE` the deal's cost;
  `COMPOSE` 1-3 by the belief's power. Every refusal is a typed code with a message and alternatives (about 47 codes).
- **The night** (`core/resolve.ts:28-95`) is a fixed sequence on a clone: auto-pick the opening story if none → commit the day →
  smoke → rival and faction moves announced yesterday → evacuations → **social step** (contacts, accumulation with contradiction
  crowding, decay, attention cap) → **law step** → bridge watchers → harvest → night positions → **`computeModifiers`** (laws become
  bounded physical modifiers) → **hazards** (river level and water, bridge, mudslide, fire, crops, wolves, sickness, homes, fields,
  people, fuel and bells) → rival and faction planning (telegraphed a day ahead) → dawn needs → **win/loss evaluation** → story beats
  and the summary → dawn (Influence, unlocks, deliveries, day assignments).
- **Events** (`core/events.ts`) carry an id, day, step, code, actors, tile, numeric deltas, cause ids and an importance 0-3; the log
  is compacted above 3,000 events by dropping only importance ≤ 1 (`:3, 50-67`). Debriefs, the morning report and the 3D effect
  planner read these events, never a parallel narrative.
- **Score** (`core/score.ts:26-61`): survivors 500, households 100, essentials 100, infrastructure 50, harmony (trust × 0.7),
  efficiency ≤ 60 (victory only), laws 40 each (≤ 2), heroic 100; × difficulty, pledges, draft and twists. Medal from the raw score.

### 4.2 Determinism

- All in-game randomness is `rand(seed, domain, ...keys)`, a stateless hash (`core/rng.ts:32-45`): no cursor, so a draw does not
  depend on evaluation order. Domains: `threat`, `contact`, `spread`, `ignite`, `intent`, `council-ban`, `compose-stress`, `look`,
  `spot` and the generator's. The sequential `Stream` PRNG is used only by the village generator (`src/engine/gen/`).
- `stateHash` = cyrb53 of the canonicalised `RunState` minus `scn`; `eventHash` = the same over the log (`core/replay.ts:16-24`;
  `core/hash.ts`). `replayRun` rebuilds a run from options + actions.
- Anything stored in the state is inside the hash: event wording, villager and claim strings copied into state, array orders, every
  constant in §5-§6, the rng domain strings. **Changing any of them changes the golden hashes.** JS-specific semantics a port would have
  to reproduce: `String(n)` formatting, UTF-16 `charCodeAt`, `Math.round`, `Math.imul`. Cross-engine float agreement is unproven:
  `Math.hypot` shapes map elevation (`world/build.ts:69`) and only Chromium compares golden hashes in a browser.

### 4.3 Versions

`RULES_VERSION '1.0.0'`, `SCHEMA_VERSION 1` (`core/types.ts:9-10`), `GEN_VERSION 1` (`gen/expedition.ts:23`), `NL_VERSION 1`
(`nl/ontology.ts:8`), `LLM_SCHEMA 1` (`nl/llm.ts:12`), scenario versions 1, Atlas `PROGRESS_VERSION 2`. `save/versions.ts` builds a
`ReplayVersions` block (rules, schema, generator, belief language, and `start` = the hash of the opening state) that MCP run files
carry; a mismatch is refused with `RUN_VERSION_MISMATCH`. Browser saves (`save/serialize.ts`) check the format and refuse a newer
schema, but **do not check `rulesVersion` and have no migration step** although a comment says so (`serialize.ts:30-61`).

### 4.4 Public API

`src/engine/index.ts`: run lifecycle (`createRun`, `GameSession`, `resolveDay`, `applyAction`, `getAvailableActions`, `previewAction`),
replay and hashes, saves, content listing, view selectors (villager, laws, hand, forecast, HUD, intents, callouts), debrief, night
report and counterfactual search, generator, catalog and share links, progress, and the belief language (`interpretBelief`,
`composeCostOf`, `parseLlmReply`, `candidatesFromReply`). `laws/*`, `world/*`, `ai/bots/*`, `core/hash.ts` and `save/versions.ts` are
reached by deep imports from tests, scripts and MCP.

## 5. Social propagation (computed, not generated)

Constants `K` (`social/persuasion.ts:8-25`): `BASE 28`, `SEED 28`, `DAILY_CAP 34`, `DECAY 0.05`, `ATTENTION 190`, `GATHER 0.7`,
`MESSENGER 2.0`, `CONTRADICT 0.4`, `SPREAD 12`.

- **Gossip** (`gossipDelta`, `persuasion.ts:108-135`): `raw = 28 · sig · trustTerm · P · S · N · Sc · I · F`, where `sig = clamp(speakerConv/50, ±1)`;
  `trustTerm = t ≥ 0 ? t : 0.4t` with `t = trust/100`; `P = 0.6 + 0.8·influence/100 + 0.2·speakerEvidence/100`; `S` discounts by
  the listener's skepticism (less when the speaker has evidence ≥ 30); `N = 1/(1+0.12·heard)` (×0.6 if the same speaker repeated it
  yesterday); `Sc` = susceptibility; `I` = electorate relevance (1 or 0.55); `F` = fear. Same-sign news saturates by
  `1 − |conv|/110`; opposite-sign news is damped by stubbornness and the listener's own evidence.
- **Who talks**: each edge talks tonight with probability `rate × availability(a) × availability(b)`, ×0.85 across districts, ×1.3 in
  the same place, ×0.7 in heavy smoke, decided by `rand(seed,'contact',day,a,b)` (`propagation.ts:59-64`). A villager repeats only
  their strongest claim with `|conv| ≥ 12`. The night's change per belief is capped at ±34 (`:138`).
- **Telling** (`seedGain`, `persuasion.ts:138-149`): `28 × (0.35 + 0.65·keeperTrust/100) × susceptibility × (1 − 0.6·skepticism/100)
  × 1/(1+0.45·heard) × fear`, saturating with existing conviction.
- **Proof** (`evidenceGain` and `doRitual`, `actions.ts:343-431`): a ritual's evidence `E = strength × omen` (1.35 on a good omen,
  0.45 neutral, −0.9 bad), with staging fatigue; every walk-connected villager within the ritual's witness radius gains
  `evidenceGain`, which skeptics weigh *more* (`respect = 1 + 0.25·skepticism/100`). A failed proof costs 6 Keeper trust per witness,
  is remembered (`proof_failed`) and triggers a rival rebuttal.
- **Decay and attention**: unreinforced beliefs decay by `0.05 × (1 − stubbornness/200)` unless evidence ≥ 60; evidence loses 1.5 a
  night; positive convictions above 190 in total are scaled down (`propagation.ts:192-219`).
- **Memory** (`core/memory.ts`): up to 6 items (`law_failed`, `law_worked`, `proof_failed`); `memoryFactor` scales positive gains
  between 0.55 and 1.15 (−0.14 per failed law, −0.08 per failed proof, +0.05 per working law).
- **Contradictions**: gaining a story crowds out contradicting ones by `0.4 × gain`; contradicting laws suppress each other (§6).

## 6. Laws and physics

- **Pressure** (`laws/resolver.ts:24-49`): over living villagers whose district is in the claim's electorate,
  `pressure = clamp((Σ w·c⁺ + 0.5·Σ w·c⁻) / 100 / Σw, 0, 1)` with `w = 0.5 + influence/100` (c⁺ positive, c⁻ negative convictions). A **supporter** holds `conv ≥ 50`.
- **Status machine** (`:56-161`): progress rises by `ramp × (0.7 + min(1, 3·(pressure − on)))` when pressure ≥ `on`, supporters ≥
  `minSupporters` and (with 3+ supporters) no voice holds over 45% of the support; it falls by `decay` below `off`; in between it
  holds (hysteresis). `dormant → awakening → active (100) → wavering → dormant`; a contradicting law with more progress suppresses.
  Strength 0.6-1.0 by how far pressure is above `on`.
- **Effects** (`laws/effects.ts:114-227`): an active or wavering law becomes a bounded modifier **only where its trigger source is
  present tonight** (lit beacons or campfires in the region, a ringing bell anywhere, enough watchers on the bridge, or always).
  Hazard modules read only those modifiers, never beliefs.

| Subject.effect | Physical change | Built-in story using it |
|---|---|---|
| river.repel / redirect / slow (one code path) | raises the ground against flood within reach of each source (`floodShield`) | *River fears fire* (Redbank) |
| river.attract | lowers it, drawing water in | rival *River courts fire* |
| rain.redirect / repel / attract | lowers the river level / shifts water to a sink / adds rain to fields | *Rain heeds bells*, *Rain follows bells* |
| bridge.strengthen / weaken | cuts bridge damage 45/70/90% while watched / adds damage | *Bridge stands watched* (Redbank), rival *Crowds break bridges* |
| grain.grow / weaken | crop growth ± per night | *Moonlight ripens grain* (Harvest), rival *Moon sours grain* |
| wolf.repel / attract | packs blocked from / lured towards the source's reach | *Wolves fear smoke*, *Wolves follow smoke* (Ashwood) |
| illness.repel / weaken | smoke sickness ×(1 − 0.25·i·strength) | *Illness fears open doors* |
| fire.weaken / strengthen / slow | fire damage cut, increase, spread slowed | unlockable *Flames cannot hurt* |
| stone.redirect / strengthen | flood shield with structural stress on homes | not used by any chapter |
| smoke.conceal | **nothing** (`effects.ts:197-198`) | — |

World modules (`src/engine/world/`): flood is a BFS from river tiles at the night's level against elevation plus law shields;
fire spreads with wind and ignites from lit beacons; crops grow with moisture and law boosts; wolf packs walk greedily up to 3 tiles
toward pens or lures; smoke and cold cause sickness; the economy feeds the village and moves caravans. Three chapters
(`content/scenarios/`): *Flood at Redbank* (7 days, 14 villagers), *The Harvest That Refused to Grow* (9 days, drought, 14), *The
Wolves of Ashwood* (8 days, 13); every chapter has two recorded winning routes, a do-nothing defeat and a failed attempt.

## 7. Villager AI: what is computed, scripted or generated

| Behaviour | How it is decided | Where |
|---|---|---|
| belief change | computed: the formulas in §5 | `social/*` |
| daily duty (work, rest, shelter, evacuate) | rules over danger, energy, sickness, BFS reachability | `ai/routines.ts:44-169` |
| bridge watchers and defections | rules + a utility model (`work`, `rest`, `family`, `guard`, `safety` scored with seeded noise −2..+2) | `ai/routines.ts:172-237`, `ai/utility.ts` |
| rivals | scripted, rule-triggered campaigns, rebuttals and sabotage, announced one day ahead | `ai/rivals.ts` |
| factions | rule-triggered endorsements and council bans | `ai/factions.ts` |
| dialogue | authored strings and templates in content and event text | `content/*`, `core/*` |
| **language-model reasoning** | **none.** No `fetch`, provider or model call exists anywhere in `src/engine` | grep |

V1 villagers are believable utility agents with a short memory, not language-model agents. The Claude Code sessions recorded in
`docs/data/mcp` and `docs/data/nl` are an outside agent *playing* the game; they are no evidence of generative villagers.

## 8. Natural-language beliefs and the interpreter proxy

### 8.1 Pipeline

`text` → sanitise (NFKC, control and bidi characters removed) → **refusal screen**: 70 regexes in 10 categories (time, immortality,
victory, resources, mind control, transmutation, teleport, disasters, wishes, and `meta` for instructions, tags, URLs and code)
(`nl/ontology.ts:78-89`) → offline lexicon parse (74 subject words, 260 effect phrases expanding to 598 forms, 91 trigger phrases;
negation, defaults per subject; `nl/parse.ts`) → `InterpretStatus` `ok | ambiguous | partial | unsupported | rejected`
(`nl/interpret.ts:12`) → **`BeliefAST` v1**: 1-2 clauses of a typed subject × effect × trigger, radius 0-4, intensity 1-3, optional
watchers, 1-4 regions (`nl/ast.ts:10-69`) → `buildClaim`: village can host it (`NOT_HERE`), balance (power ≤ 60; costs 1/2/3
Influence; thresholds and believers from power), unlock day of a held-back built-in answer, and a **three-night stress test** on a
clone with every source powered and the whole village believing (`nl/build.ts`, `nl/balance.ts`, `nl/stress.ts`) → the `COMPOSE`
action rebuilds the claim from the AST, checks `NL_VERSION` and `astHash` (`core/actions.ts:289-309`) → the written belief is then a
claim like any other: told, spread, voted into law, powered by its source.

### 8.2 Vocabulary

7 active subjects (river, rain, bridge, grain, wolf, illness, fire; `stone` and `smoke` are typed but not offered), **40 subject ×
effect × trigger combinations**, each with one canonical sentence (`nl/ontology.ts:92-133`); **31 behave differently** by the docs'
rule, 29 if grain *night* and *always* are merged (both use the same always-on source, so the "work the fields by moonlight"
requirement is never enforced). Redbank can host 17 combinations, Harvest 7, Ashwood 6. English only, no fuzzy matching. Measured
accuracy, re-scored in the audit with the repository's own scorer: development corpus 133/133 (tuned), second set 45/47, untuned final
set 31/36 (12/12 refusals correct). It is a vocabulary matcher, not language understanding, and V1 says so.

### 8.3 Model path (mock-tested only)

`nl/llm.ts` validates a strict reply `{schema:1, understood, candidates[≤3] {subject, effect, trigger, intensity?, radius?, watchers?,
region?, title?}}`, drops anything outside the vocabulary, clamps numbers, and discards `region` and `title`. Model readings
**replace** the offline readings rather than merging, nothing checks them against the sentence, a model cannot propose a two-clause
belief, and two surviving candidates are always "ambiguous" (`nl/llm.ts:63-78`, `nl/interpret.ts:118-124`). Provenance kept: only
`source: 'model'` and a parser id, and `source` is whatever the client sends at `COMPOSE`.

### 8.4 Proxy (`server/interpreter.ts`, never deployed, never called a live provider)

POST only; 503 when no key or model; `Origin` checked against an allowlist **only when the header is present**
(`server/interpreter.ts:107-108`); JSON body ≤ 2,048 bytes; text ≤ 160 chars; 8 s timeout; 8 requests/min per client and 400
provider calls/day; a 24 h FIFO cache of 500 entries; Anthropic Messages request (`x-api-key`, `anthropic-version: 2023-06-01`,
`max_tokens: 400`, no structured-output mode); reply parsed from the first `{` to the last `}`. The key is read only from the server
adapter's environment and never echoed. Holes, each a reason it must not be deployed as is:

| # | Hole |
|---|---|
| H1 | no authentication or user identity; any client that omits `Origin` can spend the budget |
| H2 | every limit, the budget and the cache live in memory **per instance**: N warm instances allow N × 400 calls a day; a cold start resets them; no durable spend cap |
| H3 | the client key is the first `x-forwarded-for` entry (spoofable where a host does not overwrite it); everyone without an address shares one bucket |
| H4 | the per-client map is never pruned (unbounded memory under rotating keys) |
| H5 | varying the `context` lists bypasses the cache, each variant a paid call |
| H6 | no CORS and `OPTIONS` gets 405; a browser sends `Origin` on same-origin POSTs, so an empty allowlist would refuse the real client |
| H7 | the body limit applies after the platform has parsed the body; the handler has no try/catch |
| H8 | the refusal screen does not run before the paid call (the browser asks the model before the offline reader) |
| H9 | `bad_output` is HTTP 200; no logging or metrics |
| H10 | `not_configured` is answered before the Origin check |
| H11 | temperature unset, `anthropic-version` hard-coded, model id unvalidated; per-instance caching hides nondeterminism |
| H12 | whether a future `api/` function would win over the SPA rewrite in `vercel.json` is untested |

Browser side: off unless the site is built with `VITE_INTERPRETER_URL` **and** the player ticks a consent box; the box text says the
sentence and the village's feature names leave the device (it omits that region ids are sent too); 10 s client timeout; every failure
falls back to the offline reading; `connect-src 'self'` limits it to a same-origin endpoint.

## 9. Rendering

### 9.1 Architecture

**Raw Three.js 0.186.1, not React Three Fiber** (no `@react-three/*`, no drei, no loaders, no `EffectComposer`). `src/render/types.ts:11-39`
defines `WorldRenderer`, implemented by the Canvas2D `MapRenderer` and by `World3D`; `MapView.tsx` owns the canvas, all pointer and
keyboard input and the 2D/3D switch; the 3D world is a lazily loaded chunk (`render/choose.ts:73-77`). The renderer is an observer:
it receives state and events, answers "what is under this pixel" with engine ids (`World3D.hitTest`, `World3D.ts:514-534`), and nothing
under `src/render3d/` imports the store or `GameSession`. Render randomness is its own seeded generator (`render3d/rand.ts`).

### 9.2 Which renderer runs

`?renderer=2d|3d`, else the saved choice (`localStorage['belief.renderer']`), else 3D **only on a hardware GPU with WebGL2**: a software
rasteriser (SwiftShader, llvmpipe) gets the 2D map with a "Try 3D" button (`render/choose.ts:17-63`). Inside the 3D world,
`navigator.webdriver` (any automated browser) starts at the **low** tier unless `?quality=` pins one (`World3D.ts:22-34`), and a
software GL context drops to low at a 0.6 render scale with no shadows (`World3D.ts:103-117`).

### 9.3 Pipeline and content

| Area | What V1 does |
|---|---|
| Colour | sRGB output, ACES Filmic (exposure 1.02, set per mood) |
| Lights | one shadowed directional sun (fixed ~44° elevation), a hemisphere light, a cool fill; up to 4 flickering point lights for lit beacons and campfires. Windows and lanterns are emissive only |
| Shadows | 2048 / 1024 / off by tier; requests `PCFSoftShadowMap`, which three r186 has removed, so it warns and falls back to PCF |
| Atmosphere | uniform `FogExp2`; a screen-space gradient sky that skips tone mapping; six lighting **moods** driven by the engine's threat (calm, storm, threat, heat, dusk, sunbreak), no day/night clock |
| Environment / post | no environment map, no PMREM, no bloom or any post-processing pass |
| Terrain | CPU height field from engine elevation × 0.28, a CPU-painted ground texture (40 px per tile), a diorama "plate" edge; the world ends at the plate |
| Water | one shader surface for river and flood: flow-stretched noise normals, depth colour, Blinn-Phong sun glint, Fresnel to a flat sky colour, foam; **no reflections** |
| Buildings | procedural kit parts merged per material: 5 home variants, cabin, granary, hall, chapel, ruin; bell tower, watermill, market, shelter, well, pen, campfire, beacon; a stone **arch bridge** with lantern posts that cracks and sags when damaged |
| Foliage | 7 instanced tree species, instanced grass, flowers, reeds, rocks and crops, with vertex wind sway |
| People | a primitive rig per villager (15-23 meshes each, not instanced), procedural gait and poses from the engine's duty and status, BFS walking over the engine's passable mask |
| Effects | planned as data from engine event ids (`render3d/plan.ts`: 8 action codes, ~30 dawn codes): runes, rings, trust-graph ribbons along existing ties only, glyphs, eyes, particles, splash, dust; law reach painted on the ground per powered source |
| Quality tiers | high / medium / low (DPR 2/1.5/1, shadows 2048/1024/0, detail 1/0.6/0.3, fps cap 60/45/30) plus an adaptive render scale 0.5-1; a tier change rebuilds the world |
| Camera | custom eased tabletop orbit: fov 30°, elevation 24-66°, azimuth ±75°, anchored zoom, recenter; touch tap / drag / pinch; rotate and tilt by buttons, keys or right-drag only |

### 9.4 Measured in this container (V2, forced 3D, SwiftShader)

At 1366×768 the world runs at the low tier, 0.69 render scale, **≈2.9 frames per second**, **566 draw calls and ≈223 k triangles**
per frame; at 390×844, ≈4.4 fps, 527 draw calls. No console errors. These say nothing about a real GPU, which nobody has measured.

### 9.5 What the 3D world does not show (the 2D map does)

The social lens, the flood forecast overlay, high contrast, name labels, **wolf packs** and **live fire and smoke tiles** (fire appears
only as a burst effect when it starts); burned ground appears only after a full rebuild. In Ashwood, the chapter's threat is therefore
invisible in 3D.

### 9.6 Other renderer defects

The shadow-type fallback above; particle size ignores viewport and DPR (constant `viewScale`); context loss rebuilds the world but is
never shown to the player and never falls back to 2D; no `visibilitychange` or DPR-change handling; `window.__beRenderer` survives
unmount; a few meshes are never disposed; `setInsets` and `entityScreen` have no UI caller.

### 9.7 How the 3D world was tested in V1

It was not, in a browser. No spec passes `?renderer=3d`, and a browser without a GPU is a software rasteriser (headless Chromium here
reports SwiftShader; GitHub's standard runners have no GPU either), where the game picks the 2D map, so all 140 browser tests ran on
the 2D map. `tests/unit/render3d-plan.test.ts` (7 tests) checks effect plans and snapshot parity as pure data, and
`scripts/capture-3d.ts` (manual, not in CI; its documented `--state` flag is never parsed) is the only thing that ever drew the world.
`docs/3d-rebuild/STATUS.md` lists 3D phases 02-06 "in progress" and 07-10 "not started", and points to a `FINAL_REVIEW.md` and 3D
screenshots that do not exist. V2 adds the first browser tests that draw it ([`MIGRATION.md`](MIGRATION.md)).

## 10. Modes, saves, MCP

- **Modes**: `RunMode` story / expedition / daily / sandbox (`sandbox` is never created). Story chapters start at seed 1, normal;
  expeditions are generated villages `x1.<seed>` (river, drought or wolves biome, 1-3 run modifiers) with a verified catalog of 853
  winnable seeds out of 1,000; the daily village picks a catalog seed from the UTC date; share links carry only mode, chapter, seed,
  date, difficulty and versions. **Inventor** is a run flag (unranked) that enables `COMPOSE`, at most 2 written beliefs per run.
- **Saves**: `localStorage` keys `be:save:v1` (autosave after every change), `be:settings:v1`, `be:progress:v2` (the Atlas),
  `belief.renderer`; file format `belief-engine-save` with the whole state including `scn`; loads are validated (format, schema, shapes,
  finite numbers, re-verified written beliefs) and never throw. `?debug=1` exposes `window.__belief` and makes the run earn nothing.
- **MCP** (`mcp/`): stdio only, server `belief-engine` 0.1.0, **21 tools** (+1 debug tool behind `BELIEF_ENGINE_DEBUG_TOOLS=1`),
  5 resources, 3 prompts. The service drives the same `GameSession`. Runs are `r_` + 32 hex ids stored as `belief-engine-mcp-run` files
  under `~/.belief-engine/mcp/runs/` (or `BELIEF_ENGINE_HOME`), written atomically and re-verified by replay on load. Optional
  `expectedRevision` and idempotency keys; coach (read-only) and delegate control. No network or model call exists in `mcp/`.

## 11. Tests

| Layer | What exists | What it proves |
|---|---|---|
| Unit (Vitest) | 28 files, 356 tests | determinism and replay of 12 authored and 25 tournament traces, social and law mechanics, every chapter, the generator and catalog, factions, exploit probes, progress, performance budgets, audio on a fake graph, the belief composer (balance, compose, three corpora, mocked model), the MCP service and server over real stdio, source guards against `eval`/`innerHTML`/keys |
| Browser (Playwright) | 14 specs, 140 runs + 52 project skips; cross-browser smoke 2 tests × Firefox, WebKit, iPhone 14 | real-click winning traces for every chapter and a generated village with identical hashes, Journeys A and C, Inventor mode, persistence, resilience, 5 viewport sizes, axe audits, offline play after load |
| Simulation | 8 bot policies × 4 families, paired seeds | balance, determinism, exploit search |
| Not tested anywhere | — | the 3D world in a browser (§9.7); a real phone or real Safari; a human player; a live language model; remote MCP (not built); a deployment; a screen reader |

## 12. Defects and doc/code mismatches (confirmed in the source; not fixed in the baseline)

| # | Defect | Where | Impact |
|---|---|---|---|
| D1 | `COMPOSE` never re-reads the sentence: any valid AST is accepted with any text (≤ 160 chars), so a card's words need not match its mechanics | `core/actions.ts:297`, `nl/build.ts:261-265` | integrity/provenance, not physics (the AST is still bounded) |
| D2 | a self-contradictory compound (`river.repel` + `river.attract`) validates, balances and passes the stress test | `nl/ast.ts:67` | odd but bounded |
| D3 | text limits disagree: 280 in the parser and MCP, 160 in the UI, proxy and stored text; MCP text of 161-280 chars is silently cut | `nl/parse.ts:12`, `nl/build.ts:19`, `mcp/server.ts:149` | confusing |
| D4 | grain *night* beliefs never need the moonlit work they advertise: the `moonlit` flag is written but never read | `core/actions.ts:374`, `laws/effects.ts:86-91` | rules text lies |
| D5 | the wolves module's header says packs injure people outside shelter; no code path does | `world/wolves.ts:8-11` | doc lies (behaviour is consistent with the rules otherwise) |
| D6 | the per-scenario score weights are defined but never read | e.g. `content/scenarios/redbank.ts:233` | dead data |
| D7 | Settings → "Restart this seed" drops the run's mode, daily date and Inventor flag (a restarted expedition becomes a story run) | `src/ui/screens.tsx:543` | user-facing bug |
| D8 | an archive reload drops the Inventor `custom` mark, so unranked runs can count as ranked | `progress/progress.ts:196-212` | user-facing bug |
| D9 | MCP idempotency keys are not bound to the request: reusing a key with another action returns the earlier result | `mcp/service.ts:492-495` | agent-facing bug |
| D10 | browser saves skip `rulesVersion`; no save migration exists despite the comment | `save/serialize.ts:30-61` | latent: matters at the first rules change |
| D11 | three reason codes (`FATIGUE`, `DECAY`, `LAW_WITNESS`) are defined but never emitted | `social/persuasion.ts:51-88` | dead code |
| D12 | renderer: removed shadow type, invisible packs/fire/lens in 3D, context loss silent (§9.5-9.6) | `src/render3d/*` | visual and information gaps |
| D13 | docs: V1's README says "none of the 3D work has been done here"; `docs/TEST_RESULTS.md` has stale counts; `docs/3d-rebuild/STATUS.md` cites a missing `FINAL_REVIEW.md`; `scripts/capture-3d.ts` documents an unparsed `--state`; `capture-states.ts`'s lens shot clicks a test id that does not exist | as named | stale records |

## 13. Gap matrix for V2

| Verdict | Feature | Reason |
|---|---|---|
| **KEEP** | the deterministic engine, `GameSession`, actions, night order, rng, hashing, replay, golden traces | they are what makes replay, MCP parity and tests possible; the V2 tripwire pins them |
| **KEEP** | the three chapters, expeditions, daily village, catalog, share links, Atlas, saves, audio | working, tested content |
| **KEEP** | the local stdio MCP server and its service | same rules as the browser, real-client evidence |
| **KEEP** | the raw Three.js renderer behind `WorldRenderer`, and the 2D map as fallback | V2's phase 10 says keep it until a measured reason to replace; the observer contract is sound |
| **EXTEND** | the law/effect vocabulary (closed unions in `core/types.ts:19-21`, a `switch` in `laws/effects.ts`) into a typed, versioned, data-driven rule DSL with conditions and more primitives | phases 04-06; adding one subject today touches ~15 places in code |
| **EXTEND** | villager memory and intents into model-proposed, engine-checked decisions | phases 07-08; keep §5's math as the authority on belief change |
| **EXTEND** | provenance: record model id, prompt version, raw-reply hash and validated proposal in an external decision ledger; bind sentence to AST (D1) | phases 05 and 14 |
| **EXTEND** | the 3D world to the [visual standard](3D_VISUAL_STANDARD.md): draw packs, fire, smoke, lens and forecast; lighting, water, atmosphere, landform, performance | phase 10 and [`3D_IMPLEMENTATION_PLAN.md`](3D_IMPLEMENTATION_PLAN.md) |
| **REPLACE** | the finite lexicon as the *only* reader in Generative Reality mode (it stays as the offline Classic reader and the fallback) | phase 05 |
| **REPLACE** | the in-memory per-instance limiter and cache in `server/interpreter.ts` with authenticated endpoints, a durable shared limiter and a hard spend cap | phase 03; holes H1-H12 |
| **OPTIONAL** | remote MCP (streamable HTTP, auth, durable run store); rigid-body physics | not needed for the product gates |
| **UNVERIFIED** | any live model behaviour; a deployed app; real iPhone Safari; real-GPU frame rates; human fun | nothing in V1 or V2 has measured them yet |

## 14. Migration safety

Licence and attributions carried (MIT `LICENSE`; three.js added to the licence inventory and Credits). No binary assets beyond JPEG
screenshots under `docs/`. Generated reports kept except four raw tournament archives (444 KB, recoverable from `6a92862`). No secrets
or `.env` files exist. The import is pinned to `6a92862` and is a parent of V2's import commit. Details: [`MIGRATION.md`](MIGRATION.md).

## 15. Initial V2 design decisions

1. **The engine stays authoritative and unchanged in Classic.** V2 capabilities arrive behind `src/v2/features.ts` switches that ship
   off; with all of them off the game is V1, proven by `tests/unit/v2-migration.test.ts` on every `npm test`.
2. **Models propose, the engine disposes.** A model may return a structured interpretation or a villager intention; only
   `GameSession.act` changes a run, and every accepted model output is recorded so a replay never calls a model again.
3. **New code lives beside the old, not inside it**: server inference under `server/` (Vercel functions), the generative rule language
   and its compiler under `src/engine/rule-language/` as a superset that compiles V1 `RuleSpec`s unchanged, model-backed villager cognition under
   `src/agents/`, adapters to `RunState` at the edges. A new rule primitive must change both the canonical simulation and the 3D world.
4. **Any change that moves a classic hash is a rules change**: bump `RULES_VERSION`, re-record fixtures, update the tripwire, say why.
5. **The 3D renderer is kept and raised to the visual standard**, with the 2D map as the low-capability fallback. Every 3D claim needs a
   capture from the running canvas; software-rasteriser frame rates are reported as such.
6. **Fix-forward list**: D7, D8 and D9 are small, user- or agent-facing and worth fixing early with regression tests; D1 is solved by
   the V2 decision ledger; D4-D6, D10-D11 when their area is next touched.

## 16. Active V1 work that is not in the import

V1 has an open pull request that was still receiving commits while this audit ran:
[JaredVogler2/BeliefEngine#2](https://github.com/JaredVogler2/BeliefEngine/pull/2), *3D village, part 2: immersive HUD, end-of-run
world, art-director pass, final review*, branch `claude/gracious-gates-95kmda`, head `37ed18a` (2026-10-27 18:43 UTC), **base exactly
`6a92862`**, 15 commits, 83 files, +3,892 / −463. It was inspected read-only (fetched into the scratch clone, never into the V1
checkout).

| | |
|---|---|
| What it adds | an immersive HUD (rail, story tray, anchored card, side/bottom sheet, camera insets), an end-of-run scene of the real final world, an art-director pass (bridge rides the surge, portrait phone framing, birds, clouds, contact shadows, seasonal trees, rain rings, faction marks), draw-call batching, `desktop-3d`/`phone-3d` Playwright projects and a CI job that draw the 3D world, `perf-3d`, `browser-3d-smoke` and `capture-matrix` scripts, and `docs/3d-rebuild/{VISUAL_QA,PERFORMANCE,ASSET_LICENSES,FINAL_REVIEW}.md` with 16 captured frames |
| What it leaves alone | `git diff 6a92862 37ed18a -- src/engine mcp server tests/fixtures` is empty: no rule, hash, save or MCP change |
| Its own evidence | 364 unit tests, 32 browser tests on the 3D scene, 140 on the 2D map, cross-browser smoke 8/8; WebKit 26.6 draws the 3D world, Firefox 155 headless falls back to 2D; scores three visual areas 3 of 5 and does not claim "premium" |
| CI state when inspected | push run on `37ed18a` green; the pull-request run failed one 2D test by timeout (Journey C on the phone, 8.2 min, waiting for `confirm-end`) with 139 passed, its suite taking 14.0 min against 7.5 min in this container |
| Its art direction | "an inked storybook diorama … floating in a sea of cloud", from a cozy village-builder reference given to that session. **V2 follows a different reference** (a dusk, lantern-lit canyon village; [`3D_VISUAL_STANDARD.md`](3D_VISUAL_STANDARD.md)): daylight readability and many of JaredVogler2/BeliefEngine#2's assets carry over, the floating-island setting and daytime-only palette do not |
| Name collisions with V2 | both add `docs/3D_VISUAL_STANDARD.md` (V2 keeps its own; V1's would move to `docs/v1/`); JaredVogler2/BeliefEngine#2 adds `tests/e2e/world3d.spec.ts`, which is why V2's 3D spec is named `tests/e2e/v2-world3d.spec.ts` |

**Decision.** V2's baseline stays on merged `main@6a92862`: it is the audited, merged, CI-green source, and JaredVogler2/BeliefEngine#2 is unmerged and was
changing during the audit. Because V2 carries V1's history and JaredVogler2/BeliefEngine#2 is based on `6a92862`, bringing it in later is an ordinary
`git merge` of V1's `main` once JaredVogler2/BeliefEngine#2 lands (or of `37ed18a`'s successor if the owner wants it sooner). That merge should happen
before any V2 work on `src/render3d/` or `src/ui/play/`, to avoid editing the same files twice; [`CONTINUE_HERE.md`](CONTINUE_HERE.md)
lists the expected conflicts and how to resolve them.
