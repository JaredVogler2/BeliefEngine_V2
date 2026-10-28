# Test results

Every line below was produced by the command beside it, in this repository, in this environment (Linux container, 4 vCPU, Node 22.22.0, npm 10.9.4).
Re-run the commands to reproduce; nothing here is estimated. Numbers change as the project grows, so each section names the commit it was taken at.

## Release gates on a fresh clone (commit `bb11761`)

`git clone` of the repository into an empty directory, checkout of that commit, then each gate in turn (`scratchpad/gates.sh`; wall time per step):

| Gate | Command | Exit | Time | Result |
| --- | --- | --- | --- | --- |
| 1. install | `npm ci` | 0 | 5 s | lockfile installs cleanly |
| 2. typecheck | `npm run typecheck` | 0 | 7 s | `tsc --noEmit`, strict |
| 3. lint | `npm run lint` | 0 | 7 s | ESLint, no warnings; the engine forbids `Math.random` and `Date.now` |
| 4. unit and integration | `npm test` | 0 | 50 s | **13 files, 210 tests passed** (committed tests at that commit) |
| 5. production build | `npm run build` | 0 | 7 s | JS 691 KB raw / 197 KB gzip, CSS 21 KB / 6 KB |
| 6. bundle budget | `npm run size` | 0 | <1 s | within the 260 KB / 12 KB gzip budget |
| 7. hosting configuration | `npm run verify:hosting` | 0 | 4 s | `vercel.json` headers and rewrites served to a real browser: 17 checks pass, **0 Content-Security-Policy violations**, 0 console errors; a negative control (an injected inline script) is blocked and seen |

## Browser end-to-end (Playwright 1.63, working tree after commit `bb11761` plus the Phase 14 test additions)

| Command | Result |
| --- | --- |
| `npm run test:e2e` (desktop 1366x768 and a Pixel-7 touch profile, Chromium 153; the config builds and serves production) | **105 passed, 0 failed, 49 skipped** (skips are tests that apply to one project only), 212 s |
| `npm run test:e2e:browsers` (Chromium, Firefox 155.0, WebKit 26.6, iPhone-14 profile; smoke spec) | **8 passed**, 45 s |
| `npm run test:sim:smoke` (8 policies x 4 scenario families x 8 paired seeds) | 256 runs in 58 s, **SMOKE OK**: 0 crashes, 0 timeouts, 0 non-deterministic runs, 0 engine violations, no-op never wins |
| `npm audit` / `npm audit --omit=dev` | 0 vulnerabilities / 0 vulnerabilities |
| `npx tsx scripts/licenses.ts --prod` | 3 production packages (react, react-dom, scheduler), all MIT; 266 installed in total, none copyleft-strong (4 MPL-2.0 and 1 CC-BY-4.0 build-time data, none shipped) |

## Phase 15 regression run (working tree after the review fixes)

| Command | Result |
| --- | --- |
| `npm run lint` / `npm run typecheck` | exit 0 / exit 0 |
| `npm test` | **16 files, 248 tests passed** (13 new in `review-fixes.test.ts`, 2 new MCP tests) |
| `npm run build` / `npm run size` | exit 0; JS 204 KB gzip (budget 260), CSS 5.8 KB gzip (budget 12) |
| `npm run test:e2e` (desktop and phone, Chromium 153) | **119 passed, 0 failed, 51 skipped** (project-specific skips), 4.1 min; includes `review.spec.ts` (coach and cards, first-night report, Harvest warning, what-if card, `T` key, phone top bar) |
| `npm run test:sim:smoke` | 256/256 runs in 59 s, **SMOKE OK**: 0 crashes, 0 timeouts, 0 engine violations, 32 repeated runs identical |
| `npx tsx scripts/monkey.ts` (random clicks, keys, tabs, reloads, undo; state replayed from its own record; every game finished) | before the fixes 8 sessions ok; after 12 sessions x 160 steps ok (`docs/data/fun-review/monkey.txt`) |
| `npx tsx scripts/fun-review-probes.ts --seeds 40`, `scripts/fun-review-rescue.ts --seeds 40` | numbers quoted in `docs/FUN_REVIEW.md`: `docs/data/fun-review/probes.json`, `rescue.json` |

