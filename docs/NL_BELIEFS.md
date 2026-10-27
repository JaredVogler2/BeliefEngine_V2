# Natural-language beliefs (Inventor mode)

In an **Inventor run** the player can type one sentence about how the world behaves ("The river turns aside from lit lanterns.") and the game turns it into a belief the village can hold. Two different sentences give two different physical effects on the map, but only after villagers genuinely come to believe them: writing a belief costs Influence, and it does nothing until it has been told, spread and (usually) given a physical trigger such as lit beacons or a ringing bell.

This document says exactly what that does and does not do, how it was tested, and what has *not* been verified. Nothing here is a claim about deployment: there is no hosted service, and the optional online interpreter has never been run against a live model provider.

* Browser: **Briefing → Inventor mode**, then **Write a belief** in the hand. Previewing is free and changes nothing.
* MCP: `create_game { inventor: true }`, `submit_belief`, `confirm_belief` ([MCP.md](MCP.md)).
* Inventor runs are **unranked**: no personal bests, no Atlas entries, no unlocks, never in the daily village. They can earn one badge of their own (*Author of a law*: see a belief of your own become law). Up to **2** beliefs can be written per run.

## How a sentence becomes a law

```
text ──▶ offline reader ──▶ structure (BeliefAST) ──▶ balance ──▶ safety test ──▶ preview ──▶ player confirms ──▶ COMPOSE action
         (lexicon)           subject / effect /        one formula   3 simulated     what it does,    pays Influence    rebuilt from the
                             trigger / reach /         sets cost,    nights on a     needs, costs,                      structure again
                             strength / region         thresholds    derived seed    risks
```

1. **Read.** An offline, deterministic reader finds the words a person uses for *what* (river, rain, bridge, crops, wolves, sickness, fire), *how* (turns aside, slows, grows, repels…) and *what powers it* (lit beacons, smoke fires, ringing bells, watchers, night). It scores the pairings and either returns one reading, several (the player chooses), or nothing, with a reason. It never substitutes a "closest" meaning: whatever it could not place is reported back ("I could not use these words: …"). It does not understand language; it matches a vocabulary. There is no fuzzy matching, so typos are not understood (see the corpus results below).
2. **Structure.** The reading is a small typed structure (`BeliefAST`: one or two clauses of subject, effect, trigger, radius, intensity, plus regions). It is validated strictly: unknown keys, out-of-range numbers, a subject that cannot use that effect or trigger are all refused. The structure, not the sentence, is what the engine runs. Sentences are never executed, evaluated or turned into code.
3. **Balance.** One formula (`src/engine/laws/rules.ts: specPower`, `src/engine/nl/balance.ts`) turns the structure into numbers. Nothing is a judgement call, and nothing can be asked for in the sentence:

   | derived quantity | rule |
   |---|---|
   | power | reach × strength × how easily the trigger is met (summed over clauses); capped at 60 (a larger belief is narrowed, radius first, and the player is told) |
   | local support needed | `max(60%, 50% + power/160 − 1.2% × side-effect power)`, rounded up to 5% (the built-in laws ask for 55–60%) |
   | firm believers needed | `3 + ⌊power / 8⌋`, at most 8, and **never more than three quarters of the people who vote on it** (a hamlet of four cannot supply eight; the preview says when it is lowered) |
   | speed to take hold | `72 − power`, 40–70 (stronger is slower; the built-in laws gain 55–80 a day) |
   | durability | fades faster the stronger it is (`18 + power/2`, 18–40) |
   | Influence to write | 1 below power 10, 2 below 30, 3 above; plus 1 per telling like any story |
   | downsides | 1 from power 12, 2 from power 28: thematic ones first (lit beacons risk fire; smoke fires cause smoke sickness; bell-turned rain falls somewhere else; night work and vigils drain labour), then generic ones |

   Two more rules came from an exploit hunt over written beliefs (Phase 18, [`FINAL_ACCEPTANCE.md`](FINAL_ACCEPTANCE.md)), where a written *rain turns aside when the bells ring* beat the best built-in route in Redbank (40 wins in 40 seeds against 36 in 40):

   | rule | why |
   |---|---|
   | **strength cap for beliefs about the whole of something** (radius 0: the rain, a field, a bridge, a region's sickness): never stronger than the strongest built-in belief of that subject and effect (2 when the game has none) | a belief with no reach to price acts everywhere it is believed, so its strength is capped instead of priced; `maxIntensityFor` in `src/engine/nl/balance.ts`; the preview says when it lowers one |
   | **a written copy of an answer the chapter holds back waits for that answer's day** (for example Redbank's bell-and-rain answer unlocks on day 4, so a written copy is told from day 4) | otherwise the written copy skipped the game's own pacing; opening choices (the starters) are not held back, so a copy of one is told at once and simply costs Influence; `unlockDayFor` in `src/engine/nl/build.ts`; the preview and the confirmation say the day; a save cannot shorten it (`verifyCustomClaim`) |

   After both, no written belief in the sweep won more often than the best built-in route (40 seeds per cell; Redbank rain: 0 of 40, because it needs most of the village by day 4; Harvest *crops grow faster at night*: 24 of 40 against 27 of 40 for the built-in).

   **A written belief is never easier than the built-in law it copies**: `nl-balance.test.ts` checks the support, believers, speed and durability against every non-rival law in every chapter and in 40 generated villages, and again inside the real villages with the electorate cap. (The first version of the formula failed this: a written copy of *Moonlight ripens grain* asked for 55% where the built-in asks for 58%, and a bot won Harvest 30 times in 30 with the copy against 18 in 30 with the built-in. It was found by a bot comparison and corrected, and the same bot now wins 18 in 30 with either.)

   A compound sentence ("… and …") is two clauses in one belief: it costs more and needs more believers, and the player can instead choose just one part.
