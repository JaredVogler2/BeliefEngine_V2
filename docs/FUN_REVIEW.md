# Fun review (phase 15): the game, attacked by seven reviewers

**Who did this, and what it is not.** The author of this repository's code played all seven reviewers, using the production build through Playwright (real clicks, real screenshots read by eye), headless engine runs, the saved tournament data and a monkey tester. No human has played the game. Everything below is evidence about what the software does and what it tells a person; it is not evidence that anyone enjoys it. The scores at the end are the author's own heuristics.

Reproduce the evidence: `npm run build && npm run preview &`, then `npx tsx scripts/fun-review-browser.ts` (screens, inventories, overlap measurements), `npx tsx scripts/fun-review-probes.ts --seeds 40` (headless persona probes, saved in `docs/data/fun-review/probes.json`), `npx tsx scripts/fun-review-rescue.ts --seeds 40` (`rescue.json`), `npx tsx scripts/monkey.ts` (random clicking, reloads, replay checks). Before and after screenshots: `docs/screens/review-*.jpg`.

## The ten problems, ranked by player harm (and cost to fix)

Harm is judged for a first-time player first, then a returning one. "Cost" is the author's estimate of the work and the balance risk of a fix. Five were fixed in this phase; the other five are documented with the change that should be made next and why it was not made now.

| # | Problem | Harm | Cost | Status |
|---|---|---|---|---|
| FR-01 | The first night tells you nothing: the morning screen says "A quiet night", and in Harvest your first Tell cannot spread at all | critical | low | **fixed** |
| FR-02 | The tutorial card contradicts the screen (names the wrong villager) and sits on top of the story cards and the map | high | low | **fixed** |
| FR-03 | The opening choice is made blind, and dimmed cards never say why or when | high | low | **fixed** |
| FR-04 | A loss does not teach a checkable counterfactual: the "what you may have missed" lines are static rules | high | medium | **fixed** |
| FR-05 | On a phone the sound button wraps onto a row of its own and the tip card covers a fifth of the map | medium | low | **fixed** |
| FR-06 | Belief changes the world late: the first law wakes on day 4-5 of 7-9 | medium | high | open, proposal below |
| FR-07 | The last two days of a Harvest run are decided before they start; the last day of every run is | medium | high | open, measured and corrected |
| FR-08 | Variety is thinner than it looks: one Redbank route wins 998 of 1 000 seeds; drought villages are nearly interchangeable | medium | high | open, proposal below |
| FR-09 | A save file lets a human (or an agent) peek at the night's dice and take it back | low | medium | open, parity documented |
| FR-10 | Grind: telling someone takes three clicks | low | low | **partly fixed** (`T` key) |

Nothing here was invented to reach ten: FR-06 to FR-09 are limits the data shows, FR-10 is small.

### FR-01 The first night tells you nothing (fixed)

* **Evidence.** In 160 sampled runs (Redbank, Harvest, Ashwood and 40 verified generated villages, 40 seeds each) telling the person the old tutorial pointed at and pressing End Day produced a digest with no lines at all in **160 of 160**: "A quiet night.", then "Nothing remarkable happened." In Redbank someone changed their mind every time (40 of 40). In Harvest it was worse: the tutorial's own first Tell left Odo Fenn at conviction 11, one point below the 12 a villager needs before repeating a story, and nobody was told anything on **0 of 40** seeds (`docs/screens/review-before-first-night.jpg`).
* **Root cause.** The digest listed only events of importance 2 and above; belief shifts are importance 0-1. The spreading threshold (12) was a literal in the propagation code, invisible to the player, and the belief label "curious" started at 10, so a villager who would not repeat the story was labelled as if they would. The tutorial chose the most influential villager the Keeper trusts without asking whether the first Tell would reach the threshold.
* **Fix.** `nightReport` (`src/engine/core/night.ts`) is derived from the night's events and is never stored, so no replay, save or hash changes. It says who carried the story, who it reached (`0→16`), how many now repeat it, or, when nothing moved, why ("Odo holds it at only 11. People repeat a story once they hold it at 12 or more"). The same threshold is now `K.SPREAD`, the belief label aligns to it, and the Tell preview warns before the Influence is spent. The tutorial picks the person whose first Tell actually reaches the threshold. The MCP `end_day` result carries the same `story` lines (a parity gap found by this review).
* **Result.** The report names the story or the reason it stalled on 160 of 160 first nights. With the new tutorial target the first night moves someone on 38 of 40 Harvest seeds (was 0 of 40) and 35 of 40 expedition seeds (was 32).
* **Catches regressions:** `tests/unit/review-fixes.test.ts` (report, hash-stability, warning, label boundary, "the person the coach points at reaches the threshold" for 60 chapter seeds), `tests/e2e/review.spec.ts` (first night, Harvest warning), `tests/unit/mcp-service.test.ts` (MCP parity).

