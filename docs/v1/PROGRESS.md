# Progress

Honest status per phase. "verified" means executed and checked in this repository; evidence is listed. Nothing is marked
implemented unless it was run.

| Phase | Topic | Status |
|---|---|---|
| 00 | Master goal / contract | applied |
| 01 | Design bible, rules, schema | working (docs/GAME_RULES.md, docs/CONTENT_SCHEMA.md) |
| 02 | Architecture + bootstrap | verified (npm ci, typecheck, lint, unit, build, E2E all run) |
| 03 | Social simulation | verified by unit tests (hub vs hermit, cut graph, saturation, reverse signal, determinism) |
| 04 | Laws + world | verified: causal toggle test (same beacons + flood, only belief differs), hysteresis, contradiction |
| 05 | Flood at Redbank vertical slice | verified: both strategies replayed via real clicks to victory with identical state hashes; loss path; phone run |
| 06 | Interface + onboarding | verified: HUD, panels, tutorial, social lens, debrief, phone layout; axe scan clean |
| 07 | Content + scenarios | 3 of 5 shipped and verified (Redbank, Harvest, Ashwood); scenarios D and E not built (see KNOWN_ISSUES) |
| 08 | Procedural runs | verified: 3 biomes, 14 modifiers, daily/share/replay flows, 1 000-seed offline run (docs/EXPEDITIONS.md) |
| 09 | Progress + rewards | verified: Atlas, 20 achievements each with a proof test, 6 unlocks that add options, pledges/drafts, readable score, export/import/reset |
| 10 | Agent AI + reactions | verified: utility intents with reasons, law credibility + capped memory, faction bans/endorsements, callouts; 19 tests |
| 11 | Balance bots + telemetry | verified: paired 1 000-seed tournaments, exact tests, one evidence-based rule change with a paired re-run (docs/BALANCE_REPORT.md) |
| 12 | Audio + art + juice | verified in code and tests (procedural Web Audio with leak tests, event-derived effects, reduced-motion parity); never heard or seen by a second person |
| 13 | Mobile / a11y / perf | verified in Chromium, Firefox and WebKit builds (smoke), 320 px, large text, axe; no real device |
| 14 | Testing, security, release | verified: CSP checked in a real browser, audit and licences clean, fresh-clone gates, CI workflow; **not deployed** |
| 15 | Adversarial fun review | done: ten problems ranked, five fixed with regression tests, one earlier claim corrected (docs/FUN_REVIEW.md) |
| 16 | MCP agent play | verified: local stdio server, real-SDK stdio tests, a scripted demo agent and a real Claude Code session whose run replays identically; **remote HTTP not built** (docs/MCP.md) |
| 17 | Natural-language beliefs | verified offline: composer, balance, safety test, browser and MCP flows, hold-out corpus, real agent sessions; the optional online interpreter is **mock-tested only** and never ran against a provider (docs/NL_BELIEFS.md) |
| 18 | Final cross-interface acceptance | done: Journeys A, B and C pass; fun re-evaluation, novice pass and an exploit hunt that found and fixed one real balance hole; remote MCP **not built**, LLM-enhanced composer **unverified**; nothing deployed, no human playtest (docs/FINAL_ACCEPTANCE.md) |

## Log

### Session 1
* Scaffolded Vite/React/TS project; pinned versions (see DECISIONS D1).
* Built the deterministic engine: core types, stateless RNG, canonical hashing, persuasion math, propagation,
  law resolver (hysteresis, contradictions), effect primitives, flood/fire/bridge hazards, rivals, routines,
  actions with exact previews, session with undo, save/load, replay.
* Flood at Redbank authored (14 villagers, 34 ties, 4 factions, 4 claims incl. one rival, 3 rituals).
* Evidence (command `npx tsx tmp/botrun.ts 30`, scratch script): no-op 0/30 wins, random 3/30, greedy fire-wall bot 26/30,
  greedy witness-bridge bot 28/30. Bots use exact previews, so these are upper bounds on human performance, and difficulty
  tuning is scheduled for phase 11.

### Session 1, later
* Built React UI + Canvas2D renderer (title with live backdrop, briefing, play HUD, claim hand, inspect/laws/village/forecast/log
  panels, plan bar with undo and confirmed End Day, night digest, debrief with causal chains, settings, how-to).
* `window.__belief` debug API (only with `?debug=1`).
* **Bug found by E2E and fixed**: pressing Enter opened the End Day dialog and the same key press activated its primary button,
  ending the day without confirmation. Fixed with `preventDefault` + deferred focus; covered by the keyboard test.
* Evidence (all executed): `npx vitest run` 49 passed; `npx playwright test` 25 passed / 9 project-specific skips
  (desktop 1366x768 and Pixel-7-like 390x844 touch, Chromium 1.63 build). axe-core WCAG 2.x A/AA scan has no critical or serious
  violations on title, how-to, settings, scenarios, briefing, play, villager card, laws, forecast (desktop and phone).
