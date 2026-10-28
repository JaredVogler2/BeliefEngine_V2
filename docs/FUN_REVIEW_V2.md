# Fun review V2 (phase 17): Belief Engine V2, attacked by eight reviewers

Phase 17 ([`prompts/17_ADVERSARIAL_FUN_REVIEW.md`](../prompts/17_ADVERSARIAL_FUN_REVIEW.md)). The game was reviewed as a skeptical strategy
gamer, a first-time player, a technical artist, a prompt-injection attacker, a backend SRE, a model-evaluation scientist, an iPhone tester
and a cost analyst, against the running code and measured evidence. Everything quantitative below is printed by a script in this
repository; nothing comes from a person playing, and no model was called.

**What this review could not do.** No provider credential exists in this environment: no model-backed playthrough was possible, so
"live mode" could not be compared with "no-key mode" (**LIVE: UNVERIFIED**; every model answer below is a scripted stand-in, **MOCK**).
No human playtested anything: every statement about fun is the reviewers' judgement from the evidence (**FUN: SUBJECTIVE, UNVERIFIED**).
No real iPhone and no GPU were used (Playwright's iPhone profiles in WebKit and Chromium, and software WebGL). The game is **NOT
DEPLOYED**.

Evidence: `npx tsx scripts/fun-review-v2.ts` ([`data/fun-review-v2/probes.json`](data/fun-review-v2/probes.json)); the same script run
against a checkout of `5132f26` (the last commit before this phase) gives the "before" numbers
([`data/fun-review-v2/probes-before-5132f26.json`](data/fun-review-v2/probes-before-5132f26.json)). The tournament under the new rules is in
[`data/tournament-v2/rules3-*`](data/tournament-v2/), the evaluation report in [`data/evals/REPORT.md`](data/evals/REPORT.md), screenshots in
[`screenshots/v2-phase17/`](screenshots/v2-phase17/) (production build, real browser).

## Verdict against the strict finish

Not complete. Each condition, as it stands:

| Condition | Status |
|---|---|
| Playable Classic | **VERIFIED**: V1's recorded win and a loss clicked on V1's hashes with no request leaving the page (journey A); V1 goldens pinned |
| Model-backed gameplay with a real provider call when configured | **LIVE UNVERIFIED**: the server, validators and fallbacks are TESTED MOCK ONLY; no credential, no call |
| Character cognition | **IMPLEMENTED, TESTED MOCK ONLY** for model decisions; the game's own policy measured (below) |
| Supported, composable reality | **VERIFIED offline**: 17 operators, three corpora, the tournament, browser chains; a first-time player's sentence is understood about half the time (below) |
| Full win/loss and offline replay | **VERIFIED**: wins and losses in every mode; recorded runs under rules 1, 2 and 3 replay to their hashes |
| Attractive actual 3D world | **UNVERIFIED** (subjective; screenshots only; the phone's low tier reads as grey blocks and outlines, below) |
| Mobile controls | **VERIFIED IN EMULATION** (320-430 px, touch targets, WebKit iPhone profiles in CI); no real device |
| Secure, low-risk model use | **IMPLEMENTED, TESTED MOCK ONLY**: one real gap found and closed (P0-1) |
| Truthful deployment | **NOT DEPLOYED**, and said so everywhere |

## The issues, ranked

Eleven real failure cases and four checked non-issues. P0 breaks a promise the game makes (honesty, price, safety); P1 makes the game
worse to learn or to master; P2 is small or only reachable with a live model. All P0 and the top P1s were fixed in `d3b83c1`; P1-7, found
while capturing the 3D world for this review, was fixed after it (the dangers on the ground; [`PROGRESS.md`](PROGRESS.md)).

| # | Issue | Rank | Before (`5132f26`) | After | Status |
|---|---|---|---|---|---|
| P0-1 | A model's reading could keep the sentence's thing and power but swap the change ("chickens fly" read as hens drawn to the bell; "no wolf can ever enter" as wolves lured in), at full confidence | P0 | 289 of 292 swapped readings accepted at full confidence | 11 of 292 (33 kept at low confidence, needing the player's yes; 248 dropped); honest readings unchanged, 191 of 193 | **fixed** |
| P0-2 | The composer's price was not the charge: a belief held in several regions showed 3 Influence and was charged 2, the button refused a legal write with 2 Influence, and MCP reported the wrong price | P0 | 4 of 72 written beliefs mismatched | 0 of 108 (rules 1, 2 and 3) | **fixed** |
| P1-1 | A ward measured from every home ("floodwater always flows away from every home") acted around all eight homes of Eastbank but was priced as one circle: the cheapest universal protection in the game, no catalyst, no upkeep | P1 | 104 tiles covered, priced as 21; power 22, 65% and 4 believers | rules 3: power 48.9, strong, 75% and 6 believers, 3 Influence | **fixed** (rules 3) |
| P1-2 | The composer's "Ideas" were the same three sentences everywhere: in Ashwood (no bell, no lanterns) every one was refused, the first thing a new player might click | P1 | understood: Redbank 3/3, Harvest 1/3, Ashwood 0/3 | 3/3 in every chapter (only ideas this village can make real) | **fixed** |
| P1-3 | An impossible sentence was offered a harmful belief instead ("Homes cannot be damaged." → "homes burn more readily, fire damage +40%"), chosen by lexicon order | P1 | 3 of 8 offers harmful | 0 of 8 | **fixed** |
| P1-4 | The offline reader missed plain phrasings of the chapters' own answers ("Floods turn away from the village.", "Wolves fear smoke, so they stay away…", "The rain answers the bells.", "every pen", "cant") | P1 | blind dev set 22/68; blind held-out set 34/69 | dev 36/68; held-out **35/69** | **partly fixed**: the honest held-out number barely moved |
| P1-5 | Words that only colour a sentence ("into the night") were dropped without a word; a left-out phrase was listed twice | P1 | flavour shown 0 of 3; duplicated line | 2 of 3 shown as "kept as words only"; listed once | **fixed** |
| P1-6 | The preview said "When always:" and "within 2 tiles of the home" for a belief that acts every night around every home, and named the selector's radius, not the reach the effect acts with | P1 | | rules 3: "Every night: … within 2 tiles of any home"; the preview names the acting reach | **fixed** (rules 3) |
| P1-7 | The 3D world drew none of the dangers the 2D map draws: no wolf pack, no live fire, no smoke round a lit fire, and ground that burned out stayed green until the village was rebuilt. A player in 3D could not see Ashwood's packs closing in or a home on fire | P1 | Ashwood seed 1, day 6: 0 wolves drawn (the engine has 3 packs out); Redbank seed 2, day 3: Ivo's home burning, nothing drawn | 9 wolves in 3 packs (as the 2D map draws them), 3 pack marks at the overview, a haze over all 21 smoky tiles; flames from the burning roof, and three nights later its tile is ash, played in the 3D world ([`world3d-ashwood-hazards-desktop.jpg`](screenshots/v2-phase17/world3d-ashwood-hazards-desktop.jpg), [`world3d-ashwood-wolves-phone.jpg`](screenshots/v2-phase17/world3d-ashwood-wolves-phone.jpg), [`world3d-redbank-fire-desktop.jpg`](screenshots/v2-phase17/world3d-redbank-fire-desktop.jpg)) | **fixed** |
| P2-1 | A villager who doubts a story and "spreads" it (a model's decision) is logged as "X tells Y “story”" though the listener cools on it | P2 | the game's policy: 0 of 119 spreads in 24 Living Village runs; the stand-in: 0 (eval) | | open: only a live model can do it; the text is in hashed events, so changing it needs a new minds version |
| P2-2 | "The bridge can never break." is read as a strong ward with no note that "never" is not a promise | P2 | | | open |
| P2-3 | On a phone the 3D villagers are a few pixels tall until the player zooms in; at 320 px the day-1 story cards, tips and HUD cover about half the screen; the low quality tier (chosen in settings, or by a slow device) reads as grey slabs and outlines | P2 | default phone tier: [`world3d-phone-390-medium.jpg`](screenshots/v2-phase17/world3d-phone-390-medium.jpg), [`world3d-phone-320-medium.jpg`](screenshots/v2-phase17/world3d-phone-320-medium.jpg); low tier: [`v2-phase10/I-phone-320-low.jpg`](screenshots/v2-phase10/I-phone-320-low.jpg) | | open (art; needs a human eye and a device) |
| P2-4 | A 3D phone test could click a shelter standing in front of the villager it aimed at (failed once in CI on `5132f26`) | P2 | 1 failure in CI | the test aims only at a point the raycast answers with that villager; 6 of 6 repeats pass | **fixed** (test) |
| — | A network error or a stopped online reading silently spends Influence | checked | | nothing is spent; the offline reading is shown and labelled ([`v2-ux.spec.ts`](../tests/e2e/v2-ux.spec.ts) "an online reading can be stopped…") | not an issue |
| — | A new seed or a restored save leaks the previous run's villager memories or the unsent draft | checked | | a fresh run of the same village hashes identically after another run; the draft is cleared on new game, load and delete | not an issue |
| — | The 320 px composer is unusable | checked | | 320, 375, 390 and 430 wide fit with 44 px controls (phone profile) | not an issue (no real keyboard tested) |
| — | Classic secretly calls a model; old runs stop replaying | checked | | Classic makes no request (journey A, `v2-online.spec.ts`); chains recorded under rules 1 and 2 replay to their recorded hashes ([`belief-bridge.test.ts`](../tests/unit/belief-bridge.test.ts)) | not an issue |

### P0-1 A model could swap what the sentence says will happen (fixed)

**Reproduce.** `npx tsx scripts/fun-review-v2.ts` (probe 2) takes every reading the offline reader gives for the three corpora (193
readings) and makes a "clever but wrong" model out of each: the same things, the same power, the words cited for the change, and a
different change on the same thing. Example: "Chickens fly when the bell rings." answered as `{ op: MOVE_TOWARD }` citing "fly".

**Code path.** [`server/ai/tasks/interpret-v2.ts`](../server/ai/tasks/interpret-v2.ts) `toWireV2` → [`src/engine/reality/fidelity.ts`](../src/engine/reality/fidelity.ts)
`fidelity()`, which checked the target kind and the trigger against the sentence, never the effect. The browser rebuilds every
candidate, prices it and shows "The game will do", so a careful player could see it; but a high-confidence reading needs no explicit
yes, and the composer promises "nothing it does not say".

**Fix.** The effect is held to the words too: `changesNamed()` reads which changes the sentence's phrases name, and which way after a
"not" in their clause (the offline reader's own rules). A change no phrase names is dropped when the cited words are known as another
change, and kept only at low confidence when the words are unknown to the game or read the other way round (a model may read a "not"
better), so the player must tick "I have checked that this reading is what I meant". What remains accepted (11 of 292) is a word the
game itself reads two ways ("spared": stronger or fireproof). Tests: [`ai-interpret-v2.test.ts`](../tests/unit/ai-interpret-v2.test.ts),
[`reality-rules3.test.ts`](../tests/unit/reality-rules3.test.ts).

### P0-2 The price shown was not the price charged (fixed)

**Reproduce.** Ashwood, Generative Reality, seed 1: "Wolves will not come near the smoke fires in every hamlet." (held in three
hamlets). The composer showed **3** Influence and "A strong belief"; `COMPOSE` charged **2**; with exactly 2 Influence the button said
"You need 3 Influence to write this and have 2" and refused a write the engine accepts. MCP's `propose_belief` reported 3.

**Code path.** [`core/actions.ts`](../src/engine/core/actions.ts) `actionCost` → [`reality/cost.ts`](../src/engine/reality/cost.ts)
`realityComposeCost` balanced with rules 1 (a radius paid once), while [`reality/build.ts`](../src/engine/reality/build.ts) priced the
preview with the run's rules (a radius paid in each region).

**Fix.** The preview's price is now `realityComposeCost` itself, for every run, so the composer, MCP and the engine give one number.
Under rules 3 the charge is the belief's whole power, as its rating always said; runs under rules 1 and 2 keep their charges and replay.

### P1-1 The village-wide ward was the cheapest universal magic (fixed, written-belief rules 3)

**Reproduce.** Redbank seed 1, Eastbank: "Floodwater always flows away from every home." Its flood ward is stamped around each of the
8 homes ([`reality/execute.ts`](../src/engine/reality/execute.ts) `anchorSources`): within 2 tiles that is **104 tiles**, priced by
[`reality/balance.ts`](../src/engine/reality/balance.ts) as one 21-tile circle. It cost what the lantern ward costs (power 22: 65% and 4
believers, 2 Influence) with no lanterns to light and no fuel. "The river turns away from the village." reads to the same ward.

**Fix (rules 3, new runs only).** A clause measured from every landmark of a kind is priced for the ground those landmarks cover, in each
region the square root of its circles (the first circle costs in full, each further one less), never less than one circle a region; one
measured from what powers it tonight (the lit lanterns, the ringing bell) is unchanged. A linear price was measured first and made the ward
unreachable for every bot (0 of 20 wins); the square root keeps it possible for a focused player and out of reach of spamming.

| Redbank, 30 seeds | Rules 2 (phase 11) | Rules 3 |
|---|---|---|
| spam-broad (writes the village-wide ward, tells everyone) | 20/30, law reached in 67% of runs | **0/30**, never reached |
| ward-greedy with the village-wide ward as its ward | | 22/30, law on day 6.9 (power 48.9, 75%, 6 believers) |
| evidence-first with the village-wide ward | | 2/30 |
| ward-greedy / evidence-first with the lantern ward (unchanged) | 24/30 / 27/30 | 24/30 / 27/30 |

Harvest is unchanged. In Ashwood the three-hamlet smoke ward now costs the 3 Influence it always showed: ward-greedy 21/30 → 7/30,
evidence-first 18/30 → 15/30, backfire-probe 7/30 → 0/30; five of nine policies still win at least once. The chapter's best bot policy wins
half its seeds, which is a harder Ashwood than phase 11 measured (a measurement of bots, not of people).

### P1-2 to P1-6 (fixed or partly fixed)

- **Ideas** ([`reality/ideas.ts`](../src/engine/reality/ideas.ts)): offered only if the offline reader reads them as understood and they build
  here; worked out when "Ideas" is first opened. Screenshot: [`ashwood-ideas-desktop.png`](screenshots/v2-phase17/ashwood-ideas-desktop.png).
- **Offers for impossible sentences** ([`reality/read.ts`](../src/engine/reality/read.ts) `alternativesFor`): a fixed order of changes that help
  (homes hold stronger, crops grow, wolves are kept away, rain falls on a dry valley's fields or away from a flooded one). Screenshot:
  [`helpful-offer-desktop.png`](screenshots/v2-phase17/helpful-offer-desktop.png).
- **Reader** (offline-v2.3): a sentence-initial noun that is also a verb ("Floods turn…"), "every"/"each"/"the animal" before a place,
  verbs whose object is the place ("avoid the pens"; never for lanterns, bells or smoke, which are powers), "cant"/"dont", the same change
  said again with its reason merged into one clause, a few phrases ("answers the bells", "run away from", "cannot see"). Corpus scores
  are unchanged (172/172, 78/80, 51/80) and reading is about five times faster than before (p50 2.5 ms, was 12.9). Measured honestly on
  sentences written blind by two independent agents (`tests/fixtures/novice-*.json`): the dev set the fixes were made against went from
  22/68 to 36/68, the held-out set from 34/69 to **35/69**. The vocabulary fixes did not generalise; the held-out number is the one to
  quote.
- **Flavour and omissions**: words kept only as flavour are the belief's narrative and the preview says "Kept as words only: … changes
  nothing"; the note repeating a left-out phrase under the list of reasons is gone. Screenshots: [`flavour-kept-desktop.png`](screenshots/v2-phase17/flavour-kept-desktop.png),
  [`left-out-named-once-desktop.png`](screenshots/v2-phase17/left-out-named-once-desktop.png).
- **Wording** (rules 3): "Every night", "any home", and the reach a narrowed ward acts with. Screenshot: [`every-home-ward-price-phone.png`](screenshots/v2-phase17/every-home-ward-price-phone.png).

## The seven critical questions

| Question | Answer from the evidence |
|---|---|
| 1. Can a new player invent a physically grounded rule within 60 s without a manual? | **Partly.** Every idea offered is now one the village can make real, but of 69 doable first-attempt sentences written blind, the offline reader understands 35 (Redbank 17/24, Harvest 9/22, Ashwood 9/23); none of 21 impossible ones is accepted. No one was timed. The online reader exists to widen this (LIVE UNVERIFIED). |
| 2. Does a creative law create a distinct social strategy? | **Yes, within limits.** A law asks for support and firm believers in proportion to its power, in the region where it acts; catalysts add work (lanterns need fuel and lighting, the bell a ritual, watchers people on the bridge); the village-wide ward now asks 75% and 6 believers. Different policies win in each chapter (Redbank 4 of 9, Harvest 5, Ashwood 5). It is still, at heart, persuading one region. |
| 3. Can a skeptic change their mind after new evidence, with an actual recorded model decision? | **Rules: yes; model: unverified.** A skeptic is moved far more by a demonstration they watch than by being told ([`factions.test.ts`](../tests/unit/factions.test.ts)); a failed proof turns six villagers in journey C (stand-in decisions, stored and replayed). No real model has decided anything. |
| 4. Can the player engineer a benefit and be surprised by a logically consistent downside? | **Yes.** A stone made light is carried to the bank and raises it, and a light stone left in floodwater floats off and rams the bridge (6 integrity each); a flood ward spares only its circle; rain moved lands on someone's low ground; hurting a region costs the Keeper its trust and may raise its leader against the belief. Each is listed under "What else it does" before writing. |
| 5. Do different statements produce different physics, not recolouring? | **Yes.** Hens lifted to an engine-computed height, stones whose mass changes and which are carried, flood stamps, rain moved between regions, crop growth, wolf paths, fire damage, sickness: separate state, separate events ([`belief-bridge.test.ts`](../tests/unit/belief-bridge.test.ts), [`reality-execute.test.ts`](../tests/unit/reality-execute.test.ts)). |
| 6. Would an uncoached player understand why something cannot happen, and what to try instead? | **Improved, unverified with people.** The reason names the words ("“time runs backwards”: the village cannot change time…"), the offer is now always a belief that helps, and Ideas work everywhere. Half of first attempts still need a second try. |
| 7. Does V2 keep a Classic offline story, a legal win and loss, iPhone controls and replay? | **Yes** (journey A; `mobile.spec.ts` and the phone specs in emulation; replays under every rules version). |

## Rubric

Scores are the reviewers' judgement from the evidence (1 poor, 5 excellent), not player data.

| Dimension | Score | Evidence | What would move it |
|---|---|---|---|
| Art, 3D | 3 desktop / 3 phone (default tier) / 2 phone low tier | Stylised low-poly diorama on desktop (tiled roofs, chimney smoke, layered trees, rain rings on the flood, glowing ward rings): [`v2-phase10/B-law-wakes-hens-lift.jpg`](screenshots/v2-phase10/B-law-wakes-hens-lift.jpg). Hens are drawn far larger than life to stay readable; submerged things are drawn as outlines. A phone's default (medium) tier keeps the diorama legible at overview distance, with villagers a few pixels tall ([`world3d-phone-390-medium.jpg`](screenshots/v2-phase17/world3d-phone-390-medium.jpg)); the low tier is grey slabs and outlines ([`I-phone-320-low.jpg`](screenshots/v2-phase10/I-phone-320-low.jpg)). Software WebGL only. | an art pass on the phone tiers, judged on a real device |
| Cause and effect | 4 | "You said" beside "The game will do", when it could act tonight, the support it needs, what else it does, who pushes back, a price that is the charge, flavour named as flavour | a "never" promise named as one; a playtest |
| Social emergence | 3 | Personalities change what villagers do (24 Living Village runs, the game's own policy: 80 skeptical villager-runs made 14 moves, mostly staging proof; 104 trusting ones made 224, spreading, comforting and asking); factions, lies discovered, trust lost to harm | model-backed decisions, measured live |
| Player agency | 4 | Several policies win in every chapter; the universal ward is now the dearest road, not the cheapest | |
| Rule variety | 3 | 17 operators, composable, priced; but the offline reader understands half of first attempts | live reader, measured; playtest phrasings |
| Replayability | 3 | Three chapters, generated villages, four modes, separate records; win rates differ by chapter and policy | human evidence |
| Speed and cost | 4 offline | Reading p50 2.5 ms, p95 7.2 ms (this machine); a whole V2 run with stored decisions replays with no provider; live cost is a list-price estimate (eval: ≈ $0.00015 a fast reading) | measured live latency and spend |
| Security | 4 | Model output is a proposal checked by the server and rebuilt by the engine; the fidelity gap closed; chaos suite, quotas, secret scan, no credential in the browser | a live red-team run; a deployment review |
| Mobile UX | 3 | 320-430 px fit with 44 px controls, WebKit iPhone profiles in CI | a real iPhone, a real keyboard, the 3D phone tier |

## What each reviewer found

- **Skeptical strategy gamer.** The cheapest universal answer was a ward around every home with no upkeep (P1-1); the price shown was not
  the price paid (P0-2). Both fixed; the cost of honesty is a harder Ashwood (best bot policy 15/30).
- **First-time player.** The ideas refused themselves in two chapters (P1-2); half of what they type is not understood offline (P1-4); an
  impossible wish was answered with a harmful one (P1-3).
- **Technical artist.** The desktop diorama holds together; the phone's low tier does not (P2-3). Not fixed: it needs a person and a device.
  The 3D world hid every danger the 2D map shows (P1-7): wolves, fire, smoke and ash are now drawn, from the engine's own state.
- **Prompt-injection attacker.** Nothing new to inject into (instructions in the sentence are named and dropped; 0 of 22 injections obeyed
  in the eval), but a model could rewrite what a sentence does while keeping its words (P0-1). Closed.
- **Backend SRE.** No change to quotas, sessions or failure paths this phase; a dropped or stopped online reading still costs nothing.
- **Model-evaluation scientist.** The reader's in-sample scores hide how it does on new phrasings: two blind sets were written by independent
  agents, one tuned on and one held out; the held-out set moved one sentence (34 → 35 of 69).
- **iPhone tester.** Layout and touch targets hold at 320 px in emulation; one 3D phone test was flaky (P2-4, fixed). No device.
- **Cost analyst.** Spend so far: 0. Every cost figure is a list-price estimate; the caps are documented in [`COST_AND_QUOTAS.md`](COST_AND_QUOTAS.md).

## Known limitations and the next responsible action

1. **LIVE**: the owner configures a credential (never in a chat or the repository: [`RELEASE.md`](RELEASE.md) section 4), runs
   `npm run ai:smoke` and the live checklist in [`FINAL_ACCEPTANCE.md`](FINAL_ACCEPTANCE.md), then this script's probes with a real model in
   place of the stand-in (and compares no-key with live).
2. **People**: an uncoached playtest, phone first, by [`PLAYTEST_PROTOCOL.md`](PLAYTEST_PROTOCOL.md), with first sentences recorded (with
   consent) to measure question 1 directly.
3. **The phone's 3D tier**: an art pass judged on a real iPhone.
4. **Open P2s**: a doubter's spread (a minds-text version), "never" promises, skeptics who rarely act.
5. **Deployment**: only with the owner's authorisation.

## Commands and results (this phase)

- `npm run lint`, `npm run typecheck`: clean. `npm test`: 60 files, 684 passed.
- `npx playwright test` V2 specs on desktop and phone (`v2-bridge`, `v2-ux`, `v2-journeys`, `v2-reality`, `v2-modes`, `v2-online`, `v2-minds`):
  52 passed, 20 skipped by design; `v2-review.spec.ts` (new) 6 passed; `v2-world3d.spec.ts` and `v2-bridge.spec.ts` on desktop-3d 4 passed.
- `npm run build`, `npm run size`: entry 296 KB gzip of 300.
- `npx tsx scripts/tournament-v2.ts --seeds 30 --scenarios <chapter> --name rules3-<chapter> --publish`: 810 runs, 0 model calls.
- `npm run eval`: corpora unchanged; latency above; win diversity from the rules-3 tournament.
- `npx tsx scripts/fun-review-v2.ts` (and `--root <checkout of 5132f26>`): the before/after numbers in this document.
- After the review (P1-7): `npm test` 61 files, 690 passed (`render3d-hazards.test.ts` new); the 3D dangers test in `v2-world3d.spec.ts`
  passed on desktop-3d and phone-3d; the desktop-3d project 24 passed, 2 skipped by design.
