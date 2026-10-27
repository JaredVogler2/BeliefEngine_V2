# Game rules (authoritative, matches the code)

Source of truth is the code in `src/engine`; this document is kept in step with it and every number below is a constant you
can find there. Last verified against commit history in `docs/PROGRESS.md`.

## The fantasy
You are the **Keeper of Stories**. You cannot move rivers or spawn food. You can only change what people believe. When enough
of a place believes a story, it becomes a **law** and the world obeys, within hard limits, and always at a cost.

## Day structure
`Planning -> Resolution -> Dawn`. During planning you spend **Influence (AP)**; every action is applied immediately, is
fully deterministic (so previews are exact) and can be **undone** until you end the day. Randomness exists only in the
overnight resolution and is keyed by `(seed, domain, day, ids)` (see DECISIONS D3).

| | Value |
|---|---|
| Influence per day | 3 (Story difficulty: 4) |
| Influence cap (carry-over) | 5 |
| Free scout | first Scout of each day is free, later ones cost 1 |

### Resolution order (`src/engine/core/resolve.ts`)
1. Announced rival moves land (`ai/rivals.ts`); announced faction moves land unless the Keeper answered them (`ai/factions.ts`)
2. Villagers react: evacuations (`ai/routines.ts`)
3. Social step: contacts, exposure, propagation, decay, contradictions, attention cap (`social/propagation.ts`)
4. Law step: pressure, hysteresis, contradictions, activation (`laws/resolver.ts`)
5. Dusk: believers weigh the bridge watch against their household and take their posts or stay home (`ai/utility.ts`); daytime harvest; woodcutters who worked bring fuel; people go home
6. Night: effect modifiers computed from active laws (`laws/effects.ts`) then hazards: rain shift, flood fill, bridge strain, fire, home / field / people damage (`world/hazards.ts`)
7. Rivals decide and announce tomorrow's move; factions endorse what deserves it or announce a move (`ai/factions.ts`)
8. Dawn needs: eating, fear, recovery
9. Win/loss evaluation, story beats, summary; next day: Influence refill, new claims unlock, positions reset

