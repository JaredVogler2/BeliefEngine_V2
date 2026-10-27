# Balance report

Numbers in this file come from commands that were run in this repository; each section says which. Scripted planners and bots are
heuristics that use exact action previews, so they are *evidence about the simulation*, not predictions of human win rates, and nothing
here says a person will find the game fun (`docs/PLAYTEST_PROTOCOL.md` is the script for finding that out; no session has been run).

## Strategy tournament (phase 11)

### What was run

`scripts/tournament.ts` (`npm run test:sim`) plays every policy on exactly the same seeds, headless, through the public `GameSession`
API, across child processes with bounded heap and a time budget. It records win/failure, end day, score, resources and belief reach
per day, law activations and durations, side effects, Influence efficiency, rival responses, causal clarity, determinism and
duration per run, and writes JSON, CSV and Markdown. Definitions are at the top of every generated `REPORT.md`.

| Run | Command | Result files |
| --- | --- | --- |
| Baseline (code before the balance change) | `npm run test:sim -- --scenario all --seeds 1000 --determinism 12 --name baseline` (32 000 runs, 2 685 s on 4 workers) | `docs/data/tournament/baseline/` |
| After the change, Redbank | `npm run test:sim -- --scenario redbank --seeds 1000 --determinism 12 --name after --compare tmp/tournament/baseline/runs.csv` (8 000 runs, 530 s) | `docs/data/tournament/after/` (`COMPARISON.md`) |
| After the change, other scenarios | `... --scenario harvest,ashwood,expedition --seeds 100 --name after-others --compare ...` | `docs/data/tournament/after-others/`, `docs/data/tournament/HASH_CHECK.md` |
| Deep sample (oracle, rescue, density) | `npm run test:sim -- --scenario all --seeds 60 --oracle 25 --rescue 40 --density 6 --determinism 8 --name deep --publish` | `docs/data/tournament/deep/` |
| CI smoke benchmark | `npm run test:sim:smoke` (256 runs, about a minute; exits 1 on a crash, softlock, nondeterminism, engine violation or a no-op win) | `tmp/tournament/smoke/` |

Cohorts: the three authored scenarios on seeds 1-1000, and **expedition** = generated villages `x1.1` ... `x1.1000` with the modifiers the
generator drew. Expedition win rates are over *every* seed, including villages the offline witnesses could not win, so they are lower than
the verified-catalog numbers below. Difficulty `normal`, day cap 60 (never reached).

### The policies (all use the same public API as a player or an MCP agent)

| Policy | What it believes makes a good turn |
| --- | --- |
| noop | control: picks the first opening story, ends every day |
| random | uniformly random legal Influence-costing actions |
| greedy | the action that raises law pressure on one chosen law the most per Influence; never touches the physical world |
| broadcaster | tell the six most charismatic villagers, convene gatherings |
| evidence-first | stage proofs on kind-omen nights, speak to skeptics, send messengers from people who saw it |
| bridge-builder | lift the weakest district first through people with ties into several districts |
| threat-aware | choose the law that fits the danger and the stores, hold Influence back for the night, then take whichever physical or trade action lowers the Forecast tab's risk the most |
| exploit-seeker | probes undo, junk targets, repeats and contradicting stories every day (any engine violation is recorded) and otherwise plays for raw progress |
| oracle | **privileged**: plays each other policy to the end on a private copy and keeps the best; it sees the night's dice and is never a fair opponent |

None of them contains a scenario, claim, landmark or villager id (`tests/unit/tournament.test.ts` greps for it).

### Baseline, 1 000 paired seeds per scenario (win rate, 95% Wilson interval)

| Policy | Redbank | Harvest | Ashwood | Expeditions (all seeds) |
| --- | ---: | ---: | ---: | ---: |
| noop | 0% (0-0.4) | 0% | 0% | 0% |
| random | 8.0% (6.5-9.8) | 0.1% | 0.4% | 2.4% |
| greedy | 65.1% (62.1-68.0) | **71.8%** (68.9-74.5) | 0% | 44.3% |
| broadcaster | 0% | 0% | 0% | 0.2% |
| evidence-first | **100%** (99.6-100) | 14.1% (12.1-16.4) | 0% | 48.6% |
| bridge-builder | 99.5% (98.8-99.8) | 0% | 0% | 22.6% |
| threat-aware | 81.9% (79.4-84.2) | 38.7% (35.7-41.8) | **79.9%** (77.3-82.3) | **60.0%** (56.9-63.0) |
| exploit-seeker | 41.3% (38.3-44.4) | 7.3% | 0% | 37.3% |