4. **Safety test.** The belief is installed in a *copy* of the village, forced to be law with every source it could need present, and played for three nights next to an identical control village on a derived seed (so it cannot reveal what will really happen to the player's village). It must be powered at all, produce no impossible numbers, create no villagers, and not make food from nothing. It reports what it changed (or that no hazard tested it). A belief that fails cannot be written.
5. **Preview.** The player sees every reading (up to three), what it really does in *this* village, what it needs, the support and believers required, the Influence cost, the risks and downsides, anything adjusted ("narrowed", "added a downside"), assumptions ("the bell tower stands in Westbank, so that is where this belief has to be held"), what it contradicts, and the safety result. They may rename the card (40 characters). A part of a sentence that cannot work here is said out loud, never silently dropped.
6. **Confirm.** The `COMPOSE` action carries the structure and the words, and **everything else is rebuilt from the structure at that moment** (the rule, thresholds, cost, contradictions, the safety test, the fingerprint). A claim edited to be cheaper, easier or stronger, a stale structure, a belief this village cannot use, a repeat, too many beliefs, or too little Influence is refused and costs nothing.

A written belief is then an ordinary story: it is in the hand, it can be told (`SEED`), carried by messengers, shown as proof if a matching ritual exists, contradicted by a rival, and it becomes law only when enough people believe it (the same local-support and firm-believer thresholds as every other law). A belief that is not believed does nothing.

## What can be said

The village models seven things. A belief picks a subject, an effect that subject supports, and a power source it can use; there are **40** combinations of words (31 that behave differently: on the river "turn aside", "bend away" and "slow" all raise the ground the same way, and for sickness "repel" and "weaken" are the same effect; the sentence's wording only changes how wide and how strong the belief is), and anything else is refused with the reason and nearby beliefs that *are* possible.

| subject | effects | powered by |
|---|---|---|
| the river / flood | turn aside (repel), draw in (attract), bend away (redirect), slow | lit beacons, smoke fires, ringing bells |
| the rain | turn away, gather, repel | ringing bells |
| the bridge | hold (strengthen), crack (weaken) | watchers on it, ringing bells |
| the crops | ripen (grow), sour (weaken) | night work, ringing bells, nothing (always) |
| the wolves | repel, attract | smoke fires, lit beacons, ringing bells |
| sickness | repel, weaken | always, lit beacons, smoke fires |
| fire | weaken, strengthen, slow | always |

A power source is a physical thing the player does: light a beacon, burn a smoke fire, ring the bell, keep a vigil on the bridge, work the fields by moon. A belief powered by "always" needs nothing set up, so it is the easiest to power and is priced for it (a larger share of the village must believe it and it pays a downside). A belief only does something on a night its source is present, and only in the places that believe it.

Stone and smoke exist in the world but have no physical effect yet, so they are not offered; the reader says so.

**Things the reader refuses, by name:** reversing or skipping time; making people immortal or safe ("nobody can ever die"); declaring victory or that the flood never comes; creating food, fuel or wealth from nothing ("infinite", "gold"); controlling minds or granting Influence; transmuting one thing into another; teleporting or moving the river, bridge or homes; new disasters and monsters; wishes and prayers; and text that tries to instruct the game ("ignore previous instructions", markup, script, URLs, `system:` prefixes). Sentences describing something the *village* cannot do (wolves in a flood village, sickness with no smoke, crops with no fields) are refused as "would change nothing you could see".

Some sentences that work (every one of the 40 combinations passes the safety test in all three chapters and three generated villages that can host it; `tests/unit/nl-compose.test.ts`; and the sentence the composer *offers* for each combination reads back as exactly that combination: `nl-balance.test.ts`):

> The river turns aside from lit lanterns. · The river slows beside lit beacons. · The river turns aside when the bells ring. · The clouds fear the ringing bells. · The bridge cannot fall while it is watched. · The bridge cannot fall while the bells ring. · The crops grow faster at night. · The crops grow faster when the bells ring. · The wolves fear smoke. · Sickness shuns smoke fires. · Flames cannot hurt the homes. · Fire spreads slowly.

Phrasing outside the lexicon is **not** understood offline. Examples that were refused for that reason: "The river grows gentle and sinks back whenever the bridge-bells ring at night." (found by a real agent session), "Rainwater is steered away whenever the bells toll.", "Anything planted at midnight rots in the ground.". The honest answer is "I could not tell what you want to happen to what", plus four beliefs that are possible.

## What was demonstrated

**Two sentences, two different effects, after real belief.** `scripts/nl-demo.ts` plays each sentence from words to world in each chapter: interpret, write on day 1, spread by real telling and messengers, wait for the law, then measure the physical effect (the probe works on a copy, so measuring never changes the run). Replays of the action log with no model and no network give identical state hashes. Data: `docs/data/nl/demo*.json`.

| chapter | sentence | law woke | support / needed, when it woke | firm believers / needed | measured effect |
|---|---|---|---|---|---|
| Redbank | The river turns aside from lit lanterns. | day 5 | 81% / 60% | 8 / 4 | ground raised against floodwater: 73 tiles |
| Redbank | No flood can break a bridge that is watched. | day 5 | 81% / 60% | 13 / 4 | bridge damage cut 70% |
| Redbank | The bridge cannot fall while the bells ring. | day 6 | 79% / 60% | 13 / 4 | bridge damage cut 89% |
| Harvest | Crops ripen faster when the moon is up. | day 5 | 77% / 60% | 12 / 4 | crop growth +19% per night |
| Harvest | The clouds gather wherever the bells ring. | day 6 | 72% / 60% | 11 / 4 | rain added to fields (2 steps) |
| Harvest | The crops grow faster when the bells ring. | day 6 | 72% / 60% | 11 / 4 | crop growth +17% per night |
| Harvest | The crops thrive everywhere. | day 8 | 70% / 60% | 11 / 4 | crop growth +16% per night |
| Ashwood | The wolves flee the smoke of the hearths. | day 6 | 79% / 65% | 5 / 3 | 60 tiles wolves will not enter |
| Ashwood | Sickness shuns smoke fires. | day 4 | 69% / 60% | 5 / 3 | people shielded from smoke harm (3 regions) |
| Ashwood | Sickness flees the open doors. | **never woke** (59% / 60%, 3 / 3 at the end, in 9 days) | | | read as *partly understood* (it could not use "open doors") |

(These are a scripted law-pushing policy, not a human: they show the pipeline works end to end and is deterministic, not how hard it is to play. A belief that would be *strong* in a small hamlet asks for no more firm believers than the hamlet has people: 3 here, where the formula alone would ask for 6.) The same belief written on day 1 cannot win the village on day 1 (`nl-compose.test.ts`): it needs days to spread.

**Two mistakes that were found and fixed on the way** (they were *advertised* effects that did not execute): a bell-powered river belief that never moved water, and a sickness belief whose "cold" drain was never applied. Both now run, with regression tests (`tests/unit/advertised-costs.test.ts`). This matters for the rest of the game too: the cost and effect text a player reads must be what the code does.

**Corpus results (offline reader), reported with the first-run numbers.** Three corpora of sentences with the expected structure or the expected refusal, in `tests/fixtures/` and `scripts/nl-corpus.ts`:

| set | role | n | result |
|---|---|---|---|
| `belief-corpus.json` | development: the reader was tuned against it | 133 | first run 120/125 (eight sentences were added afterwards, from real agent sessions, the variations they suggested and the exploit hunt); now 133/133. Tuning to a set makes its number meaningless as a measure; it is a regression guard |
| `belief-holdout.json` | second set, run **once** before any tuning | 47 | **33/47** on that first run; the failures were then fixed, so it is a development set now: 45/47 (typos, below) |
| `belief-holdout-2.json` | final set, written after tuning stopped, never tuned to | 36 | **31/36**: 14/18 natural sentences, 1/2 compound, 8/8 refusals, 4/4 injection attempts, 4/4 mismatches |

On the final set: 12 of 12 sentences that should be refused were refused; 14 of 18 natural sentences were read as intended; the five misses were four natural sentences refused as "I could not tell what you want to happen to what" and one two-part sentence ("The wolves flee the hearth smoke while fevers fade at open doors.") of which only the wolf half was read. The latter is the one *wrong-by-omission* answer: the reading it offered was correct for the part it understood, and the ignored words are reported in the preview's assumptions, but it did not say it understood only half. Overall precision on the final set was 14 of 15 offered answers correct (one partial). **Not understood, by design:** typos ("The riverr fears fyre." is refused; there is no fuzzy matching because a fuzzy match would sometimes silently read a different belief), and look-alike characters ("fіre" with a Cyrillic і is not "fire": the reader asks the player to choose between readings that do not use that word).

A sample of 36–47 sentences written by the same author as the lexicon is evidence that the vocabulary works for the phrasings the author thought of. It is **not** an estimate of how real players will phrase things. Real players would hit the "I could not tell" answer more often than these sets do. The two real agent sessions below were written by a language model with no knowledge of the lexicon: of its two first attempts at a sentence of its own, one was refused for vocabulary, and it rephrased.

**Real agent sessions** (a language model, Claude Code, through the MCP tools; nothing scripted; each ran `claude -p` with only the game's tools allowed and was asked to try one sentence the village cannot model, write one belief of its own, spread it, and report what confused it). **In all six, the agent's own belief never became law** (the run was won once, with a built-in story):

| session | chapter | what it wrote | outcome | what it exposed |
|---|---|---|---|---|
| [1](data/nl/claude-code-inventor-session-1.md) | Redbank, seed 3 | "The river turns aside from ringing bells." | **won** (bronze, 715) with a built-in story; its belief reached 42% / 0 firm believers | a confirmation token that went stale after any other action; a bell belief defaulted to the bank with no bell tower; a generic immortality refusal; "grows gentle and sinks back" not in the vocabulary |
| [2](data/nl/claude-code-inventor-session-2.md) | Harvest, seed 2 | "The clouds gather wherever the bells ring." (already a built-in story) | lost (679) | **16 sentences tried: 4 understood, all built-in stories**; "morning sun" silently read as night; the new belief's actions missing from the next-actions list |
| [3](data/nl/claude-code-inventor-session-3.md) | Harvest, seed 2 | "Wheat and barley grow faster in the valley whenever the village bells are rung." | lost (679); belief at 49% / 60% | an idea buried in a long sentence only partly refused; words listed as unused that were used; discovering the vocabulary is trial and error |
| [4](data/nl/claude-code-inventor-session-4.md) | Redbank, seed 5 | "The river flinches from the ringing bells." | lost (534); belief at 26% / 60%, no firm believers | offers that do not say which are already stories; names cut to "Brother"; (pre-existing, not fixed: beacons unreachable after the bridge falls) |
| [5](data/nl/claude-code-inventor-session-5.md) | Harvest, seed 2 | "When the village bells ring, the grain in our fields ripens faster." (new, not a built-in story) | lost (679); belief at 61% on the last night against 60%, still only *awakening* | a "safe forever" sentence downgraded to a mild buff instead of refused; (pre-existing: omens) |
| [6](data/nl/claude-code-inventor-session-6.md) | Ashwood, seed 3 | "Fever weakens beside smoke fires." | lost (738); belief at 5% / 0% | a "never harm anyone … forever" sentence refused with the generic reason; `mode` returned the controller |
What the sessions say, read plainly: **a written belief is a real cost and rarely a win.** In six of six sessions the Influence spent writing and telling it was Influence not spent on the built-in route, and it did not pay off in time (once it came within a point of the threshold on the last night). That may be the right balance (the feature is a sandbox, unranked, for trying a belief of your own) or it may be too harsh; it has not been tried by a person. Each session also found problems that no test had, which were fixed (see the table), and every fix is covered by a test. The transcripts, the agents' own summaries and the persisted action logs are in `docs/data/nl/`. Sessions 3 to 6 replay identically in the engine at the final commit (re-checked after the last balance change with `npx tsx mcp/verify-run.ts <run file>`: same state and event hashes, nothing rejected); sessions 1 and 2 were recorded before the balance formula was recalibrated and no longer replay to the same state. Sessions 5 and 6 ran on the final vocabulary and formula; the fixes their findings led to (broader refusals, the `controller` field, the rules text) were made after them and are covered by tests, but were **not tried again by an agent**.

## Safety and security

What a hostile or confused sentence can and cannot do, and the test that shows it:

| threat | what happens | where tested |
|---|---|---|
| prompt injection in the sentence ("ignore previous instructions…", `system:`, fake JSON) | the offline reader never obeys text; instruction-shaped text is *refused* as "not a statement about the world". With the optional model, the sentence travels only as a JSON string value in the user turn, never in the fixed system prompt, and the reply is held to a strict schema (unknown keys, bad types, out-of-vocabulary suggestions are dropped or rejected) | `nl-corpus.test.ts` (10 injection sentences, 4 more in each hold-out), `nl-llm.test.ts` |
| markup, script, URLs, control and bidirectional characters, zero-width text, very long input | stripped or refused; never rendered as HTML (React text nodes), never executed, never used as a path | `nl-compose.test.ts`, `mcp-beliefs.test.ts`, `nl-llm.test.ts` |
| an over-powered or free belief ("infinite food", "everyone obeys", "set my score") | refused by name; and the cost, thresholds and strength are derived from the structure, so a sentence cannot ask for them | `nl-balance.test.ts`, `nl-corpus.test.ts` |
| an edited client claiming a cheaper or stronger rule | `COMPOSE` rebuilds the rule from the structure and refuses a mismatch; nothing the client says about its own strength is believed | `nl-compose.test.ts` |
| a hand-edited save with a tampered written belief | `deserializeRun` rebuilds each written belief from its structure and refuses the save if the numbers, thresholds or fingerprint differ | `nl-compose.test.ts` |
| a model that replies with an overpowered or out-of-vocabulary rule, prose, or a refusal | out-of-vocabulary suggestions are dropped (never "the closest"), numbers are clamped, and the same balance, safety test and cost apply; a refusal or malformed reply falls back to the offline reading | `nl-llm.test.ts` |
| a provider outage, timeout, quota, missing key, or schema drift | each is an *answer* ("use the offline composer"), never an error that ends a game; the offline composer works with no network at all | `nl-llm.test.ts`, `nl-online-client.test.ts` |
| the provider key | read only from the proxy function's server environment; never in the browser build, a response, a log or the repository (a test routes a recognisable fake key through provider output, thrown errors and outages and checks it never reaches a response or the console) | `nl-llm.test.ts` |
| replay and determinism | a written belief is part of the action log; replaying the log with no model and no network gives identical state and event hashes in the browser engine, over MCP, and after a server restart | `nl-compose.test.ts`, `mcp-beliefs.test.ts`, `scripts/nl-demo.ts` |

A model can never make a belief safe or balanced by saying so: its output is a proposal about *structure* only. It cannot choose costs, thresholds, rules, regions the village does not have, or write text that the game later reads as an instruction.

## The optional online interpreter (not deployed, not run against a live provider)

The offline reader is the product. An optional second reader can propose structures for sentences the offline reader cannot place, and it is deliberately unimportant to the game: with it unavailable, nothing changes except that some sentences are refused.

* **What exists.** `server/interpreter.ts` is a bounded proxy: it accepts only same-origin `POST`s of small JSON (`{ text, ontology, context }`: no save, no villagers), rate-limits per client per minute and per UTC day, answers repeat sentences from a cache of *validated* replies, asks the provider with a fixed instruction and the sentence as a JSON string under a timeout, validates the reply against a strict schema, and returns either validated candidates or an explicit "use the offline composer". `src/ui/interpreter.ts` is the browser client: **off** unless the site was built with `VITE_INTERPRETER_URL`, and even then used only when the player ticks a box for that sentence. `server/vercel-function.example.ts` is an example adapter (kept out of `api/`, which would auto-deploy).
* **What was tested.** Everything above with a **mocked provider only**: valid, malformed, timed-out, refused, prose-wrapped and schema-drifted replies; injected claim text; quotas; the cache; a missing key; the key and the claim text never appearing in a response or the console (`nl-llm.test.ts`, 19 tests; `nl-online-client.test.ts`, 4 tests).
* **What was not.** No key was authorised for this repository, so the proxy has **never called a real provider**, never been deployed or run on a serverless platform, and no real model's behaviour on this task has been measured (accuracy, latency, cost, refusal rate). Whether a model would read "grows gentle and sinks back" better than the lexicon is untested. The request body and the reply format are written for a Messages-style API and have not been checked against a live one.
* **If someone turns it on.** Provider calls cost money per sentence (a short call, capped at 400 output tokens, with a daily cap and a cache, but real). Rate limits and the cache are in memory per function instance, so on a serverless platform they are per instance, not global; real limits need a shared store. The site's Content-Security-Policy (`connect-src 'self'`) blocks the call until the deployment adds the endpoint. When a player opts in, the sentence and the *names* of the village's features and regions (for example `flood, fire, east, west`) leave the device for that server and, through it, the provider; nothing else does. Bring-your-own-key in the browser is **not** implemented: a user's key would sit in the page, which this design avoids.
* **Configuration** (server environment only): `INTERPRETER_API_KEY`, `INTERPRETER_MODEL` (no default: it must be chosen), `INTERPRETER_ALLOWED_ORIGINS`. Without the key the endpoint answers `503 not_configured`.

## Limits and known problems

* **The vocabulary is finite and phrase-matching, not understanding.** Natural sentences outside it are refused with "I could not tell what you want to happen to what". On the final untuned set 5 of 36 were wrong; real players will phrase things the author did not think of.
* **No typo or spelling tolerance**, by design (a wrong silent guess is worse than a refusal).
* **A two-part sentence can be partly understood**; the unused words are listed in the preview's assumptions, but the status does not say "I only understood half" unless the coverage is very low.
* **Seven subjects, 40 subject/effect/trigger combinations.** In Harvest and Ashwood few of them are new and helpful: Harvest can host 7 combinations (2 are the built-in stories, 3 sour the crops, 2 are new and helpful), Ashwood 6 (2 built-in, 1 harmful, 3 new and helpful but two of them the same effect in different words). A real agent that tried 16 sentences in Harvest found that all four that were understood were built-in stories (session 2, below). The vocabulary was widened after that session (bells and "always" for crops, bells for the bridge, smoke fires for sickness); session 3 and session 5 then wrote beliefs that used it ("Bells ripen the crops"), and neither won. Stone and smoke have no physical effect yet; there is no belief about people (their trust, their fear), about food or fuel, or about the council. Offered pairs are limited to ones the engine can actually execute.
* **Beliefs are mostly local and physical.** They are as strong as the villagers who believe them; a written belief often does *not* become law in time (session 1 above). That is intended, and it is not tuned: how hard it is for people to land a belief of their own has not been measured with people.
* **Two written beliefs per run, no editing after writing.** There is no "forget" or "revise".
* **MCP tokens** live in the server process only; they do not survive a restart (the written belief does).
* **The offline reader and the lexicon are English only.** Other languages are refused, not translated.
* **Generated villages:** every offered belief passes the safety test in the three chapters and in three generated villages that can host it. That is a sample, not all 1 000 catalog villages.
* **Not measured with people.** No human has used the composer. The browser flow is covered by Playwright on desktop and phone viewports (`tests/e2e/inventor.spec.ts`), and screenshots were reviewed by the author.

## Reproduce

```bash
npx vitest run tests/unit/nl-*.test.ts tests/unit/mcp-beliefs.test.ts      # balance, compose, corpus, model-mode, MCP
npx tsx scripts/nl-corpus.ts tests/fixtures/belief-holdout-2.json           # the untuned final set (also belief-holdout.json, belief-corpus.json)
npx tsx scripts/nl-demo.ts --village redbank --out docs/data/nl/demo.json   # sentence -> law -> map, with a no-model replay (harvest, ashwood too)
npx playwright test tests/e2e/inventor.spec.ts                              # the browser flow, desktop and phone
npx tsx scripts/transcript-md.ts <claude -p stream-json file>               # how the real-session transcripts were made
```