The engine's states and hashes are unchanged by the review fixes (the morning report is derived, the threshold constant has the old value), which is why the saved traces and the 25 tournament traces still replay to the same hashes.

## Phase 17 regression run (working tree, natural-language beliefs)

Taken from the working tree before the phase 17 commit (commit `ee033aa` plus the uncommitted phase 17 changes); every row is the command beside it, run in this environment.

| Command | Result |
| --- | --- |
| `npm run typecheck` / `npm run lint` | exit 0 / exit 0 |
| `npm test` | **25 files, 337 tests passed** (new: `nl-balance` 11, `nl-compose` 25, `nl-corpus` 8, `nl-llm` 19 with a mocked provider, `nl-online-client` 4, `mcp-beliefs` 14, `advertised-costs` 3, `names` 1; `mcp-stdio` and `progress` extended) |
| `npm run build` / `npm run size` | exit 0; JS 225 KB gzip (budget 260), CSS 6.0 KB gzip (budget 12) |
| `npm run verify:hosting` | exit 0 (CSP checked in a real browser) |
| `npm run test:sim:smoke` | exit 0, **SMOKE OK** (256 runs: 0 crashes, 0 timeouts, 0 engine violations, repeated runs identical) |
| `npm run test:e2e` (desktop and phone, Chromium 153) | **131 passed, 0 failed, 51 skipped** (project-specific skips), 4.1 min; includes `inventor.spec.ts` (6 tests per viewport: refusal explained, honest preview, pay and tell, not enough Influence, normal run has no composer, the help list, modal fit and Escape, unranked debrief) |
| `npx tsx scripts/monkey.ts --sessions 12 --steps 160` (half the sessions are Inventor runs and fuzz the composer with valid sentences, refusals, injections, control characters, emoji, very long text; the state is replayed with its written beliefs) | **12 sessions of 160 steps (chapters, an expedition, desktop and phone): no crash, no blank screen, every state replayed, every game finished**; the 6 Inventor sessions opened the composer 115 times, previewed 81 sentences (valid, refused, injection, control characters, emoji, very long) and wrote 6 beliefs |
| `npx tsx scripts/nl-corpus.ts` on the three corpora | development 132/132 (tuned), second set 45/47 (33/47 on its first run), **final untuned set 31/36**; reports in `docs/data/nl/*-report.json` |
| `npx tsx scripts/nl-demo.ts` (three chapters) | ten sentences played from words to a measured effect; every no-model replay identical (`docs/data/nl/demo*.json`) |
| Six real Claude Code sessions through the MCP tools | `docs/data/nl/claude-code-inventor-session-*.md`; sessions 3 to 6 replay to the stored hashes (`npx tsx mcp/verify-run.ts`) |

## Phase 17 and 18 final run (the tree committed as phase 18)

Run after the last code change, every row the command beside it, in this environment (Chromium 153, Node 22). The phase 17 section above was taken earlier in the work and is superseded by these numbers.