No crashes, no timeouts (so zero softlocks in 32 000 runs), 96 repeated runs per cohort with identical state and event hashes, and
zero engine violations from the exploit-seeker. Doing nothing never wins; random-legal never comes close to the best thoughtful policy.

### What the data says (the improvement cycle, step 2)

* **Most common failure.** Losing villagers (the "survivors" objective): 2 028 of the Redbank losses of non-control policies, almost all from a collapsed bridge or an unprotected east bank. In Harvest it is food and hunger together, in Ashwood always livestock, in expeditions livestock (wolf biome) then survivors.
* **Strongest exploit / dominant route.** In Redbank the Witness Bridge route won **100% (evidence-first) and 99.5% (bridge-builder) of seeds with one single outcome** (14 alive, 6 homes, the same law day) and **no rival move at all**: the Doubters' Table only watched the fire law. The fire route won 65-82%. The choice of opening story was a trap, not a decision.
* **Most boring pattern.** The same route leaves 8.2 Influence unspent and passes 29% of its days once the bridge law is live (by day 5 of 7).
* **Dominance by a single claim.** 100% of Harvest wins and 100% of Ashwood wins by the generic bots involve one law (moonlight; smoke-fear). The other authored routes (the grain caravan, the decoy fire) are won by the scripted planners that know them (`docs/EXPEDITIONS.md`), not by any generic policy: a limit of the bot set, listed under *Not covered* below.
* **Strategic separation.** On Redbank 8 of 10 thoughtful pairs differ materially in what they do or whom they win; pairs share some seeds and split others (for example fire-route policies and bridge-route policies win 65% of the same seeds and each win seeds the other loses).

### The change (one lever, with rationale) and the paired re-run

**Lever:** a second rival in Flood at Redbank, Old Harl and the Hearth Families, who remember what a crowd did to the bridge in '31 and answer the bridge law with "A crowded bridge is a broken bridge" once it has 12% support (announced a day ahead, blunted by a challenge, stood down by winning Harl over). See `docs/DECISIONS.md` D14 and `docs/GAME_RULES.md`.

**Rationale:** the data showed a route that won everything and was never opposed. Changing a number (food, bridge hit points, a threshold) would only have moved a knife edge for deterministic bots; an adversary adds a decision the player has to read and answer.

**Paired result (same 1 000 seeds, same policies, `docs/data/tournament/after/COMPARISON.md`):**

| Redbank policy | Before | After | Seeds gained / lost | Sign test p |
| --- | ---: | ---: | ---: | ---: |
| bridge-builder | 99.5% | **81.5%** | +5 / -185 | < 0.001 |
| exploit-seeker | 41.3% | 19.9% | +22 / -236 | < 0.001 |
| evidence-first | 100% | 99.8% | +0 / -2 | 0.5 |
| random | 8.0% | 6.1% | n/a | (not paired-tested) |
| greedy, threat-aware, broadcaster, noop | unchanged | unchanged | +0 / -0 | 1 |

