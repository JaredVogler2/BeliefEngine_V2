# Expeditions, the Daily Village and run modifiers

Phase 08. Everything here is deterministic and offline: no server, no LLM, no network.

## Modes

| Mode | What it is | Seed | Difficulty |
| --- | --- | --- | --- |
| Story chapters | The hand-made scenarios (Redbank, Harvest, Ashwood). | any | player's choice |
| Expedition | A procedurally generated village. | any whole number 0 – 2 147 483 647 | player's choice |
| Daily village | One village per **UTC calendar day**, drawn from the verified catalog. | derived from the date | fixed: normal |

The daily date is the UTC date of the device clock **at the moment the run begins**. It is stored in the run (`flags.dailyDate`,
`YYYYMMDD`) so it cannot change mid-run, and a share link carries both the date and the seed so an old link keeps its village.
There is no global leaderboard and the game never pretends to have one: results stay in this browser.

## Village ids

`x<generator version>.<seed>[.<modifier>+<modifier>]`, for example `x1.4242`. Without a suffix the generator draws the
modifiers from the seed; `.-` means "none". The id is the scenario id of the run, so a save, a replay log and a share link all
rebuild the same village. Unknown versions, malformed ids and out-of-range seeds are rejected (`parseExpeditionId`).

## Generator pipeline (`src/engine/gen/`)

1. **Biome** from a shuffle bag: every aligned run of six seeds contains river, drought and wolves twice each, in a
   seed-dependent order (`biomeForSeed`).
2. **Map** (`river.ts`, `drought.ts`, `wolves.ts`): river position, bridge, bank heights, fields, beacons, hamlets, pens, fires, roads, wild
   regions. Landmarks are placed through a collision-aware placer; roads and the bridge row stay open.
3. **Cast and graph** (`kit.ts`): 12-18 villagers from role slots, households as cliques, each cluster a connected random graph,
   clusters joined only through named connectors; with probability ~0.5-0.6 a single person carries nearly every cross-cluster tie
   (a deliberate bottleneck).
4. **Crisis**: surge, dry spell or pack schedule with lulls, an omen-friendly night and a visible warning chain; objectives scaled to
   the population; resources scaled so the fields (or the granary) can feed the village while they stand.
5. **Claim pool**: the biome's canonical laws, two starters, the rest unlocking on day 3-4, one rival claim wired to a rival faction.
6. **Modifiers**: 1-3 drawn from the ones that apply to the village (below).
7. **Validation** (`expedition.ts`): scenario schema, population, connected social graph, every home/civic/field reachable by the Keeper,
   no overlapping landmarks, every playable claim available with at least two days left, flood/pen/field sanity, and a **do-nothing run
   must lose** (no free wins). A failed draw is replaced by a derived seed (up to 24 tries; the attempt is recorded).
8. **Blueprint**: seed, versions, biome, population, bottleneck, starters, rival and modifiers (`Blueprint`), used for the briefing
   and for the variety signature.

Nothing calls Math.random, the clock or the network; the engine lint rules forbid it.

## Verification: witnesses, not promises

`gen/witness.ts` has scripted planners that use only the public action API (the same one a person or an agent uses): per biome a
fire wall / watched bridge / bell ringer, moonlight / caravans / rain-bells, or smoke ring / decoy. `npm run gen:verify` plays every seed in a range with a do-nothing
baseline plus those planners and writes `docs/data/expeditions.json` and the verified catalog (`src/engine/gen/catalog.json`). A village is **verified**
when at least one planner wins it. Results are in `docs/BALANCE_REPORT.md` and `docs/data/EXPEDITION_REPORT.md`.

* The planners are heuristics. A village they cannot win may still be winnable; those seeds are never chosen for the daily or for
  "another village", and are labelled **Unverified seed** if typed in. Guaranteed solvability is not claimed.
* `tests/unit/catalog.test.ts` re-plays a sample of catalog entries with their recorded planner, so a change that makes the catalog
  stale fails the test suite. Re-run `npm run gen:verify` after any change to the generator or to simulation rules.

## Run modifiers

Each modifier changes numbers the player can see, opens or closes a decision, carries a price and is explained in the briefing
and in the Tonight tab. Static changes are applied to a private copy of the scenario when the run is created
(`applyModifiers`); dynamic ones are read by the engine through `modActive(state, id)`. All fourteen have a test in
`tests/unit/expedition.test.ts` that measures the change.

| Id | Effect | Price / opportunity |
| --- | --- | --- |
| `cross_bank_mistrust` | Ties that cross a district line are ~45% weaker and slower; bridge -10 integrity. | Stories stop crossing on their own; the few connectors become the plan. |
| `soot_season` | Fire laws one step stronger, +1 radius, spark risk added; fires start more easily. | A strong wall of beacons is also a gamble with the harvest. |
| `busy_harvest` | Gatherings ~45% weaker; night labour exhausts people 35% faster. | One-to-one talk, messengers and proof matter more. |
| `travelling_circus` | A showman gains four new ties and carries the rival's rumour. | A free broadcaster pointed the wrong way: win them over or answer the rumour. |
| `silent_bells` | The bells cannot ring before day 4. | The first plan must lean on something else. |
| `overcrowded_refuge` | Shelters hold about half. | Evacuation cannot save everyone; defend homes and the bridge. |
| `low_fuel` | Fuel store halved. | Beacon walls and smoke rings are costly; bridge and rain routes look better. |
| `doubting_scholars` | Demonstrations +35%, telling/gossip -20%. | Proof is king; mass-telling is weak. |
| `stubborn_elders` | Elders, hermits and reeves are slow to move; laws fade at 55% speed. | Slow adoption, durable laws. |
| `divided_council` | The Council bans gatherings on some mornings (announced the day before). | Hold speeches for the days between. |
| `clear_night_skies` | No rain; every night is clear; moonlight law grows crops 50% faster. | Rain stories cannot be proved; bells are useless. |
| `river_of_reeds` | River laws one step stronger and wider, but the forecast can be off by one. | Easier diversion, untrustworthy forecast. |
| `early_frost` | Crops grow more slowly; soil dries more slowly. | A later harvest where every growth boost counts. |
| `restless_wolves` | Packs travel four tiles a night. | Fires must be lit before a pack is near. |

## Share links

`?mode=story|expedition|daily&seed=N&rules=<rules version>&gen=<generator version>` plus `scn=<scenario>` for chapters and `date=YYYY-MM-DD` for
dailies; `diff=` is optional. **A link contains no state and no code.** Every field is validated (`parseShare`); unknown parameters are
ignored; a malformed link is refused with a readable reason and the game still opens; an older rules version opens with a visible note; a generator version
this build does not have is refused. The address bar is cleaned after the link is read.

## Replays

The same seed and the same action sequence give the same state and event hashes (`replayRun`); a changed seed changes the world;
different plans on the same seed end in different social **and** physical states. All three are unit-tested.