* Not yet verified: Firefox / WebKit (not installed in this environment), real devices, human fun.

### Session 2 (phases 06-08 completed)
* Phase 06/07: generalised the HUD, forecast, tutorial and renderer to crop, trade, wolf and smoke scenarios; **Harvest** and **Ashwood** play end
  to end in the browser. Real-click Playwright replays of the recorded winning traces (two strategies each) reach victory with
  identical state and event hashes; "do nothing" is a defeat with a scenario-specific debrief.
* Bugs found by those E2E runs and fixed: counter-rumour button hidden for villagers a rival had *announced* a campaign against
  (only shown after they already believed it); adoptable rival claims (Ashwood's decoy theory) were missing from the starter hand;
  trade deals had no UI entry point.
* **Latent bug found while building the generator:** woodcutters never produced fuel, because the dawn tally ran after
  villagers had gone to bed (`duty === 'rest'`). Fixed (count at dusk); Ashwood fixtures re-recorded (same canonical seed, new hashes).
* Performance: `cloneState` is now a hand-written copy that shares the immutable map and event objects; a full bot run went from
  about 0.55 s to 0.15 s and the unit suite from 13 s to 4 s, with all recorded hashes unchanged.
* Phase 08: expedition generator (river, drought, wolves), 14 run modifiers each with a measuring test, share-link validation,
  UTC daily village, verified-village catalog. Evidence: `npm run gen:verify` over seeds 1-1000: 0 crashes, 0 villages won by doing
  nothing, 85.5% won by at least one scripted planner (river 83%, drought 98%, wolves 75%), 51.6% by two or more different planners; 640 distinct
  signatures. Full table in docs/BALANCE_REPORT.md. The 95% aspiration is **not** met, so the catalog is used for daily and
  "another village" and typed-in seeds are labelled unverified.
* Evidence (executed): `npx vitest run` 117 passed; `npx playwright test` 49 passed, 19 project-specific skips.

### Session 2, later (phases 09-10)
* Phase 09: Atlas of Belief (laws, lore, postcards, badges, unlocks, stats, archive export/import/reset), 20 achievements, each earned in a test by a named planner and seed;
  six unlocks that add choices rather than power (an extra Redbank opening story with a real cost, the Oath pledge, three more pledges, story twists, a hostile-council preset, draft mode);
  rewritten score (categories disclosed, efficiency only on victory, multipliers for difficulty/pledges/draft/twists). Debug-loader runs are archived but earn nothing; archive import is defensive (v1 migration, unknown fields dropped, size caps).
  Fixtures re-recorded after the score change.
* Phase 10: villager intents as small utility scores with reasons (the bridge watch versus a threatened child), law credibility damage and capped memory, Council gathering bans (announced a day ahead, answerable, budgeted), faction endorsements, "what is going on" callouts, COUNTER offered against announced campaigns before the rumour exists.
  A new unit test found a real bug in my own endorsement code (it crossed a fallen bridge); fixed.
  Finding: laws almost never wavered in 300+ bot runs, so the planned "phoenix" achievement was replaced by "Unshaken" (win after a law visibly failed before the last night and still stood). See KNOWN_ISSUES.
* Evidence (executed): `npx vitest run` 179 passed; `npx playwright test` 59 passed, 23 project-specific skips; `npm run gen:verify` refreshed: 853 of 1000 villages verified, 0 crashes, 0 do-nothing wins.

### Session 3 (phase 11)
* Built the headless tournament harness (`npm run test:sim`, `npm run test:sim:smoke`), eight scenario-agnostic bot policies on the public API plus a privileged rollout oracle, telemetry per run, paired same-seed comparisons, rescue / decision-density / determinism samples, JSON + CSV + Markdown reports, regression traces (`tests/fixtures/tournament-traces.json`), and exploit-probe tests (`tests/unit/exploits.test.ts`).
* Baseline (32 000 runs: 4 scenario families x 8 policies x 1 000 seeds, 2 685 s): 0 crashes, 0 timeouts, 0 engine violations, all repeated runs identical. Findings: Redbank's Witness Bridge route won 99.5-100% of seeds with a single outcome and no rival move; Harvest and Ashwood are won only by one law each among the generic bots; the best plan is close to the oracle everywhere.
* **Balance change from the data (paired re-run, same 1 000 seeds):** a second Redbank rival (Old Harl, "A crowded bridge is a broken bridge"). Bridge-builder 99.5% -> 81.5% (+5/-185), evidence-first 100% -> 99.8%, the fire route bit-for-bit unchanged, Harvest/Ashwood/expeditions identical state hashes in 2 400 sampled runs. Evidence-first still wins almost everything and the report says so.
* Integrating the rival exposed a real bug (a rival bridge rumour sent its own believer to stand on the bridge and cost the food that route needs); fixed in `ai/routines.ts`, `ai/utility.ts`, `world/hazards.ts`.
* Evidence (executed): `npx vitest run` 233 passed (this includes tests for work that lands in later commits of the same session: audio, performance and MCP), `npx playwright test` 89 passed / 47 project-specific skips, `npm run lint` and `npm run typecheck` clean.
* Not done / honest limits: no human playtest (protocol in `docs/PLAYTEST_PROTOCOL.md`); bots are proxies; scenarios D and E still unbuilt.

### Session 3 (phases 12-14)
* **12 Audio, art, juice.** Effects are derived from engine events only (no effect without an event), with caps and reduced-motion parity; procedural Web Audio (wind, creek, creaks, a panned bell) with a voice cap and leak tests against a fake `AudioContext`; an end-of-run scene that tells the truth at a glance; an asset ledger (`docs/ASSETS.md`: nothing third-party). Heard by nobody.
* **13 Mobile, accessibility, performance.** Settings, cold-start and interaction timings (`docs/PERFORMANCE.md`), 320 px and large-text layouts, a Chromium/Firefox/WebKit/iPhone smoke project (`npm run test:e2e:browsers`), resilience paths (storage full, corrupt save, render crash) with a visible "Not saved" indicator.
* **14 Testing, security, release.** `vercel.json` with a strict Content-Security-Policy verified by a real browser against `dist/` (`npm run verify:hosting`, with a negative control), licence inventory, `npm audit` clean, release checklist, CI workflow, rewritten README. **Not deployed; no URL is claimed.**

### Session 3 (phase 15, adversarial fun review)
* Seven reviewers (newcomer, strategist, speedrunner, bored player, story lover, mobile player, QA) run with the real build, headless probes, the tournament data and a monkey tester. Ten problems ranked in `docs/FUN_REVIEW.md`; **five fixed** with regression tests: a morning report that says who the story reached (the old digest said "A quiet night" on 160 of 160 first nights, and the tutorial's own first Tell in Harvest could not spread), a coach that names the villager you picked and no longer covers the map, an informed opening choice with explained locked cards, a replay-verified "what would have changed it" after a defeat (also in MCP `get_results`), and the phone top bar; plus a `T` key for the most repeated move.
* **A claim in this repository's own balance report was wrong** and is corrected: phase 11 said no lost Harvest run was recoverable with three days left; with the scripted caravan planner 34% are (the generic bots cannot find that route).
* Four problems are open with a stated next change (belief changes the world late, the last days are decided, route variety, peeking via a save file).
* New tools: `scripts/fun-review-browser.ts`, `scripts/fun-review-probes.ts`, `scripts/fun-review-rescue.ts`, `scripts/monkey.ts`.
* Evidence: see `docs/TEST_RESULTS.md` (phase 15 section).

### Session 3 (phase 16, local MCP agent play)
* `mcp/service.ts`, `mcp/server.ts` (official SDK `McpServer` over stdio): the same `GameSession` as the browser, 19 tools at that point, 21 after phase 17 added `confirm_belief` and `list_belief_examples` (plus a debug dump that exists only with `BELIEF_ENGINE_DEBUG_TOOLS=1`), resources (rules, tool guide, one mission per chapter) and prompts, revision checks, idempotency keys, coach and delegate modes, replay-verified persistence, no network or process modules.
* Evidence: tests with the real SDK client over stdio and a raw JSON-RPC probe (`mcp-stdio.test.ts`), service tests (`mcp-service.test.ts`), `npm run mcp:demo` test; a scripted agent (`docs/data/mcp/demo-redbank-seed*.md`, wins 4 of 8 seeds, every trace replays identically); **a real Claude Code session** played Redbank seed 11 through the server with `claude -p`, lost, and its persisted run replays in the browser engine to the identical state and event hashes (`docs/data/mcp/claude-code-session-redbank-seed11.md`); `claude mcp add` / `claude mcp list` connected from the repo and from another directory.
* Found by playing it as an agent: `end_day` returned a thinner morning than the browser (now the same `story` lines), and a challenge aimed at an unknown rumour gave no way forward (the error now lists the rumours that exist).
* **Not built:** remote Streamable HTTP (needs a durable store, authorization, rate limits and a protocol revision the newest official SDK available here does not implement). Documented as unverified in `docs/MCP.md`. Not tried: Claude Desktop, ChatGPT or other clients.

### Session 3 (phase 17, natural-language belief composer)
* **What exists.** *Inventor mode* (unranked, opt-in in the briefing, never in the daily): the player types a sentence and an offline reader turns it into a bounded rule (`src/engine/nl/`: ontology, strict AST, one balance formula, a three-night safety test on a derived seed, preview, confirm). The `COMPOSE` action rebuilds everything from the structure. Browser modal (`src/ui/play/Compose.tsx`), MCP `submit_belief` / `confirm_belief`, a guarded optional online interpreter (`server/interpreter.ts`, `src/ui/interpreter.ts`) that has **only been run against a mocked provider**. Full description, limits and numbers: `docs/NL_BELIEFS.md`.
* **Evidence.** Corpora with honest first-run numbers (development 133/133 after tuning; second set 33/47 on its first run; final untuned set 31/36 with 12/12 refusals correct); a demo that plays two or more sentences per chapter from words to a measured physical effect with a no-model replay; unit tests for balance, compose, corpus, model mode (19, mocked provider), the browser client (4), MCP belief tools (14) and the real stdio server; Playwright flows on desktop and phone (`tests/e2e/inventor.spec.ts`); **real Claude Code sessions** that wrote beliefs through the MCP tools (`docs/data/nl/claude-code-inventor-session-*.md`).
* **Found while building it, and fixed.** Two advertised effects that never executed (a bell-powered river belief; a sickness "cold" cost); a saved or imported belief whose numbers were edited (now refused on load); a written copy of a built-in law that was *easier* than the built-in (55% vs 58% support: a bot won Harvest 30/30 with the copy against 18/30 with the original; the formula now never asks less, checked against every built-in law); a believer requirement no small hamlet could meet (now capped by the electorate); two offered sentences the reader could not read back (now a test over all of them); a guessed power source presented as understood (the "morning sun" case); the Cyrillic look-alike and invisible-character cases; a bell-powered bridge belief that would have sent villagers to stand watch.
* **Found by six real agent sessions** (not by tests; `docs/data/nl/`): `confirm_belief` failed after any other action because tokens were bound to the run revision (removed; the engine re-checks at confirm); a bell belief defaulted to a bank with no bell tower; refusals were generic for "nobody can ever die", "safe forever" and "never harm anyone" (now by name); the new belief's own actions were missing from the next-actions list; in Harvest every sentence that worked was already a built-in story (the vocabulary was widened, offers now say which are built-in, and `list_belief_examples` and a "What can I write?" list teach the vocabulary); a guessed power source and silently "unused" words; names cut to "Brother"; `mode` returned the controller. **In all six sessions the agent's own belief never became law**: a written belief is a real cost, not a shortcut.
* **Not done / not verified.** No human has used it. The online interpreter has never called a provider; nothing is deployed. Typos are refused by design. A written belief often does not become law in time (intended; unmeasured with people). The widened vocabulary and the recalibrated formula were checked by tests and bots; sessions 1 and 2 pre-date the recalibration and their run files no longer replay to the stored state; sessions 3 to 6 still do (re-checked after the phase 18 balance changes).

### Session 3 (phase 18, final cross-interface acceptance)
* **Read `docs/FINAL_ACCEPTANCE.md` for the table.** Track by track: core browser game PASS, local MCP agent play PASS, offline composer PASS within its vocabulary, custom-rule gameplay PASS, **remote MCP not built**, **LLM-enhanced composer unverified** (mock-tested only). Nothing is deployed; no human has played.
* Journey A (phone-sized human run: inspect, spread, law changes the flood, side effect, win, replay, lose on purpose and read why, win another way on the same seed) and Journey C (two freeform beliefs with different physics, refusals, reload with no interpreter, network cut) are Playwright tests on the production build; Journey B (an agent through the real stdio server: legal moves at the exact cost, the rival answered, replay hashes identical in the engine, stale / duplicate / unauthorised / illegal calls refused with the state unchanged) is `npm run acceptance:mcp`, 28 checks.
* **An exploit hunt over every offered written belief and compound found a real hole**: a written bell-and-rain belief won Redbank 40 of 40 against 36 of 40 for the best built-in route. Fixed with a strength cap and an unlock-day rule (my first version of the rule over-corrected and was narrowed); re-measured at 40 seeds per cell: nothing beats the built-in routes.
* Data integrity: replays and MCP run files now name the versions they were recorded under, and a run recorded under other versions is refused with the reason (`RUN_VERSION_MISMATCH`); a source guard test for unsafe evaluation, raw HTML and keys; hostile-payload test over the real stdio server; the one `innerHTML` was replaced; the consent text for the online interpreter now says each sentence is a paid request.
* A scripted novice (follows the on-screen prompts through the real UI, no debug access) and a ten-run, three-chapter, three-generated-village comparison are in the acceptance document, with their limits. Corrections: two documents said 13 of 18 natural sentences in the final set were read correctly; it is 14 of 18.
* Engine rules version stays `1.0.0`: phase 17 changed nothing for existing content (all recorded hashes identical; 853 of 1 000 generated villages verified with the same winning planners).