* The fire route (greedy, threat-aware) is **bit-for-bit unchanged** seed by seed, and Harvest, Ashwood and expeditions produce **identical state hashes** in all 2 400 sampled runs (`docs/data/tournament/HASH_CHECK.md`): the change is confined to the Redbank bridge route.
* The route is no longer unopposed (rival moves per bridge-route run went from 0 to 1.3 for evidence-first and 1.8 for bridge-builder) and the skill ladder is now graded: random 6%, exploit-seeker 20%, greedy 65%, bridge-builder 82%, threat-aware 82%, evidence-first 99.8%.
* **What did not change, honestly:** `evidence-first` still wins 998 of 1 000 seeds. It stages proof on a calm night at the bridge, which both persuades skeptics and makes the village resist Harl's rumour, and it spends only about 15 of the 23 Influence the game offers it. We read that as *the best plan wins reliably* (a bot with exact previews is an upper bound for people), not as a free win: the same route is a coin flip for a plan that skips the demonstration. The report still prints a WARN for it, and it is listed in `docs/KNOWN_ISSUES.md` rather than tuned away on bot evidence alone.
* **A bug the change exposed and the fix:** bridge duty and bridge-law credit treated every `subject: bridge` claim alike, so the rival bridge rumour sent its own believer (Harl, a field hand) to stand on the deck and cost the food that route lives on (the scripted Witness Bridge planner won 19 of 30 seeds with the bug and 28 of 30 without it). Only the Keeper's own bridge stories now send believers to the deck (`ai/routines.ts`, `ai/utility.ts`, `world/hazards.ts`).

### Deep sample: oracle regret, decision density and failure fairness (60 seeds per scenario, after the change)

`docs/data/tournament/deep/REPORT.md` has the full tables. Sample sizes are small (60 seeds; the oracle ran on 25, the rescue test on the first 40, decision density on the first 6), so read these as orders of magnitude.

