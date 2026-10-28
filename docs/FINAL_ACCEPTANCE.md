# Final acceptance (V2)

Phase 16 ([`prompts/16_INTEGRATION_RELEASE_TESTING.md`](../prompts/16_INTEGRATION_RELEASE_TESTING.md)). Each capability with its status,
the command that shows it, the seed and versions, and a real screenshot where one exists. V1's own record is
[`v1/FINAL_ACCEPTANCE.md`](v1/FINAL_ACCEPTANCE.md). Release steps: [`RELEASE.md`](RELEASE.md).

- **Verdict: integrated but not live-tested.** Every part of V2 is built and verified offline and against scripted providers;
  no language model has been called (no credential exists in this environment), nothing is deployed, and no person has played V2.
- **Evidence tree:** branch `claude/gracious-heisenberg-x6dvn1`, phase 16 commit (after `877a3a2`, which is phase 15 merged with
  `main`). **Environment:** Linux container, Node 22.22.0, Playwright 1.63.0 with Chromium 153.0.8010.12 (desktop 1366×768 and a
  Pixel 7 profile at 390×844), software WebGL for 3D, Redis 7 for the quota store; Firefox, WebKit and three iPhone profiles in CI only.
  **Versions (phase 16):** engine rules `1.0.0`, save schema 1, written-belief rules 2, language `reality-1`, reader `offline-v2.2`, prompts
  `interpret-v2.2026-10-27` / `npc-v2.2026-10-27`, ledger 1 (validator `reality-1/npc-2/talk-1`), MCP SDK 1.32.2, AI SDK 7.0.155.
- **Since phase 16:** phase 17's adversarial review ([`FUN_REVIEW_V2.md`](FUN_REVIEW_V2.md)) fixed two P0 and five P1 issues in
  `d3b83c1`; new runs are under written-belief rules 3 and reader `offline-v2.3`, and runs recorded under rules 1 and 2 replay to their
  hashes. The verdict above is unchanged.
- **Authorizations:** none given for deployment or spend; none used.
- **Not claimed:** a live URL, a live model call, a human playtest, a real iPhone, GPU frame times, a remote MCP service, a premium
  3D look.

## Journeys