### FR-02 The coach contradicts the screen and covers it (fixed)

* **Evidence.** With Ivo Thatcher selected, step 3 said "Press 'Tell Mara' on the card" while the card read "Tell Ivo Thatcher" (`review-before-coach-wrong-name.jpg`). The tip card was an overlay at the bottom left: it hid the title of the opening story card and covered 8% of the map at 1366x768 and 19% on a phone (measured by `scripts/fun-review-browser.ts`).
* **Root cause.** Step 3 named the pre-computed "guide", not the selected villager; the card was positioned over the content it described.
* **Fix.** The coach is a banner row between the top bar and the map; it names the villager you selected, and says honestly when someone else would spread the story better.
* **Result.** Overlap with the map and the story cards is 0 on desktop and phone. The cost is a 55 px (desktop) or about 95 px (phone) banner while the tips last (days 1-3); because the top bar also lost a row, the phone map is 562 px tall on day 1 instead of 619 px.
* **Catches regressions:** `tests/e2e/review.spec.ts` (no overlap on both projects; step 3 names Tilly, then Ivo), `tests/unit/review-fixes.test.ts`.

### FR-03 A blind opening choice and unexplained ghost cards (fixed)

* **Evidence.** Choosing the first story is the first real strategic decision (the other story unlocks on day 3, the bells on day 4). The cards showed names only; the benefit and cost lines were hidden by a CSS rule for every unselected card, which also hid the "Unlocks on day N" text, so locked cards were just dim. After the pick, the unselected cards stretched to the height of the chosen one and sat as ghosts about 165 px tall over the map (`review-before-day1-desktop.jpg`, `review-before-expedition-day1.jpg`).
* **Fix.** While you choose, each card shows what it does and what it costs; locked cards carry an "Unlocks on day N" chip; cards keep their natural height; the coach states the unlock days; "Influence" is labelled on the plan bar.
* **Catches regressions:** `tests/e2e/review.spec.ts` ("the opening choice shows what each story does and costs").

### FR-04 A loss teaches no checkable counterfactual (fixed)