* **Oracle regret.** The privileged rollout oracle (it sees the night's dice, and chooses among five policies) wins 25/25 of Redbank seeds (evidence-first alone wins 60/60), 18/25 of Harvest (greedy: 44/60), 17/25 of Ashwood (threat-aware: 46/60) and 16/25 of generated villages (threat-aware: 30/60). So the best single fair policy is close to the oracle everywhere, and a minority of Harvest, Ashwood and generated seeds (28-36%) were won by **no** policy in the set. That is a floor on how many are winnable, not a count of unwinnable villages (the scripted witness planners verify 85% of generated villages; `docs/EXPEDITIONS.md`).
* **Meaningful decision density** (valuing every legal action by its exact preview; *contested* = at least half as good as the day's best). Redbank offers about 55-82 enabled actions a day, of which 40-63 help at all and **2-4 are real alternatives**, spread over 1.2-1.9 kinds of action. The greedy bot faces a forced move (at most one contested option) on 50% of its days, random on 44%, evidence-first on 6%: richer play meets more genuine choices. Ashwood is the richest (6-14 contested options a day, no forced days); Harvest is flat at 25% forced days for every policy (not investigated). No policy ever hit a day on which nothing helped (empty days 0%).
* **Failure fairness.** A lost run counts as *rescuable* when another thoughtful policy, taking over with *k* planning days left, still wins. In Redbank a loss is usually still recoverable with 3 days left (greedy's losses: 79%; the no-op's: 78%) and sometimes with 2 (greedy 79%, exploit-seeker 32%), and **never with 1 day left (0% for every policy)**. In **Harvest, no loss is ever recoverable even with 3 days left (0% for all eight policies)**: hunger and the grain are decided by about day 6 of 9. **(Corrected in phase 15: that is true only of the generic policies, which cannot find the grain-caravan route. Handing the same lost runs to the scripted chapter planners saves 41 of 120 (34%) with three days left, and still none with two or one. See `docs/FUN_REVIEW.md` FR-07 and `docs/data/fun-review/rescue.json`.)** In Ashwood a plan that had already built the right belief but not lit the fires can still be saved with 3 days left (greedy 73%, evidence-first 95%, exploit-seeker 88%) but hardly with 2 and not with 1; a plan that had built nothing cannot (0%); in generated villages 3-24% with 3 days left. Warnings are visible a day or two ahead, but the last turn is rarely a real second chance. Harvest's lack of any late recovery and the flat last day everywhere are the main fairness findings; they go to the fun review (`docs/KNOWN_ISSUES.md`) rather than being tuned on bot evidence now.
* **Run cost.** Median 70-360 ms per run for the generic policies on a four-core container (600-700 ms for the exploit-seeker, which previews more; 8-26 ms for no-op), 5-6 s for an oracle run (which plays about 60 games), 0 crashes and 0 timeouts in 2 020 runs, and every one of the 288 repeated runs reproduced its state and event hashes.

### Still true after the change, not tuned

* The bridge route's real cost is **food**, not the flood: scripted Witness Bridge ends with exactly 4 food (the objective is 4) because watchers leave the fields at dusk. Five of the baseline's 1 000 bridge-builder losses were food losses. A person who ignores food loses a won flood.
* Ashwood is won only by plans that light fires (every social-only policy: 0%). That is the design (wolves are a physical problem) but it means Ashwood's generic strategy variety is low; the scripted smoke-ring and decoy planners are the two verified winning lines.
* Harvest: greedy (71.8%) beats the "thoughtful" threat-aware policy (38.7%). The planner makes more direct tellings (21% of its actions against greedy's 9%) and sends fewer messengers (32% against 40%); we did not investigate further. Treated as a bot weakness, not a balance finding.
* The scripted planners (not part of the generic set) move differently from the generic bots after the change: on seeds 1-100 the scripted Witness Bridge won 85 before and 95 after, the scripted Fire Wall 91 and 91. Different plans meet the rival differently; we draw no conclusion from the 10-seed gain.

## Procedural generation (phase 08)

Reproduce: `npm run gen:verify` (about three minutes on four workers), then `npx tsx scripts/report-expeditions.ts`.

Seeds 1–1000 (1000 villages) were generated, checked and played by scripted planners on this machine in 155 s of wall time (0.15 s per village on 4 workers, each village played up to four times). Raw data: `docs/data/expeditions.json`.

| Check | Result |
| --- | --- |
| Hard crashes | 0 |
| Villages that passed every structural invariant | 1000 of 1000 |
| Needed a derived seed (first draw rejected) | 213 of 1000 (21.3%) |
| Still failed after 24 derived seeds | 0 (reported, not hidden) |
| "Do nothing" wins the village | 0 |
| Won by at least one planner (verified) | 853 (85.3%) |
| Won by two or more different planners | 518 (51.8%) |
| Median generation time (incl. do-nothing check) | 9 ms |

| Biome | Villages | Verified | Rate | Two+ planners win |
| --- | --- | --- | --- | --- |
| river | 334 | 273 | 81.7% | 116 |
| drought | 334 | 328 | 98.2% | 269 |
| wolves | 332 | 252 | 75.9% | 133 |

| Planner | Villages won |
| --- | --- |
| caravans | 322 |
| moonlight | 275 |
| witness-bridge | 223 |
| smoke-ring | 208 |
| decoy | 177 |
| bell-ringer | 94 |
| fire-wall | 89 |

| Run modifier | Villages | Verified | Rate |
| --- | --- | --- | --- |
| busy_harvest | 126 | 120 | 95.2% |
| clear_night_skies | 72 | 72 | 100.0% |
| cross_bank_mistrust | 162 | 112 | 69.1% |
| divided_council | 184 | 151 | 82.1% |
| doubting_scholars | 182 | 170 | 93.4% |
| early_frost | 70 | 69 | 98.6% |
| low_fuel | 170 | 141 | 82.9% |
| overcrowded_refuge | 47 | 44 | 93.6% |
| restless_wolves | 89 | 62 | 69.7% |
| river_of_reeds | 56 | 39 | 69.6% |
| silent_bells | 123 | 112 | 91.1% |
| soot_season | 47 | 36 | 76.6% |
| stubborn_elders | 195 | 156 | 80.0% |
| travelling_circus | 224 | 198 | 88.4% |

**Variety.** 640 distinct gameplay signatures in 1000 villages (signature = biome, size class, choke topology, headline crisis number, starting stories, run modifiers). In every aligned window of 12 successive seeds there were at least 11 distinct signatures. The biome shuffle bag guarantees each biome appears twice in every aligned run of six seeds.

**Known false negatives.** 147 villages (14.7%) were not won by any of the scripted planners (three per biome, deliberately simple). That is not proof that they cannot be won: a human who reads the omens and the social graph plays better than a greedy planner. These seeds are excluded from the verified catalog (daily villages and "another village" never choose them) and are labelled "Unverified seed" if a player types one in. Guaranteed solvability is **not** claimed.