| Command | Result |
| --- | --- |
| `npm run typecheck` / `npm run lint` | exit 0 / exit 0 |
| `npm test` | **27 files, 349 tests passed** (new in the last pass: version stamps and `RUN_VERSION_MISMATCH`, the source guards for unsafe code and keys, hostile MCP payloads over real stdio, held-back unlock days, the strength cap, the stale belief-language refusal) |
| `npm run build` / `npm run size` | exit 0; JS 226 KB gzip (budget 260), CSS 6.0 KB gzip (budget 12) |
| `npm run verify:hosting` | exit 0 (CSP checked in a real browser, with a negative control) |
| `npm run test:sim:smoke` | exit 0, **SMOKE OK**: 256 runs, 0 crashes, 0 timeouts, 0 engine violations, repeated runs identical |
| `npm run test:e2e` | **140 passed, 0 failed, 52 skipped** (project-specific skips), 6.2 min; includes Journey A (phone) and Journey C (both viewports) |
| `npm run acceptance:mcp` | **28 of 28 checks** (Journey B over the real stdio server) |
| `npm run acceptance:fun -- --seeds 8` / `--seeds 40` follow-ups | 38 exploit-hunt cells, 0 beat the built-in best route; follow-ups at 40 seeds: `docs/data/acceptance/fun-evaluation.json`, `fun-followup-40-*.json` |
| `npm run acceptance:novice` | 24 runs, all reached a debrief, 0 console errors, 0 won (see `docs/FINAL_ACCEPTANCE.md`) |
| `npm run monkey` (12 sessions, 160 steps) | no crash, no blank screen, every state replayed, every game finished; 115 composer dialogs opened, 81 sentences previewed, 6 beliefs written |
| `npm run replay:example`; `npm run mcp:verify -- <run>` for the four recorded Claude Code sessions 3 to 6 | IDENTICAL to the recorded hashes |
| `npx tsx scripts/verify-expeditions.ts --from 1 --to 1000` (to a scratch file) | 853 villages verified, the same winning planners for every seed as the committed catalog |

What this does **not** show: no live provider call (the online interpreter is mock-tested only), no human user, no deployed site. See `docs/NL_BELIEFS.md` and `docs/KNOWN_ISSUES.md`.

## Requirement to test map (the brief's matrix)

| Requirement | Where it is tested |
| --- | --- |
| AP and cost invariants, legal and illegal actions | `tests/unit/engine-core.test.ts`, `exploits.test.ts` (undo, junk targets, overspend), `mcp-service.test.ts` |
| Deterministic PRNG, stable replay hash | `rng-hash.test.ts`, `engine-core.test.ts` (replay), `tournament.test.ts` (25 saved traces replay to the same hashes), every tournament run is repeated and compared |
| Belief propagation: trust, evidence, opposition, memory | `engine-core.test.ts`, `factions.test.ts` (memory, credibility), `exploits.test.ts` (belief farming saturates, proof needs sight) |
| Law activation, hysteresis, contradiction, physical impact | `redbank.test.ts` ("belief -> law -> world is causal", "hysteresis, contradiction, collapse"), `exploits.test.ts` (no two contradicting laws live, no double flip in a night) |
| Hazards, navigation, survival, resources | `redbank.test.ts`, `scenarios.test.ts`, `exploits.test.ts` (no negative or overflowing resource, nobody off the map) |
| Victory, defeat, impossible scenario detection | `scenarios.test.ts`, `expedition.test.ts` (structure, do-nothing must lose), `catalog.test.ts` |
| Score, achievements, progress save and reset | `progress.test.ts`, `tests/e2e/atlas.spec.ts` |
| Bad scenario input and seed versions handled | `expedition.test.ts` (ids, seeds, share links), `engine-core.test.ts` (unknown scenarios, corrupt saves), `tests/e2e/persistence.spec.ts` |
| Two Redbank wins and one loss, exact reproducible trace | `redbank.test.ts` (fixtures: fire wall, witness bridge, no-action), `tests/e2e/redbank.spec.ts` (real clicks, identical hashes) |
| A victory trace per other authored level | `scenarios.test.ts`, `tests/e2e/scenarios.spec.ts` (Harvest: two routes; Ashwood: two routes) |
| Social effect -> law -> physical change -> objective | `redbank.test.ts`, `tests/e2e/redbank.spec.ts` (clicked trace to victory) |
| Cut-off map affects social contact | `engine-core.test.ts`, `redbank.test.ts` (gossip does not cross a fallen bridge) |
| NPC strategic reaction and player counterplan | `factions.test.ts`, the Redbank rival and `tests/e2e/redbank.spec.ts` (traces contain challenges) |
| Generated seeds, 1,000+ offline | `npm run gen:verify` (`docs/BALANCE_REPORT.md`: 1 000 villages generated and played, 853 verified), the tournament (1 000 expedition seeds x 8 policies, `docs/data/tournament/baseline/`) |
| Full save and reload keeps deterministic continuation | `engine-core.test.ts`, `exploits.test.ts`, `tests/e2e/persistence.spec.ts`, `mcp-service.test.ts` (restart mid-run) |
| Event log causal provenance, never contradicts state | `redbank.test.ts` (debrief chains), `tests/unit/tournament.test.ts` (causal clarity measured), `mcp-stdio.test.ts` (history carries `reason` and `cause`) |
| Clean load, tutorial, action, AP update, day resolution, event, win and lose screens | `tests/e2e/redbank.spec.ts`, `smoke.spec.ts`, `expedition-win.spec.ts` |
| Retry same seed, new seed, share seed, campaign mode, daily mode | `tests/e2e/modes.spec.ts`, `redbank.spec.ts` (defeat debrief, retry, new seed) |
| Phone and desktop, keyboard and tap, accessibility smoke | `mobile.spec.ts`, `a11y.spec.ts` (axe, keyboard turn, reduced motion), `visual.spec.ts` (5 sizes) |
| Save/resume, corrupt save recovery, settings and mute persistence | `persistence.spec.ts`, `resilience.spec.ts` |
| No console errors in common flows, no blank screens | every spec above asserts an empty error list; `resilience.spec.ts` breaks rendering on purpose and checks the recovery screen |
| Critical touch interactions at small phone width | `visual.spec.ts` and `resilience.spec.ts` at 320 px (also with large text), `mobile.spec.ts` at 390 px |