## Actions
| Action | Cost | Effect | Preconditions / limits |
|---|---|---|---|
| Choose story (day 1) | free | picks the opening claim | one of the scenario's starters; other starters unlock day 3 |
| Scout villager | free once/day, then 1 | reveals exact convictions for 2 days | |
| Tell (Seed) | 1 | target hears the claim: gain = 28 x trust-in-Keeper x susceptibility x skepticism discount x novelty x fear, headroom-limited | one conversation per villager per day; target must be reachable from the Keeper's anchor on foot |
| Messenger | 1 | a believer (conviction >= 35) carries the claim to a neighbour (direct tie or two-hop at 80% trust product); gain = gossip x 2.0 | messenger busy for the day; both must reach each other |
| Ritual (light beacon / ring bells / bridge vigil) | 1 (+1 to stage as proof) | physical effect for tonight; as *proof* it shows witnesses (within the ritual's radius, able to reach it) something | omen decides whether proof persuades or backfires; repeating a stunt in the same place weakens it (x0.6, x0.3) |
| Gather | 2 | up to 6 people near a gathering place hear the claim at 0.7x seed strength, crowd bonus, opposition penalty, fatigue 0.6x if you gathered in the last 2 days | Council may ban gatherings |
| Challenge (Counter) | 1 | cuts a rival rumour's hold on one person by `14 x (0.5 + 0.6 trust + evidence/200) x (1 - 0.5 stubborn)`; without proof you also lose 3 conviction | the person holds the rival rumour (>= 10) |
| End Day | - | resolve | always allowed: a softlock is impossible |

**Staged evidence strength** = ritual base x omen factor x fatigue. Omen factor: good **1.35**, weak **0.45**, bad **-0.9**
(a backfire: witnesses lose conviction and 6 trust in the Keeper). Omens come from the visible forecast: river ebbing
(beacon), calm night (bridge vigil), rain forecast (bells).

## Belief (social) model
Conviction is -100..100 per villager per claim. Constants in `social/persuasion.ts`:
* Gossip delta = `28 x signal x trust x persuasion x skeptic-discount x novelty x susceptibility x relevance x fear`
  * signal = clamp(speaker conviction / 50, -1, 1); only speakers with |conviction| >= 12 speak
  * trust < 0 is a **reverse signal at 40% strength** ("they distrust the speaker, so it backfired")
  * skeptics discount hearsay by up to 65%, eyewitness accounts by up to 25%
  * novelty = 1/(1 + 0.12 x times heard), x0.6 if the same source spoke yesterday
  * same-sign headroom = 1 - |conviction|/110; opposing-sign is resisted by stubbornness and by firsthand evidence
* Contacts happen over edges with probability `rate x availability`, only if both can walk to each other that day (flood and bridge matter). Cross-river x0.85, same place x1.3.
* Per-claim net daily change capped at +-34 (saturation). Finite attention: total positive conviction <= 190.
* Decay: 5% per un-reinforced day, slower for stubborn people and for those with firsthand evidence.
* Competing claims crowd each other out (40% of a gain is subtracted from a contradicting claim).

## Laws
Support pressure for (claim, region) = weighted mean over the electorate of `max(0,c)/100 - 0.5 x max(0,-c)/100`, weight = 0.5 + influence/100.

| Rule | on | off | min firm believers | ramp | decay |
|---|---|---|---|---|---|
| River fears fire (+rival River courts fire) | 0.60 / 0.55 | 0.45 / 0.40 | 3 | 80 / 55 | 22 / 25 |
| Bridge stands watched | 0.55 | 0.40 | 4 | 80 | 20 |
| Rain heeds bells | 0.60 | 0.45 | 3 | 80 | 22 |

* A law needs pressure >= on AND enough firm believers (conviction >= 50) AND no single voice carrying more than 45% of support.
* progress += ramp x (0.7 + min(1, 3 x (pressure - on))) per night while above; -= decay per night below the *off* line; holds between (hysteresis). Progress 100 = **active**.
* Effect strength = 0.6..1.0 growing with pressure above the line; a wavering law is scaled by its progress.
* Two contradicting laws cannot both be live in a region: the one with more progress suppresses the other.

### Laws shipped in Redbank
* **River fears fire** (Eastbank): each *lit beacon* raises effective ground by 3 within 1.6 tiles and 2 out to 3 tiles (law-strength scaled). Water is redirected, not deleted (flood fill respects the raised ground). Side effect: spark chance per neighbouring flammable tile doubles (10% base).
* **Bridge stands watched**: with >= 3 watchers on the deck, bridge damage is cut by up to 90%. Watchers are believers who stand watch at dusk instead of working fields.
* **Rain heeds bells**: when the bells are rung, the river level drops by up to 2 steps; the same water pools (+N depth) on the lowest ground of Westbank.
* **River courts fire** (rival, Osric): if believed in Eastbank, lit beacons *draw* water in.
* **Crowds break bridges** (rival, Old Harl and the Hearth Families, added in phase 11): "A crowded bridge is a broken bridge." Once the Keeper's bridge law reaches 12% support Harl announces a rebuttal aimed at the Keeper's most influential believer (a day's warning), it lands unless challenged or unless Harl himself has come to believe the bridge law (conviction >= 50), and it erodes belief in the bridge law in the target and two neighbours. If it ever became law (both banks), watchers on the deck would *add* strain instead of cutting it (`bridge.weaken`: -30% shield). Budget 3 moves, cooldown 2 days. Only the Keeper's own bridge stories send believers to the deck; a rival bridge rumour never does.

## World (Redbank)
Map 28x18, river at x=12..14, west bank high (elevation 4..10), east plain low (2..4) with a 5-tile knoll refuge (shelter capacity 3).
* **River level** per night (visible in forecast): 1,2,1,3,2,4,6. Flood fill: a tile floods if level > elevation + shield and is connected to the river through flooded tiles.
* **Homes**: depth 1 = -20 hp, 2 = -45, >= 3 = destroyed. **People** at depth >= 2 drown; depth 1 injures. A home on a burning tile takes 40.
* **Bridge** (hp 70): takes `(level-1) x 11` per night; watched with the law, damage x(1-shield). It collapses around night 6 if unwatched.
* **Fire**: lit beacon ignites each flammable neighbouring tile with 10% x (law bonus) x wind; burning spreads at 30%; a fire burns 3 nights. Floodwater extinguishes. Fields on fire are ruined.
* **Fuel** 10 at start; lighting costs 2 fuel and burns 3 nights.
* **Evacuation**: people whose home would be 2+ deep tonight (or is burning) walk to a shelter with room if a path exists (bridge!). Stubborn elders (>= 85) refuse unless depth >= 3, they are burning, or they trust you >= 45.
* **Food**: start 20, worked standing fields give +1 each, consumption `ceil(alive/4)` per day; fields flooded over 40% or burned are ruined.

## Victory / defeat (Redbank)
* **Win** at the end of day 7: >= 12 of 14 alive, >= 6 homes standing, >= 4 food.
* **Instant defeat**: fewer than 9 alive.
* **Heroic**: 13+ alive and the bridge standing.
* Score (see `core/score.ts`): survivors 500 x alive/total (dominant), households 100 x homes standing/total, essentials up to 100 (food, plus livestock or fed villagers where the scenario has them), infrastructure up to 50 (bridge, fields), harmony 0.7 x mean trust, efficiency up to 60 (**victory only**, shrinks by 3 per Influence beyond 2 a day), laws 40 per distinct law (max 2), heroic 100. Then multiplied by difficulty (Story 0.8 / Normal 1.0 / Hard 1.25), pledges kept, a draft (+15%) and chosen twists (+10% each, max +30%). No bonus for unspent Influence, nothing rewards inaction, and a defeat earns no efficiency, heroic or medal.

## Difficulty
* Story: +1 Influence per day and at the start, +6 trust.
* Hard: -4 trust, -2 fuel, rival has +1 budget.

## Other scenarios and systems (phases 07-10)
* **The Harvest That Refused to Grow** (9 days): crops with growth and soil moisture, hunger and labour, a grain trader who sells only to someone she firmly believes (trade deal, one caravan at a time, blocked while the Hillside Road is buried), moonlight and bell laws with real costs (night labour; mud).
* **The Wolves of Ashwood** (8 days): packs that walk three tiles a night toward the nearest pen or a believed decoy fire; smoke fires protect, sicken and thicken fog; woodcutters who work bring fuel at dusk; a hunter's theory (wolves follow smoke) the Keeper may adopt.
* **Run modifiers, pledges, drafts, expeditions, daily village, share links**: see `docs/EXPEDITIONS.md`.
* **Villager intents** (`ai/utility.ts`): each evening a believer with a post scores *work, rest, stay with family, seek safety, keep watch* from visible needs (danger at home, children in the household, fear, fatigue, belief in the law) plus a seeded bounded tie-break; the best intent wins. A parent whose child would face the water stays home instead of standing watch, the event `WATCHER_DEFECTS` says who and why, and the law's protection needs its minimum watchers on the deck. The villager card shows the top three intents with their scores.
* **Law credibility and memory**: a law that was powered tonight and still lets water into homes (or a bridge that takes >= 12 damage under fewer than the needed watchers) is seen to fail: believers who could see it lose up to 6-12 conviction (less if stubborn or firsthand-convinced) and remember (`LAW_DISCREDITED`). Each villager keeps at most six memories; they scale persuasion about that claim by 0.55-1.15. Laws seen working add a little firsthand evidence (capped).
* **Factions**: the Council bars public gatherings (`FACTION_BAN`, announced a day earlier by `FACTION_TELEGRAPH`) when the Keeper has called two or more crowds in three days while the Council's leader has not been persuaded (conviction under 40) and trusts the Keeper under 55; budget two moves, cooldown three days; winning the leader over stands it down. A faction whose leader firmly believes a law (>= 65) and trusts the Keeper (>= 40) endorses it once to members the leader can walk to (+6 conviction each). The rival faction's campaign, rebuttal and sabotage moves (phase 05/07) are forecast a day ahead and can be challenged.
* **What is going on** (callouts): short authored lines derived from the same state (rival and faction plans, a bank that doubts, someone who trusts you but not your witness, opposite laws in two places, last night's success or failure).

## Verified strategy lines (see `tests/fixtures/redbank-traces.json`, `tests/fixtures/tournament-traces.json`)
Seed 1: **Fire Wall** (belief in Eastbank, beacons lit by coverage on day 5) wins with 13 alive, 11 homes; **Witness Bridge**
(belief across both banks, watchers hold the bridge, people walk out over it; it now also answers Harl's announced rebuttal) wins with 14 alive, 6 homes and exactly 4 food; **no action**
loses. Both wins were also replayed through the real browser UI and produce identical state hashes. The tournament
(`npm run test:sim`, `docs/BALANCE_REPORT.md`) adds saved winning and losing traces per generic policy, replayed by `tests/unit/tournament.test.ts`.

## Known exploit probes (tests in `tests/unit`)
Undo cannot mint Influence; failed or illegal actions never change state; repeated seeding saturates; gossip does not cross a
cut; a law cannot be created by one loud believer; competing laws cannot both be live. `tests/unit/exploits.test.ts` (phase 11)
attacks the same rules on every kind of village: Influence through undo, save/load, retry and junk targets; resources never negative
or overflowing and nobody orphaned or off the map; belief farming saturates; proof reaches only people within sight; cooldowns apply;
contradicting laws are never live together and no law changes status twice in a night; doing nothing never earns a win or medal;
a finished game cannot be advanced, acted on or undone.

## Inventor mode: writing a belief (optional, unranked)
In a run started with Inventor mode the Keeper may write up to two beliefs of their own. `Compose` (the `COMPOSE` action) costs 1-3 Influence by the belief's power (below 10, below 30, 30 and above), adds a story to the hand that costs 1 per telling like any other, and changes nothing else: the belief does nothing until villagers believe it (local support of at least 60% and at least 3 firm believers, more for stronger beliefs, never more than three quarters of the people who vote on it), and then only on nights its power source is present. A written belief is never easier than the built-in law of the same kind; a belief about the whole of something (the rain, a field, a bridge, a region's sickness) is never stronger than the strongest built-in belief of its kind; and a written copy of an answer the chapter holds back (Redbank's bell-and-rain belief, which unlocks on day 4) can only be told from the day that answer unlocks, while a copy of an opening story can be told at once. The run earns no personal best, Atlas entry or unlock (one badge: *Author of a law*) and is never offered in the daily village. How a sentence becomes a rule, the vocabulary, the formula and the evidence: [`NL_BELIEFS.md`](NL_BELIEFS.md).