| Journey | Status | Evidence (command; seed) | Screenshot |
|---|---|---|---|
| **A Classic**, inference off, no network: a legal win and a loss by clicks, each on V1's recorded hashes and replayed on the device; Harvest, Ashwood, an expedition, V1's MCP smoke | **PASS** | `npx playwright test tests/e2e/v2-journeys.spec.ts` (journey A: Redbank seed 1, the recorded Fire Wall win and the do-nothing loss; every request watched: 0 to `/api`, 0 off-origin); `redbank.spec.ts`, `scenarios.spec.ts`, `expedition-win.spec.ts`, `modes.spec.ts`; `tests/unit/v2-migration.test.ts` (V1 golden hashes), `tests/unit/mcp-stdio.test.ts` | [`v2-phase16/journey-a-classic-win-replayed-desktop.png`](screenshots/v2-phase16/journey-a-classic-win-replayed-desktop.png) |
| **B Novel law**: "chickens rise into the air when bells sound" read honestly and previewed before anything is spent; written, told first, made law by persuasion, the hens lifted; a material change (wet stone light) and a compound weather/fire law with distinct world changes and their 3D effects; a time-reversal clause named exactly; a full win and losses | **PASS offline; LIVE UNVERIFIED** (the model reading is TESTED MOCK ONLY) | `v2-journeys.spec.ts` (journey B, Redbank seed 1); `tests/unit/journeys-v2.test.ts` (B); `v2-bridge.spec.ts` (three laws, a complete win, four losses; seeds 1-3 and village `x1.2`); `v2-world3d.spec.ts` (the hens rise to the engine's height in 3D); `reality-execute.test.ts` ("three beliefs, three different worlds") | [`v2-phase16/journey-b-novel-law-preview-desktop.png`](screenshots/v2-phase16/journey-b-novel-law-preview-desktop.png), [`v2-phase16/journey-b-time-reversal-left-out-desktop.png`](screenshots/v2-phase16/journey-b-time-reversal-left-out-desktop.png), [`v2-phase09/`](screenshots/v2-phase09/), [`v2-phase10/`](screenshots/v2-phase10/) |
| **C Living society**: six named villagers with different goals hear one new belief at once and mean to answer it differently; failed proof turns all six and changes plans; trust moves and a faction answers; a model's proposals pass the server's and the engine's checks and change nothing outside legal moves | **PASS offline and with the scripted stand-in; LIVE UNVERIFIED** (no real model request has been sent, so "persona-driven model intentions" are unmeasured) | `tests/unit/journeys-v2.test.ts` (C: Redbank seed 1; the recorded "rain" chain in village `x1.2`); `mind-decide.test.ts`, `social-dynamics.test.ts`, `ai-npc-v2.test.ts`; `v2-minds.spec.ts` | [`v2-phase07/`](screenshots/v2-phase07/), [`v2-phase08/`](screenshots/v2-phase08/) |
| **D Replay**: a complete V2 run with model proposals saved, reloaded and replayed with no network to the same hashes; a newer model or prompt does not reinterpret a stored belief; corrupted saves refused by name | **PASS** (proposals from the scripted stand-in) | `tests/unit/journeys-v2.test.ts` (D: Redbank seed 2); `ledger.test.ts`, `ledger-save.test.ts`; `v2-bridge.spec.ts` (the debrief's replay check on a win and four losses, zero `/api` requests); `persistence.spec.ts`, `resilience.spec.ts`; `npm run test:sim:v2` (below) | [`v2-phase14/`](screenshots/v2-phase14/) |
| **E MCP**: the official SDK client over stdio starts a Generative run, proposes and confirms a belief, talks to a villager, advances, inspects, finishes and replays on the browser's hash; unauthorized, stale and duplicate calls denied | **PASS locally; remote MCP NOT BUILT** | `tests/unit/mcp-v2-stdio.test.ts` (4 tests: the "hens" chain on hash `0ce7238943cc8d`; stale and repeated confirmations, a villager's answer, inspection; coach mode refused); `mcp-v2.test.ts` | [`data/mcp/v2-hens-session.md`](data/mcp/v2-hens-session.md) |
| **F Phone UX**: 320/390/430 wide, keyboard viewport, consent/timeout/error, modal focus, controls, accessible output, reduced motion, save/resume; Chrome, Firefox and WebKit smoke | **PASS in Chromium (phone profile, four iPhone sizes) and in CI's WebKit (iPhone SE 320, iPhone 14 390, iPhone 14 Pro Max 430), Firefox and desktop WebKit smoke; real iPhone UNVERIFIED** | `v2-ux.spec.ts`, `mobile.spec.ts`, `a11y.spec.ts`, `persistence.spec.ts` (reduced motion, resume), `smoke.spec.ts` via `npm run test:e2e:browsers` in CI | [`v2-phase12/`](screenshots/v2-phase12/) |

## Test targets (actual counts)

| Target | Result |
|---|---|
| `npm ci`, `npm run typecheck`, `npm run lint` | pass |
| `npm test` | **59 files, 670 tests passed** (114 s, with a real Redis) |
| `npm run test:e2e:classic` (Chromium desktop + phone) | **195 passed, 73 skipped by design, 0 failed** (20.7 min, every spec including the new journeys) |
| `npm run test:e2e:3d` (software WebGL) | CI only (30-45 min on a software rasteriser): last completed run green at `c656869` (run 40650038086); phases 15-16 change no 3D code; the run on this branch's head is reported on JaredVogler2/BeliefEngine_V2#4 |
| `npm run test:e2e:browsers` (CI) | green at `877a3a2` (run 40654783693: Chromium, Firefox, desktop WebKit, iPhone 14); the iPhone SE (320) and iPhone 14 Pro Max (430) WebKit projects added in phase 16 are first run by CI on this branch's head |
| `npm run test:sim:smoke` (V1's eight policies x four families x eight seeds) | 256 of 256 runs, no crash, softlock or timeout; 32 runs repeated with identical state and event hashes; 0 engine violations; "SMOKE OK" |
| `npm run test:sim:v2 -- --seeds 20 --villages 40` (stored model outputs, no provider) | **620 of 620** runs replayed from options + actions to the same state and event hashes with identical ledgers; 8,356 stand-in villager decisions accepted (0 refused by the server), 500 beliefs written with the stand-in's reading, 3,171 ledger entries; 185 victories, 435 defeats; MOCK ONLY ([`data/sim-v2/REPORT.md`](data/sim-v2/REPORT.md)) |
| Generated simulation states without a provider call | **4,942** game days resolved in `test:sim:v2` (620 runs, 40 of them in generated villages; `fetch` disabled), plus `test:sim:smoke`'s 256 Classic runs |
| Interpretation fixtures | **332** labelled sentences (three corpora; [`data/evals/REPORT.md`](data/evals/REPORT.md)) |
| Cognitive cases | **211** villager-decision cases from seeded runs (`tests/fixtures/npc-cases-1.json`) |
| Browser console and network | no console error and no off-origin request in the journey spec and the hosting check; Classic and offline Generative runs make zero `/api` requests |
| Security fuzz | `reality-properties.test.ts` (generated ASTs and sentences), `security-chaos.test.ts` (14), phase 03's `ai-*.test.ts` |
| CSP | `npm run verify:hosting`: the build served with `vercel.json`'s headers; Classic, a Generative Reality run and the 3D world with no violation; an injected inline script blocked |
| WebGL2 | `v2-world3d.spec.ts` boots the Three.js world on WebGL2 (software rasteriser); no GPU measured |
| Bundle | `npm run size`: entry 295 KB gzip (budget 300), 3D world chunk 215 (270), reality composer 28 (40), mind panel 3 (20), CSS 9.2 (12) |
| Secrets | `npm run scan:secrets -- --history --dist`: clean |

## Live inference acceptance: **LIVE UNVERIFIED**

No credential exists here, so none of these has been run: the structured reader on 10 diverse clauses (unsupported and compound
among them); named villagers over two rounds with evidence; provider response validation, routing model id, latency, tokens, cost,
error and refusal rates; semantic accuracy; the cost cap under the rate limiter. The code paths they would exercise are tested with
the AI SDK's mock model and the scripted stand-in (`ai-*.test.ts`, `journeys-v2.test.ts`, `test:sim:v2`); mocks cannot substitute.
The UI never says a live model is on unless the server reports one; the local simulator's answers are labelled "simulated". To run
them: [`RELEASE.md`](RELEASE.md) section 5 (`npm run ai:smoke`), then record the results here.

## Deployment: **NOT DEPLOYED**

No Vercel project exists; deploying needs the owner's authorisation and billing. Steps, settings by name and cost caps:
[`RELEASE.md`](RELEASE.md). No URL is given anywhere because none exists.

## Capabilities

| Capability | Status | Evidence |
|---|---|---|
| Classic game (V1, hash for hash) | **PASS** | V1 golden hashes (`v2-migration.test.ts`), V1's browser specs |
| Written beliefs in the reality language: read offline, previewed, priced, validated, executed | **PASS** | [`REALITY_LANGUAGE.md`](REALITY_LANGUAGE.md), `reality-*.test.ts`, `v2-reality.spec.ts` |
| Reading sentences with a model | **TESTED MOCK ONLY / LIVE UNVERIFIED** | `ai-interpret-v2.test.ts`, `ai-reality-client.test.ts`, `v2-online.spec.ts` |
| Villager minds, decisions, conversations | **PASS offline; model voices LIVE UNVERIFIED** | [`MINDS.md`](MINDS.md) |
| Social dynamics (proof demands, rival claims, lies, factions) | **PASS offline** | `social-dynamics.test.ts`, `journeys-v2.test.ts` |
| Belief to reality (threshold, catalyst, consequences, provenance) | **PASS** | [`BELIEF_TO_REALITY.md`](BELIEF_TO_REALITY.md), `v2-bridge.spec.ts` |
| Written laws drawn in 3D | **PASS (matches the engine); premium look NOT MET; GPU UNVERIFIED** | [`3D_EFFECTS.md`](3D_EFFECTS.md) |
| Modes and balance (Chronicle, Living Village, Reality Lab; rules 2) | **PASS offline** | [`GAMEPLAY_V2.md`](GAMEPLAY_V2.md), [`data/tournament-v2/`](data/tournament-v2/) |
| Desktop and phone UX | **PASS in Chromium and CI WebKit; real iPhone UNVERIFIED** | [`UX_V2.md`](UX_V2.md) |
| MCP (local, stdio) / remote MCP | **PASS / NOT BUILT** | [`MCP_V2.md`](MCP_V2.md) |
| Replay and the external-decision ledger | **PASS** | [`REPLAY_V2.md`](REPLAY_V2.md) |
| Evaluations | **offline and MOCK measured; LIVE not run** | [`data/evals/REPORT.md`](data/evals/REPORT.md) |
| Security, privacy, cost controls; secret scan in CI; cost monitor | **PASS with scripted providers; LIVE UNVERIFIED** | [`SECURITY.md`](SECURITY.md), [`PRIVACY.md`](PRIVACY.md), [`COST_AND_QUOTAS.md`](COST_AND_QUOTAS.md) |
| Deployment | **NOT DEPLOYED** | [`RELEASE.md`](RELEASE.md) |

## Pending actions (owner)

1. Configure a credential privately and run `npm run ai:smoke`; then the live checklist above.
2. Authorise a Vercel deployment (or not); set the budgets in [`RELEASE.md`](RELEASE.md).
3. A human playtest, a real iPhone and a GPU measurement remain open; so do the 3D art stages (phase 10).