## 3D rebuild (final build of this work, commit `7a5ea63`)

| Command | Result |
| --- | --- |
| `npx tsc --noEmit`, `npx eslint . --max-warnings 0` | exit 0, exit 0 |
| `npm test` | **29 files, 364 tests passed** (includes `render3d-plan.test.ts`: six effect-parity fixtures; `render3d-scene.test.ts`: heights, water depth and snapshot purity against the engine) |
| `npm run test:sim:smoke` | 256/256 runs in 60 s, **SMOKE OK** (engine untouched by this work) |
| `npm run build`, `npm run size` | exit 0; entry 232 KB gzip (budget 260), 3D chunk 197 KB gzip (budget 270, lazy), CSS 7.8 KB gzip (budget 12) |
| `npm run verify:hosting` | 19 checks ok; **the 3D world also loads and draws under the production Content-Security-Policy with 0 violations and 0 console errors** |
| `npm run test:e2e:3d` (`desktop-3d`, `phone-3d`: the real Three.js scene on software WebGL, real mouse and touch) | **32 passed, 0 failed**, 12.4 min: boots and draws, tap picks a villager, recorded winning line and no-op loss reach the identical hashes, medium and high tiers change nothing the engine computes, crowd/bridge/beacon picks, mid-day and mid-storm saves resume, no leaked geometry or textures, every started effect names a logged event, the 2D/3D toggle keeps the run, camera drag/wheel/orbit/reset within limits, options reach the world on its first frame, axe on the live 3D page, interface leaves at least 75% (desktop) / 60% (phone) to the world |
| `npm run test:e2e:classic` (`desktop`, `phone`: the classic map) | **140 passed, 0 failed, 52 skipped** (project-specific), 6.4 min |
| `npm run test:e2e:browsers` (Chromium, Firefox 155, WebKit 26.6, iPhone-14 profile; smoke) | **8 passed**, 52 s |
| `npx tsx scripts/browser-3d-smoke.ts` | Chromium PASS (3D drew); WebKit 26.6 PASS (3D drew); Firefox 155 headless fell back to the classic map (no usable WebGL2) |
| `npx tsx scripts/perf-3d.ts --seconds 8` | scene cost and software-GL frame times per tier: `docs/3d-rebuild/PERFORMANCE.md` (**not a GPU; no real device was measured**) |
| `npx tsx scripts/capture-matrix.ts` | 16 real frames: `docs/3d-rebuild/screenshots/`, reviewed in `docs/3d-rebuild/VISUAL_QA.md` |