* **Evidence.** `buildDebrief`'s "What you may have missed" is a list of static rules written per chapter ("Proof beats repetition", "You never asked Dalia for grain"). They are plausible and unverified; a player cannot tell whether the advice would have saved the run. Generated villages mostly get the generic ones.
* **Fix.** After a defeat the debrief rewinds the run to each planning day with the player's own earlier choices intact, lets three simple plans play on with the real dice, and reports **the last day a different plan could still have saved the village** and what the player did against what the winning continuation did (`src/engine/core/counterfactual.ts`, run a step at a time in the background so the page stays responsive). Redbank seed 1 with a random-legal player (abridged): "the last day was day 5; you told Osric and Harl about the bells and lit the South Beacon; instead, light the Harl Beacon as proof of River fears fire and have Ivo tell Nell; 12 of 14 survive", and "from day 1, opening with the bridge story also wins". MCP `get_results { whatIf: true }` returns the same.
* **How honest it is.** The claim is narrow: *a computer-played continuation that starts differently on that day survived*. Every returned alternative carries the complete action log, and the tests replay it through the engine and require a victory with nothing rejected. It is hindsight, it is bounded by the three plans, and finding nothing (Ashwood seed 1 with that player) is reported as "none found", not as "unwinnable". It costs 0.8-4 s of engine time per lost chapter run; on 14 lost generated villages (a passive player) it found an alternative for 12, every one replayed to a victory with nothing rejected, and the slowest search took 5.9 s (the page does the work a step at a time, so it stays responsive).
* **Catches regressions:** `tests/unit/review-fixes.test.ts` (the log replays to victory; keeps the player's earlier days; deterministic; silent for victories), `tests/e2e/review.spec.ts` (card appears, resolves, page stays responsive), MCP test.

### FR-05 Phone top bar and coach (fixed)

* **Evidence.** At 412 px the sound button wrapped onto a row of its own below the status chips (`review-before-day1-phone.jpg`).
* **Fix.** The button now shares the forecast row; the coach no longer overlays the map (FR-02). **Catches regressions:** `tests/e2e/review.spec.ts` (phone project).

### FR-06 Belief changes the world late (open)

For winning bot runs the first law wakes or activates on day 4-5 (median) and becomes law on day 5-6, of a 7-9 day game; the first staged proof is day 3 in Redbank (`probes.json`, `boredPlayer`). Days 1-3 are numbers on cards. FR-01 makes the spreading visible, which is the cheap half. The other half needs a design change this phase did not make: an early, small, guaranteed omen when a story first reaches a handful of believers (lights in windows, a changed weathervane) with a real but minor effect, so that the first physical consequence of belief arrives on day 2-3. It changes balance (it is a free effect), so it needs a paired tournament first.

### FR-07 The last days are decided (open, and a correction)

Phase 11 reported that "no lost Harvest run was ever recoverable, even with three days left" and that no policy could rescue anything on the final day. The first half is **wrong as stated**: the eight generic bots cannot find the grain-caravan route, so the proxy was blind to it. The same lost runs, rewound and handed to the scripted chapter planners (`scripts/fun-review-rescue.ts`, 4 losing policies x 40 seeds):

| Chapter | Lost runs | Saved with 3 days left (generic / scripted) | 2 days left | 1 day left |
|---|---:|---|---|---|
| Redbank | 98 | 64 / 30 | 13 / 40 | 0 / 0 |
| Harvest | 120 | 0 / **41 (34%)** | 0 / 0 | 0 / 0 |
| Ashwood | 131 | 29 / 19 | 3 / 2 | 0 / 0 |

So a lost Harvest run is recoverable until three days remain (day 7 of 9) if the player finds the caravan, and not after. That is a fair point of no return for a long economic clock, but it means the last two days of a lost *or* won Harvest run have nothing at stake, and on the final day of every chapter nothing a player does changes the verdict. `docs/BALANCE_REPORT.md` and `docs/KNOWN_ISSUES.md` are corrected. The what-if card (FR-04) now tells a player their own last savable day. A real fix would give the last two days a decision with an uncertain outcome (an evacuation order, a rationing vote); that is new content and needs a paired tournament, so it is the first item for the next design pass.

### FR-08 Variety (open)

`probes.json`, `generatedVariety`: of 273 verified river villages 57.5% have exactly one winning plan (the witnessed bridge), and 78.5% of random pairs share a winning plan; drought villages are nearly one village (99.5% of pairs share caravans or moonlight; 18% have a single plan); wolves 89.6%. Redbank's best plan wins 998 of 1 000 seeds (`BALANCE_REPORT.md`). Centrality does matter, but not simply: after one Tell and one night the top three most-connected targets leave the village with 28.5 conviction in total against 17.9 for mid-ranked ones, and the three lowest-ranked 24.8 (probably because they trust the Keeper more; not tested), so *who* is a real decision. The change for next time: make each biome's second route need a different map reading (a caravan village whose road is blocked by a rival, a wolves village where the decoy is the only route).

### FR-09 Peeking at the dice (open, documented)

The night's randomness is a function of the seed, the day and the ids involved, so a reload never re-rolls it, but a downloaded save (Settings > Download this game) loaded after End Day lets a human see the night and take it back; `export_game` and `import_game` give an MCP agent the same. The phase 11 oracle, which does exactly this over five plans, wins no more than the best fair plan on Harvest and Ashwood (`BALANCE_REPORT.md`, deep sample), so it is not a balance threat, and a person who does it spends the tension they came for. No leaderboard exists to protect. Parity between humans and agents is the property that matters here and it holds.

### FR-10 Grind (partly fixed)

Telling someone is claim, villager, button. The `T` key now tells the selected villager the chosen story (and explains itself when nothing is selected); the help screen and README list it. The rest of the friction is the cost of a map-and-panels interface and stays.

## What each reviewer found

1. **Newcomer.** Four screens come before the first day (title, chapters, a 170-word briefing, then play), and the first day shows 19 controls and about 290 words including the cards. A person can reach a first Tell in four or five clicks following the coach, once the coach was right. Claim, Spread, Belief, Law, Consequence is on the How-it-works screen but the first night did not show Spread (FR-01). Terms met in the first minute and explained only later: "Influence" (labelled since FR-03), "Awakening" and "firm believers" (Laws tab, with a one-line explanation on the tab). No fix for the terms; they are listed in the playtest protocol as things to watch.
2. **Strategist.** Forecasts are usable and exact (the Tonight tab shows the tonight and the next, and previews are exact deltas). Alternate strategies win through different mechanisms in all three chapters (fire wall, witnessed bridge, bells; moonlight, caravan; smoke ring, decoy), subject to FR-08. A strategist can foresee the downside of most actions from previews and warnings; the new spreading warning closes one gap.
3. **Speedrunner.** No action trivialises a chapter: the do-nothing control wins 0 of 1 000; the exploit-seeker recorded 0 engine violations (undo restores Influence exactly, invalid targets are refused, nobody can be told twice a day, repeats are damped); skipping days has no use; reloading does not re-roll anything. Open: FR-09.
4. **Bored player.** The "drama" probe is deliberately loose (43 kinds of event count, including the player's own proofs and gatherings), so it cannot prove excitement; it shows only the absence of long silent stretches: the median longest quiet streak in a winning run is 0-1 days (at most 2). The weaker signs are the ones that matter: about 40-49% of a winning run's actions are the single most common move (telling), winning expedition runs pass 31% of their days without spending Influence, and Redbank winners pass 17%. Open: FR-06, FR-07.
5. **Story lover.** Named villagers carry wants, trust and households, deaths are named in the debrief (40 of 40 idle Redbank losses), and the rival has a face (Old Harl). Limits: a loss by hunger or livestock names nobody (0 of 40 idle Harvest and Ashwood losses list a death, because nobody died), and no event is told at household scale ("the Fenns went hungry"). Not fixed; it needs authored text per household.
6. **Mobile player.** A first action is five taps (the end-to-end test's sequence: card, panel, Village tab, villager, Tell); the phone layout, 320 px layouts and large text are tested. Fixed here: the top bar and the coach (FR-02, FR-05). Not tested: any real device, real Safari, touch latency.
7. **QA.** Monkey runs (random clicks, keys, tabs, reloads, undo, settings round trips; every state replayed from its own record and compared by hash; every game then finished by ending days): 8 sessions before the fixes and 12 after, 160 steps each, desktop and phone, all four chapter types, no crash, no blank screen, no replay mismatch, no softlock (`docs/data/fun-review/monkey.txt`). A crawl of every screen found no placeholder labels and no console errors. Misleading text found and fixed: the coach's wrong name (FR-02), the "curious" label (FR-01), and a wrong claim in this repository's own balance report (FR-07). Checked and fine: generated villages do carry their own hints (earlier notes said they did not; only the river village reuses Redbank's, and it has a bridge).

## "Would I voluntarily replay?"

| Question | Answer from the evidence | What was done |
|---|---|---|
| Does a win suggest a different next experiment? | Yes, concretely: the other opening story (a button), the heroic goal, a different village. | none needed |
| Does a loss teach a counterfactual? | It did not (static hints). | FR-04 |
| Do two generated villages need different choices after 3 days? | Partly: river and wolves villages split between routes, drought villages hardly (FR-08). | proposal |
| Is the fun part (social and physical causality) buried in menus? | The first night buried it. | FR-01 |
| Is activating a law delightful and consequential? | Consequential, yes; it arrives on day 5-6 of 7-9. | proposal (FR-06) |
| Can I finish without reading documentation? | Not reliably: the coach contradicted the screen. | FR-02, FR-03 |
| Does acting feel better than watching villagers talk? | Previews are immediate and effects follow the engine's events; the first night gave no payoff. | FR-01, FR-10 |
| Are crisis loops tense but not punitive? | Forecasts and rival telegraphs give warning; the last two days of a lost Harvest run are not interactive. | FR-07 corrected, proposal |
| Is the best strategy found by observation and experiment? | Mostly: scouting, previews and the what-if card; one Redbank route is too dominant. | FR-04, FR-08 |
| Are the novelty systems cosmetic or strategic? | Twists change persuasion and costs and say so before the run; unlocks add choices, not power. | none needed |

## The agent and natural-language phases (re-checked after phase 17)

Phases 16 (the local MCP server) and 17 (player-written beliefs) now exist. What was checked, and what it found:

* **Same limits as a human.** Agents act through the same `GameSession`: tests show the Influence cap, the refusal to overspend, undo, the once-a-day rules and the replay hashes are identical (`tests/unit/mcp-service.test.ts`). Found by this review: `end_day` returned a thinner morning than the browser; it now carries the same story lines.
* **Causality and errors.** Events carry `reason` and `cause`; refusals carry `alternatives` and an error code. `get_results` can include the what-if analysis.
* **Offline.** The server and the browser game make no network requests; a test checks that the server code imports no network or process-spawning module and needs no key. The optional online interpreter is separate, off by default, and `server/interpreter.ts` is not imported by the MCP server or the browser build unless `VITE_INTERPRETER_URL` is set.
* **Overpowered or free effects.** A written belief is priced by one formula from its structure alone; nothing in a sentence can set a cost, a threshold or a strength. This review found the formula *failing* its own rule (a written copy of a built-in law was easier than the built-in; a bot won Harvest 30/30 with the copy and 18/30 with the original) and a believer requirement no small hamlet could meet; both are fixed and now tested against every built-in law (`nl-balance.test.ts`). Effects that did not execute (a bell-powered river belief, a sickness cost) were found and fixed (`advertised-costs.test.ts`).
* **Works with the API disconnected.** The offline composer is the whole feature: with no provider, key or network every flow still works (`nl-llm.test.ts` checks that every failure of the online path is an answer, not an error; the Playwright flows run with no interpreter configured).
* **Prompt injection, unsafe code, credential leakage.** Sentences are data: instruction-shaped text is refused by name, control and invisible characters are stripped, nothing is executed or evaluated, markup is rendered as text. With a model, the claim travels as a JSON string in the user turn and the reply is held to a strict schema; a recognisable fake key is routed through provider output, errors and outages and never reaches a response or the console (`nl-llm.test.ts`, `nl-corpus.test.ts`, `mcp-beliefs.test.ts`). Not covered: a live provider (none was run), and a determined adversary testing the offline reader with sentences nobody has thought of.
* **Real agent sessions found problems the tests did not** (`docs/data/nl/claude-code-inventor-session-*.md`): a confirmation token that went stale after any other action, a default region with no bell tower, a generic refusal, missing next actions, and a Harvest vocabulary in which every sentence that worked was already a built-in story.
* **Phase 18 re-ran the balance question with the final build** (`docs/FINAL_ACCEPTANCE.md`): an exploit hunt over every offered written belief and the strongest compound pairings found one belief that beat the best built-in route (Redbank, 40 of 40 against 36 of 40); it was fixed and re-measured at 40 seeds per cell. A scripted novice that follows the on-screen prompts lost every chapter, which is a floor and not a verdict on people.
* **Not applicable yet.** Remote storage, authorization and concurrency (the server is local stdio; remote HTTP is not implemented); provider credentials in production (the proxy has never been deployed).

## Scores (author's heuristics, not market validation)

Scale 1-10, where 5 means "works but you would not recommend it". Given for the state before this phase's fixes and after. Limits: one reviewer who also wrote the game, no human sessions, bots as proxies for challenge, procedural art and audio never heard through speakers by anyone else, no real devices.

| Dimension | Before | After | Why |
|---|---:|---:|---|
| Mechanics clarity | 5 | 7 | The causal chain is now visible on the first night and in the preview; "awakening", "firm believers" and the 12-point threshold are still jargon on the Laws tab. |
| Tension | 6 | 6 | Forecasts, telegraphed rivals and deadlines work; the post-law lull and flat last days remain (FR-06, FR-07). |
| Strategic diversity | 6 | 6 | Real alternatives in every chapter, but one Redbank route and near-identical drought villages (FR-08). Not touched. |
| Approachability | 5 | 7 | The coach is correct and out of the way; the opening choice is informed. Four screens before play and the vocabulary remain. |
| Art | 6 | 6 | Consistent procedural look, readable at 320 px, not final. Unchanged. |
| Narrative | 5 | 5 | Named people and a rival; templated events, no household-scale story, two of five planned chapters missing. Unchanged. |
| Replayability | 6 | 7 | Seeds, expeditions, daily village, twists, Atlas; a loss now names a different plan and the day it still worked. |
| Technical stability | 8 | 8 | Determinism, replay, 248 unit tests, 119 passing end-to-end tests, monkey sessions, CSP; no real-device or screen-reader testing. |

## Severe defects

None open that the review could reproduce: no crash, softlock, replay mismatch or state-corruption was found in the monkey sessions, the crawl or the end-to-end suite. The severe finding was a wrong statement in this repository's own balance report (FR-07), now corrected.

## Regression results after the fixes

See `docs/TEST_RESULTS.md` for the run that follows these changes (unit, end-to-end, the one-minute tournament smoke test, the monkey sessions, lint, typecheck and build).
