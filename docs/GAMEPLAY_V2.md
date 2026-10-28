# Generative Reality as a strategy game (phase 11)

Phase 11 asks that writing beliefs stays an exciting strategy game, not a wish machine: real costs, real risks, emergent events, and
balance measured by headless policies rather than asserted. This is what was built, what was measured, and what is not verified.

Code: `src/engine/reality/{balance,twin,demonstrate,harm}.ts`, `src/engine/reality/read.ts` (every-hamlet beliefs),
`src/engine/mind/claims.ts` (a leader stands against harm), `src/engine/progress/progress.ts` (records per mode),
`src/engine/ai/bots/reality.ts` (policies), `scripts/tournament-v2.ts`. Tests: `tests/unit/gameplay-v2.test.ts`,
`tests/unit/belief-bridge.test.ts`, `tests/e2e/v2-modes.spec.ts`. Data: [`data/tournament-v2/`](data/tournament-v2/).

## 1. Modes

| Mode | What it is | Records |
|---|---|---|
| **Classic** (story, expedition, daily) | V1 exactly: authored stories, no model, no network; golden hashes pinned | its own, as V1 kept them |
| **Generative Chronicle** (`reality: true`, the reality tab's *Begin*) | write beliefs in the reality language; hens and loose stones; villager minds | its own (`variant: 'chronicle'`); unlocks nothing and earns no Classic badge; beliefs that became law go to the atlas as entries to read, with no power for any later run |
| **Living Village** (`living: true`) | the chapter's own stories with villager minds at full voice: six villagers think each day instead of four, conversations, skeptics' tests, competing claims; no writing, no hens or stones | its own (`variant: 'living'`) |
| **Reality Lab** (`realityLab: true`) | stronger beliefs (three clauses, power to 120), never ranked; computation and safety limits are not relaxed | recorded, nothing else (`variant: 'lab'`, no personal best) |

Each V2 run says which it is in the debrief (`seed-info`), the hand shows a Living Village's mode, and `optionsFromState` recreates
the same mode for a retry. Before phase 11 a Generative Reality run was recorded exactly like a Classic one (same bests, unlocks and
chapter completion); that is fixed, and an import keeps the mode (and an Inventor run's `custom` mark, which the importer used to drop).

## 2. What a written belief costs (rules 2)

A run records the written-belief rules it was created under (`s.v2.rules`, `REALITY_RULES = 2`); a run made before phase 11 has no
field and plays under rules 1 exactly as it did (the phase 09 chains recorded under rules 1 still replay to their hashes:
`tests/fixtures/v2-bridge-traces-rules1.json`). Under rules 2 a new belief carries every cost the prompt lists, from its mechanics
alone:

| Cost | How |
|---|---|
| Influence to write | 1, 2 or 3 by power (unchanged) |
| Social proof | support `0.5 + p/200` (55-85%) and `3 + p/15` firm believers (3-7), `p` = power per region it is held in |
| Independent witnesses | V1's diversity rule (a law with three or more supporters cannot wake while one voice carries more than 45% of the support), and demonstrations (below) give firsthand witnesses |
| Physical catalyst | the trigger of its clauses (the bell, a lit lantern, a smoke fire, watchers on the deck); supplied each night it is to act |
| Duration and upkeep | the catalyst every night (Influence; fuel for lanterns and smoke fires) |
| Observable downside | its operators' real side effects, previewed before writing; and harm to livelihoods costs trust (§4) |
| Conflict | laws pulling the same property opposite ways are combined by support (`REALITY_CONFLICT`) |
| Pacing | it waits for the day the chapter's own answer of that kind unlocks, including an opening story the player did not pick |
| **Never the cheaper road** | a belief that does what one of the chapter's (non-rival) laws does (same kind of target, operator and direction) asks at least that law's support, believers and watchers, and ramps no faster (`twin.ts`) |

Breadth is priced honestly: "in every hamlet" holds a belief in each region that has what it acts on (one law per region, each
decided by its own people); its whole power sets the Influence price, each region's share sets that region's threshold, and a radius
is paid once per region. Under rules 1 the reader ignored the words and held it in one region.

## 3. Demonstrations

V1's stories are proved by performing the rite on a night the world will seem to answer it. Under rules 2 a written belief that
waits for a catalyst the Keeper can make is staged the same way, at that catalyst (`RITUAL` with the claim, +1 Influence), and a
written copy of an authored story can always be proved the way that story is. What makes the night kind is read from what the belief
does, never from its words (`demonstrate.ts`):

| The belief | Kind night |
|---|---|
| turns or holds off water, keeps rain away | the river ebbing |
| draws rain onto a place | rain coming |
| strengthens the bridge | a calm night |
| keeps wolves off, hides pens, slows or lures wolves | a quiet pack |
| grows crops | a clear night |
| cools, slows or fireproofs | no wind |
| anything nothing tonight can mimic (hens, stones, feelings, hatching, light) | none: it fails in front of its witnesses (V1's price: conviction and trust lost), unless the belief is already waking, when it really acts where people can see it |

A compound is shown by the part a night can mimic ("chickens fly and the river turns away" is shown by the river). The omen is
offered before the Influence is spent (the landmark card marks it; the preview warns on a bad one).

## 4. Strategic events

| The prompt's event | In the game |
|---|---|
| a skeptic asks for a reproducible test, then converts after seeing it | phase 08's `request_test`; under rules 2 a written belief can be shown at its catalyst, and the tournament's runs meet such tests (0.6-0.8 per run where it pushes demonstrations) |
| a town leader opposes a powerful law because it damages public livelihood | `LEADER_OPPOSES`: when a written belief harms a livelihood (rain it moved pools on low ground, fire-kept flood wards sink, a stone it made light rams the bridge, crops wither), the council's leader (for the whole village) or a scholars' leader (for their own people) who does not firmly hold it stands against it and puts the opposite to the village the next day, unless talked round (test: the Reeve of Redbank against the bell-rain belief that flooded Eastbank's low ground) |
| winning quickly with hazardous magic or keeping the village's trust | `LAW_HARMED`: the people a written belief harmed trust the Keeper less (−3) and hold the belief less (−5), and remember it (a `law_harmed` memory makes them warier of it); failed demonstrations cost trust as in V1 |
| a two-clause belief with an unintended side effect prompts opposition | the bell-rain-and-cooler-flames belief: the rain it calls pools on Eastbank and the cooler flames sink the fire-kept wards; both are harms, and the leader stands against it |
| an NPC invents a limited competing claim through the same validator | phase 08 (`mind/claims.ts`): built, grounded and priced by `buildRealityClaim`, one per faction per run, announced a day ahead |
| social geography isolates a population, needing a bridge or a messenger | V1's own: a fallen bridge cuts the banks apart and stories cross only by messenger along trust ties; Ashwood's hamlets are far apart and a belief held in every hamlet is decided in each of them separately |
| conflicting laws make the player choose a coalition | V1's contradictions (one of a pair live per region) and V2's support-weighted conflicts; a leader's counter-claim splits the believers. No new negotiation interface was built |

Dialogue stays short and comes from logged events; a law still wakes only through persuasion and the threshold.

## 5. The balance tournament

`npx tsx scripts/tournament-v2.ts --seeds 30` (and `--rules 1` for the old rules): every policy plays the same seeds through the same
`GameSession` actions a person uses; the network is switched off (`fetch` throws), so the model-call count and cost are 0 by
construction. The seven policies of the prompt, and two probes:

| Policy | What it does |
|---|---|
| noop | control: first opening story, ends every day |
| spam-broad | writes the widest belief the reader accepts and tells it to everyone; no catalyst, no proof |
| evidence-first | writes a ward against the chapter's danger, stages it on kind nights, tells skeptics |
| bridge-persuasion | writes a different mechanism and carries it across districts through the people tied into several |
| inventive-compound | writes a two-clause belief and pushes it greedily with every catalyst it needs |
| careful-synergy | the threat-aware authored plan, plus one light written belief fed only from Influence above a bank of three |
| rival-antagonist | the ward pushed greedily while an adversarial proposer drives every thinking villager against it through `NPC_DECIDE` (validated like a model's decisions) |
| *ward-greedy* (probe) | the antagonist's control: the same ward, the same way, no adversary |
| *backfire-probe* (probe) | the chapter's double-edged belief, pushed greedily |

Wins out of 30 (seeds 1-30, normal), rules 1 → rules 2:

| Policy | Redbank (flood) | Harvest Moonlight (harvest) | Ashwood (wolves) |
|---|---|---|---|
| noop | 0 → 0 | 0 → 0 | 0 → 0 |
| spam-broad | 0 → **20** ("Floodwater always flows away from every home.") | 0 → 0 | 0 → 0 |
| evidence-first | 0 → **27** ("The river turns away from lit lanterns.") | 0 → **13** | 0 → **18** |
| bridge-persuasion | 0 → 0 (the bridge belief, now priced as the chapter's own) | 0 → 0 | 0 → 0 |
| inventive-compound | 0 → 0 | 0 → 3 | 0 → **9** |
| careful-synergy | 26 → 26 | 13 → 13 | 6 → 6 |
| rival-antagonist | 0 → **23** | 0 → **25** | 0 → **21** |
| *ward-greedy* | 0 → **24** | 0 → **28** ("Crops ripen faster under the night sky.") | 0 → **21** ("Wolves will not come near the smoke fires in every hamlet.") |
| *backfire-probe* | 0 → 0 | 0 → 0 | 0 → **7** ("Wolves are drawn to the smoke fires in every hamlet.") |

Other measures (full tables in [`data/tournament-v2/`](data/tournament-v2/)): under rules 2 the winning policies' written laws wake on
day 4.5-7.7 of 7-9 (under rules 1 most never did); Influence spent 15-26 per run; firm reach of the written belief from 21% (Ashwood's
words-only belief) to 95%; demonstrations
staged 2-5 per run, none on a bad night; policies winning at least a third of seeds per chapter (strategy diversity): Redbank 5,
Harvest 4, Ashwood 3 (entropy of winners 2.3, 2.1, 2.4 bits); dead time (days with no Influence spent) 0-1 except Harvest's growth
belief, about 3.5 of 9 days idle once its law holds; 0.5-2 s per run on this machine with three tournaments in parallel.

**The adversary** costs the ward 1 win in 30 in Redbank, 3 in Harvest and none in Ashwood: a hostile proposer standing where a model
would can only pick among the legal moves the engine offers each thinking villager.

## 6. The dominant cheap win, found and fixed

Under the first rules-2 pricing, "The bridge grows stronger when people watch it" won Redbank **20 of 20** for 1 Influence: written on
day 1 it was a copy of the opening story the player had *not* picked, at 3 believers instead of 4, a faster ramp, and one watcher
instead of three. The chapter's own story pushed the same way won 1 of 20 when it arrived on day 3 (15 of 20 when picked as the
opening). Now a copy asks at least what the story it copies asks and waits for that story's day: **0 of 30** (regression test in
`gameplay-v2.test.ts`). No other policy depended on it.

## 7. Gate

- **At least two very different creative laws provide viable strategies: MET (measured).** A hydrological ward ("The river turns away
  from lit lanterns", 27/30 in Redbank), a growth belief ("Crops ripen faster under the night sky", 28/30 in Harvest) and a
  three-hamlet ward against wolves (21/30 in Ashwood), each written, persuaded, catalysed and staged through the ordinary actions.
  Honest limit: in each chapter the strongest written law does what one of the chapter's own stories does (and is priced at least as
  high); mechanisms with no authored counterpart (the decoy, hens, the stone bank) are weaker or situational.
- **A third can backfire: MET (measured).** "Wolves are drawn to the smoke fires in every hamlet" (a decoy) wins 7 of 30 Ashwood seeds
  and loses more animals and hens than doing nothing on 11 of 30: the packs come to the hamlets' fires, where the hens are. The
  bell-rain belief floods Eastbank's low ground and raises the Reeve against it (`LAW_HARMED`, `LEADER_OPPOSES`).
- **One meaningful win/lose arc within a reasonable session: MET.** A chapter is 7-9 days (V1's estimate for a session: 12-25
  minutes); the browser plays complete Generative Reality chains, wins and losses, through the interface
  (`tests/e2e/v2-bridge.spec.ts`, re-recorded under rules 2).
- **"The model adds strategic variety rather than only more text": LIVE UNVERIFIED.** No model was called; every reading here is the
  offline reader's. The variety measured above comes from the language and the engine; what a model adds is unmeasured until a
  provider is configured.

## 8. Progression and replayability

Unchanged from V1 and phase 05: daily and expedition seeds, generated villages with their own primitives and problems, one-click
retry of the same seed or a new one, and the counterfactual on a loss (`core/counterfactual.ts`: a different plan from an earlier day
on the same seed). New: the atlas keeps the beliefs a Chronicle made law (text, what they did, where) as keepsakes with no power. No
streaks, nothing to buy.

## 9. Not verified

Human fun (no playtest was run), anything a model would read or decide (LIVE UNVERIFIED), and balance beyond these three chapters
and 30 seeds (generated villages were not part of this tournament).