Failures met on the way (all fixed or explained in `docs/3d-rebuild/FINAL_REVIEW.md`): a classic map flake from a toast that re-rendered cards, two timing races (a sheet that could not take focus in its first frame; an axe contrast reading taken mid-fade), a first-frame bug (the forecast reached the 3D world only after the first click), and tests that assumed the desktop angle after the phone view was turned.

## 3D visual pass (the finishing chain, the art pass and the quality report; final build of this work)

Every browser run below was made alone, in a container with no GPU (SwiftShader), with fonts made to match the CI runner.

| Command | Result |
| --- | --- |
| `npx tsc --noEmit`, `npx eslint .` | exit 0, exit 0 |
| `npm test` | **29 files, 364 tests passed** |
| `npm run build`, `npm run size` | exit 0. Entry 232 KB gzip (budget 260), 3D chunk 211 KB gzip (budget 270, lazy), CSS 8.5 KB gzip (budget 12) |
| `npm run test:e2e:3d`, first full run | desktop-3d **19 passed**; phone-3d **17 passed, 1 failed, 1 skipped** (the screen-size test runs on desktop only); 16.1 min. The failure was real: opening a phone's view controls re-framed the village, so the camera test's reset missed home by 12 units. Fixed, then the camera test passed on both projects and 3 times in a row on the phone |
| `npx playwright test --project=phone-3d`, after the fix | **18 passed, 0 failed, 1 skipped** (the desktop-only screen-size test), 4.5 min |
| `npm run test:e2e:classic` | **141 passed, 0 failed, 53 skipped** (project-specific), 6.3 min |
| `npm run test:e2e:browsers` (Chromium, Firefox, WebKit, iPhone profile; smoke) | **8 passed**, 53 s |
| `npm run verify:hosting` | 19 checks ok, including **the 3D world drawing under the production Content-Security-Policy with 0 violations and 0 console errors** |
| `npm run test:sim:smoke` | 256/256 runs in 60 s, **SMOKE OK** (engine untouched) |
| `npx tsx scripts/browser-3d-smoke.ts` | Chromium PASS and WebKit 26.6 PASS (3D drew, no console errors); Firefox 155 headless fell back to the classic map |
| `npx tsx scripts/perf-3d.ts --out docs/3d-rebuild/data/perf-chain.json` | per-tier frame times, 1% lows, draw calls, triangles, heap, startup and the finishing chain's own cost: `docs/3d-rebuild/PERFORMANCE.md` (**software rasteriser; no GPU or real device was measured**) |
| `npx tsx scripts/capture-motion.ts` (and `--dt 0`) | frame-to-frame change by region, about 2% per 2 s step; noise floor exactly 0: `docs/3D_QUALITY_REPORT.md` |
| `npx tsx scripts/capture-matrix.ts` and `capture-3d.ts` at four screen sizes | 16 + 4 real frames, each one looked at: `docs/3d-rebuild/screenshots/`, `docs/3D_QUALITY_REPORT.md` |

## What is not covered, plainly

* No human has played the game: no uncoached session, no fun or clarity claim (`docs/PLAYTEST_PROTOCOL.md`).
* No real phone or tablet, no real Safari; WebKit here is Playwright's Linux build and the iPhone profile is emulation. **The 3D world has only ever run on software WebGL**: no real GPU, no real phone.
* No deployed URL exists, so no live smoke test has been run (`docs/RELEASE_CHECKLIST.md`).
* Audio was exercised against a fake Web Audio graph (voice caps, leak freedom, settings); nobody has listened to it.
* The MCP server and the natural-language composer are recorded in their own phases' sections once built.
