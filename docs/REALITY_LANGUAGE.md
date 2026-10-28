# The reality language (AST v2, `reality-1`)

What a written belief can mean in a Generative Reality run, how it is checked, priced and executed, and what it cannot do. Code:
`src/engine/reality/`. Tests: `tests/unit/reality-language.test.ts`, `reality-execute.test.ts`, `reality-properties.test.ts`.
Status and evidence: [`PROGRESS.md`](PROGRESS.md).

## 1. What it is, and what it is not

- A **closed, typed, data-only language**. A sentence (read offline or by a model) becomes an AST v2 object; only that object is
  ever executed, and only by known engine code. No model output, sentence or save can add an operator, run code or name a field
  the validator does not know.
- **Finite affordances, honestly labelled.** 19 operators (17 executable) over 14 kinds of thing. Anything else is refused or
  listed as an omission with a reason. The language does not claim unlimited physics.
- **Generative Reality runs only.** A run created with `reality: true` (or `realityLab: true`) carries `s.v2`; Classic runs never
  do, and V1 claims never carry the `reality` field, so every V1 state and event hash is unchanged
  (`tests/unit/v2-migration.test.ts`).

## 2. The AST

```json
{
  "v": 2, "lang": "reality-1",
  "text": "Chickens fly when the bell rings.",
  "author": "player",
  "source": { "reader": "offline-v2", "model": null, "prompt": null, "id": null },
  "day": 1, "regions": ["east"],
  "clauses": [{
    "id": "c1",
    "when": { "event": "bell", "min": null },
    "where": null,
    "target": { "kind": "chicken", "near": null, "tags": [], "region": null },
    "effect": { "op": "APPLY_FORCE", "direction": "up", "magnitude": 2 },
    "duration": "night"
  }],
  "omitted": [],
  "narrative": null
}
```

| Part | Meaning and bounds |
|---|---|
| `text`, `author`, `source`, `day` | the literal words (≤240 chars), who wrote it (`player`, `npc`, `scenario`), which reader produced it (`offline-v2`, `model`, `legacy-v1`) with model and prompt version when a model did, and the day written |
| `regions` | 1-4 distinct region ids; a law forms in each, voted by the people who live there. The river commons (`river`) spans the village |
| `clauses` | 1-2 in balanced play, 1-3 in Reality Lab. Each is a trigger, an optional condition, a selector, one effect and a duration |
| `when` | an event (`bell`, `lantern`, `smoke_fire`, `watchers`, `night`, `always`, `rain`, `clear_night`, `flood`, `spoken`, `ritual`; `watchers`/`flood` take a `min`) or `all` / `any` / `not` of triggers, nested at most 2 deep |
| `where` | a condition (`wet`, `dry`, `raining`, `clear`, `windy`, `flooding`, `lit`, `blue`, `airborne`, `healthy`) or `all`/`any`/`not`; environment tests apply to the night, target tests to each target |
| `target` | a kind (§3), optionally `near` a landmark (`radius` 0-4; 0-6 in the Lab), `tags`, and a `region` narrower than the belief's |
| `effect` | one operator (§4) with its typed parameters, every number an integer in its declared range |
| `duration` | `night` (acts on nights its trigger fires) or `while_active` (once fired, keeps acting while the law holds; priced ×1.25) |
| `omitted` | up to 6 parts of the sentence the reading does not represent, each with a reason (`unrepresentable`, `unsupported`, `ambiguous`, `narrative`) and an explanation shown to the player |
| `narrative` | flavour text kept apart from mechanics; never executed, never priced |

`validateRealityAst` refuses unknown keys at every level, wrong types, non-finite numbers, out-of-range values, unknown names,
operators that do not execute, operators on targets they cannot act on, nesting past the limit, and clauses that contradict or
repeat each other. It never throws: 1,500 seeded random beliefs and as many corrupted copies go through it in
`reality-properties.test.ts`.

`mechanicsHash` fingerprints the mechanics alone (two wordings of one law share it); `beliefHash` adds the words and provenance.
The claim id is `reality_<mechanics hash>`.

## 3. The world vocabulary (`ontology.ts`)

Every kind is marked by what the simulation really does with it: **simulated** (it has state that changes outcomes, and is drawn),
**logical** (it has state and rules but no 3D representation of its own yet) or **unsupported** (refused).

| Kind | Support | Exists when | Notes |
|---|---|---|---|
| `water` | simulated | the chapter floods | river level and flood shield tiles |
| `rain` | simulated | always | the night's forecast rain |
| `bridge` | simulated | a bridge stands | durability against flood damage |
| `home` | simulated | homes or cabins | flood shield, fire damage, cover from wolves |
| `field` | simulated | fields | growth night by night only where the chapter grows crops |
| `fire` | simulated | the chapter has fire | heat (damage) and spread |
| `smoke` | logical | smoke exists | |
| `wolf` | simulated | the chapter has wolves | packs: block/lure stamps, steps per night |
| `villager` | simulated | always | status effects and motivations, never opinions |
| `chicken` | simulated | Generative Reality runs | **new**: coops, roosting, drowning, wolves, eggs (§7) |
| `stone` | simulated | Generative Reality runs | **new**: loose stones on the riverbank, mass and wetness (§7) |
| `lantern` | simulated | beacons | light reach and fuel |
| `bell` | logical | a bell tower | |
| `livestock` | logical | pens | cover from wolves |

Concepts the village does not contain are named, with the reason the player sees: time (nothing can be undone; "time runs
backward" never becomes faster crops), the dead, metal and money, shadows, sun/moon/stars, monsters, minds ("a belief cannot make
people believe or obey"), seas and mountains, tools, the game itself.

Properties carry units and ranges (`PROPERTIES`): altitude in tiles (0-3), mass in loads (1 a basket, 3 what one person carries,
5 immovable), wetness 0-2, durability as share of damage prevented (-0.5..0.9), flammability ×0.2..3, heat as share of fire
damage, growth in percent per night (-30..60), flood flow in tiles of ground (-3..3), river level steps, light reach in tiles,
visibility in tiles of cover, speed ×0.2..2, health, fear and labour in points, chicken count (≤24).

## 4. Operators (`operators.ts`)

| Operator | Family | Targets | Parameters | Runs | Order | Lasts | Downside (only what the engine plays; the preview lists it per clause, phase 09) |
|---|---|---|---|---|---|---|---|
| `CHANGE_LIGHT` | light | lantern | delta -2..2 | yes | 3 | temporary | brighter lanterns burn their fuel twice as fast |
| `WEATHER_MODIFIER` | weather | rain | mode attract/repel/redirect; magnitude 1-3; toward region? | yes | 5 | temporary | rain is moved, not made: where no crops drink it, it pools on the low ground of the region it is sent to |
| `RELOCATE_RESOURCE` | resource | water | water; magnitude 1-3; toward region | yes | 6 | temporary | the water taken from the river pools on the low ground where it is sent |
| `REDIRECT_FLOW` | hydrology | water | mode repel/attract/slow; magnitude 1-3; radius 0-4 | yes | 10 | temporary | drawing water in floods the ground near the source; turning it aside spares only the ground within reach |
| `MOVE_AWAY` / `MOVE_TOWARD` | movement | wolf, water, chicken | magnitude 1-3; radius 0-4 | yes | 11 | temporary | what is driven off waits at the edge of the warded ground / what is drawn in arrives where the source stands |
| `MODIFY_VISIBILITY` | light | home, livestock | delta -3..3 | yes | 12 | temporary | a hidden pen or home is spared, not the pack: it waits at the edge |
| `MODIFY_DURABILITY` | structure | bridge, home | delta -3..3 | yes | 15 | temporary | none beyond its price (a weaker structure is the harm itself) |
| `MODIFY_MOVEMENT` | movement | fire, wolf | delta -3..3 | yes | 18 | temporary | faster flames spread further, faster packs arrive sooner (water is slowed by `REDIRECT_FLOW` slow) |
| `SET_MATERIAL_PROPERTY` | materials | stone, home, bridge, field | mass/flammability/hardness; delta -3..3 | yes | 20 | temporary | a stone made light that stands in floodwater floats off and rams the bridge |
| `ALTER_TEMPERATURE` | thermal | fire | delta -3..3 | yes | 25 | temporary | hotter flames destroy more; cooler ones warm the hearths less (the weak lose health) and, clearly cooler, lower the flood wards fire keeps |
| `GROW_ENTITY` / `DECAY_ENTITY` | growth | field | magnitude 1-3 | yes | 30 | temporary | none beyond its price / withered crops mean less food |
| `APPLY_FORCE` | dynamics | chicken | direction up/away/toward; magnitude 1-3 | yes | 40 | temporary | a lift of 2+ drifts with a strong wind, across the river if it blows that way (strays lay no eggs; a lifted stray flies home on a still night); pushed hens can be driven into floodwater |
| `INFLUENCE_MOTIVATION` | behavior | villager | courage/calm/diligence; magnitude 1-2 | yes | 50 | temporary | calm people are harder to convince of anything, yours included |
| `GIVE_STATUS_EFFECT` | status | villager, home | fireproof/sick_resistant/warm; magnitude 1-3 | yes | 55 | temporary | none beyond its price and upkeep |
| `SPAWN_BOUNDED_ENTITY` | spawn | chicken | chicken; count 1-3 | yes | 60 | lasting | each chick costs one food; a coop holds at most twelve |
| `TRANSFORM_MATERIAL` | materials | stone, home, bridge, field, water | into word | **no**: it would create things from nothing | - | - | - |
| `MODIFY_STRUCTURE_CONNECTION` | structure | bridge | connect | **no**: not modelled yet | - | - | - |

`ALTER_GRAVITY_LOCAL` from the program list is expressed as `APPLY_FORCE` up on what the language can lift (chickens) and as
`SET_MATERIAL_PROPERTY` mass on stones (only stones have a weight a belief can change; flammability applies to homes and fields,
hardness to the bridge and homes, and the validator refuses any other pairing); `INFLUENCE_MOTIVATION` changes feelings (courage
and calm lower fear; diligence eases the exhaustion of night work under a moonlight law and makes the fields its believers work
give a little more: faster growth where crops grow night by night, elsewhere one more food at dawn from a field two of them work),
never a villager's conviction. Every operator also
declares its cost weight (balance), the property it changes and the key of the 3D effect that will draw it (phase 10).

## 5. Price, support and pacing (`balance.ts`, `build.ts`)

On V1's scale, so V2 beliefs and V1 laws are priced against each other (a lantern belief that turns floodwater within 3 tiles at
strength 3 costs 40 in both languages; tested):

```
clause power = reach × magnitude × trigger ease × operator weight / 8 × 0.8 per condition test (≥ 0.5) × 1.25 if while_active
reach        = radius r: π (r + 0.5)² × 0.35;   whole region: 4 per region
ease         = always 1.6, night 1.15, bell/lantern/smoke/watchers/clear night 1, rain/spoken/ritual 0.9, flood 0.8;
               all-of: hardest × 0.85;  any-of: easiest × 1.1 (≤ 1.6);  not: 1.4
belief power = Σ clauses × (1 + 0.1 per extra clause)
```

From power alone (never from wording), under the rules the run was created under (`s.v2.rules`, phase 11; absent = 1):

- **Rules 1** (phases 04-10, and every run made before phase 11): support share `max(60%, 0.5 + power/160)` rounded up to 5%
  (≤ 90%), firm believers `3 + power/8` (3-8), ramp `72 - power`, decay `18 + power/2`.
- **Rules 2** (phase 11, every run made now): with `p` the power per region the belief is held in, support `0.5 + p/200` rounded up
  to 5% (55-85%), believers `3 + p/15` (3-7), ramp `80 - p/2` (50-80), decay `18 + 0.4 p`; a radius is paid once per region; and
  never less than the chapter's own law that does the same thing (same kind of target, operator and direction) asks, including the
  watchers it needs ([`GAMEPLAY_V2.md`](GAMEPLAY_V2.md) §2).

Either way never more believers than the region's electorate can give, and Influence 1/2/3 below power 10/30/above. Balanced play
caps power at 60 by narrowing reach, then strength, each change reported; the Lab allows 120 and is unranked. A belief that answers
the same need as one of the chapter's own laws waits for the day that law unlocks (V1's pacing rule), so a rain belief cannot skip
Redbank's day-4 rain answer; under rules 2 that includes an opening story the player did not pick.

## 6. Grounding (`ground.ts`)

A valid belief can still talk about things the village lacks. Grounding refuses (with the reason) a bell where no tower stands,
wolves where none hunt, growth where fields are not grown night by night, water moved with no place to act from, unknown regions,
and, per region of the belief: lanterns or smoke fires that do not exist in that region (they power only their own region's laws,
as in V1) and a `near` landmark that is not in that region ("there is no bridge in Eastbank to measure from": the bridge stands
in the river commons). The bell and the bridge's watchers are heard and seen by the whole village. Things that make a belief weak
or rare (no rain in the forecast, no chickens left, no field workers in this region) are notes, shown but allowed. Diligence in a
village where nobody works the fields is refused: it would change nothing.

## 7. Execution (`execute.ts`, `entities.ts`)

Each night, after V1's `computeModifiers` and only in runs with `s.v2`:

1. The lasting bank raised by hauled stones is applied as flood shield on its tiles.
2. Every clause of every active reality law is ordered by operator tick order, then law id, then clause id (never by run order).
3. A light pre-pass sums `CHANGE_LIGHT` (±2): it changes the reach of everything lantern-powered tonight.
4. For each clause: the trigger is read from tonight's inputs (rituals done today, lit landmarks, bridge watchers, the night's
   scheduled weather, words said today), the condition is checked, the selector resolves to at most **40** targets in the law's
   region, and the effect becomes **contributions** (key, value, support weight = law pressure × strength). Nothing is written yet.
   A clause that finds nothing to act on emits `REALITY_IDLE` (naming whether it found no targets or nothing in them it could
   change), never an error. Positional effects (water, wolves, pushes) are measured from the landmark the clause names (`near`),
   preferring the ones powering it tonight (the lit lanterns), else from what powers it (the ringing bell tower), and the log says
   which ("floodwater is turned away from the bridge within 2 tiles").
5. Contributions are combined per key. Agreeing ones take the strongest or add up within the property's range. **Opposite ones
   resolve by support**: `(P·W⁺ − N·W⁻) / (W⁺ + W⁻)`, so the result is the same whatever order the laws were written in
   (`REALITY_CONFLICT` names both laws and the support behind each).
6. Results go into V1's `Modifiers` (flood shield, river level, predator stamps, fire cut and spread, crop growth, sickness, cold,
   labour) or new optional fields (bridge hardness, **bridge flow**, home shield, home fire cut, fireproof villagers, bounded
   water sinks, wolf steps), so V1's hazard code carries the physical consequences; entity intents (lift, push, mass, fear,
   hatching, fuel, extra yield) go to `entities.ts`. The bridge stands in the river, where a flood shield on the banks never
   reaches, so water turned from it (or drawn to it) changes the river level the bridge takes that night (bridge flow, ±3); V1's
   arithmetic is unchanged when the field is absent. Each change emits `REALITY_EFFECT` with the law, claim and source tile, and is recorded in `s.v2.lastNight`.

Then `entities.ts` runs at dusk (light stones within 4 tiles of a worker are hauled to the bank: up to 2 a night, each raising a
bank tile and its two nearest neighbours to at most 2), at night (lifted chickens ride out floods and packs; wind ≥ 2 strands
some across the river; grounded chickens drown in water or are taken by packs; light stones in floodwater are carried against the
bridge, -6 damage) and at dawn (fear changes, hatching costs food, tended fields bring in their extra food, strays come home over
a standing bridge, and every third dawn each coop still keeping five hens feeds its own household: less hunger for them, never
food for the granary, so a chapter whose story is the grain running out keeps that story). Witnesses of a belief's effect gain evidence for it.

**Persistence.** Modifiers are rebuilt from nothing every night: temporary effects end the night the law stops acting. What was
done stays done: raised bank tiles, placed or lost stones, drowned or hatched chickens, damage. When belief drains away the law
wavers, collapses and stops acting, and the bank it built stays (tested).

**No loops.** Triggers read tonight's inputs before any effect is applied, and no effect writes a trigger input: rituals and
watchers come from the player's day, weather from the schedule, and the only effect on lanterns burns their fuel faster. Each
clause fires at most once a night and its effect does not grow from night to night (tested with a flood-triggered law that draws
more floodwater).

## 8. V1 laws in this language (`v1.ts`)

Every V1 `RuleSpec` (authored, rival or V1-written) has an AST v2 reading with the same subject, effect, trigger, reach and
strength (`astFromV1`, `source.reader = 'legacy-v1'`); all 11 authored claims of the three chapters and every combination the V1
composer offers translate and validate. V1 laws keep **running on V1's own executor** in every run, so old saves and replays
reproduce bit for bit; where both languages describe the same physics the operator uses V1's arithmetic (a lantern flood clause
stamps exactly V1's shield; tested). V1's side effects appear as omissions ("executed by the V1 law engine").

## 9. Writing a belief: the Compose action

`buildRealityClaim(state, ast)` validates, grounds, balances and returns the preview (mechanics with units, what it needs, risks,
omissions, support, rating, cost) and a claim. `COMPOSE` rebuilds the claim from its AST and refuses a stale confirmation (the
revision the preview was made at), a forged fingerprint, a classic run, a duplicate or more than 3 written beliefs (5 in the Lab);
it charges what the structure costs. Saves re-verify every reality claim on load (`verifyRealityClaim`); an edited one is refused.
The action log replays a reality run exactly, with no model and no reinterpretation.

## 10. Where the phase-06 structure lives

The program suggested `schema / registry / selectors / triggers / compile / evaluate / apply / conflict / budget / diagnostics`.
Here: schema = `ast.ts`; registry = `operators.ts` + `ontology.ts`; triggers, selectors, evaluate, conflict and apply =
`execute.ts` (`fires`, `resolveTargets`, `contribute`, `resolveKey`, `applyKey`); entity mechanics = `entities.ts` + `state.ts`;
budget = `balance.ts`; compile and diagnostics = `build.ts` + `ground.ts`; legacy bridge = `v1.ts`.

## 11. The adversarial corpus

`tests/fixtures/reality-corpus-1.json`: 172 labelled sentences (supported 89, unsupported 62, partial 18, ambiguous 3) in 15
categories (core, synonyms, negation, conditionals, references, quantifiers, compounds, poetic, contradictions, incompatible
effects, unknown targets, global scope, time, coercion, injected instructions) over 12 kinds of thing. Each label says what a
correct reading must contain (kinds, operators, trigger events) or which absent concept must be named. The same author wrote the
corpus and the reader, so scores against it measure regressions and honesty, not unbiased accuracy.

Two **held-out** corpora (`reality-corpus-holdout-1.json`, `reality-corpus-holdout-2.json`, 80 sentences each) were written by
separate agents that never saw the reader, its lexicon, the earlier corpora or the scorer. Each is scored **once, untuned**, before
any change it could inform, and that figure is recorded in `PROGRESS.md`; after a tuning round that uses it, a corpus is in-sample
and its score is a regression floor only. Untuned results: holdout-1 42/80 labels (reader `offline-v2.1`), holdout-2 51/80
(reader `offline-v2.2`). `npm run reality:corpus -- --holdout` / `--holdout2` prints the tables; add `--v1` to score V1's offline
composer on the same sentences through `astFromV1` (holdout-2: 34/80 labels, 3/30 supported read faithfully).

## 12. Reading sentences (`read.ts`, `lexicon.ts`, `wire.ts`, `fidelity.ts`)

**Offline reader v2** (`readBelief`, id `offline-v2.N`): a closed lexicon (kinds, senses with their operator and parameters,
triggers, conditions, places, refusal reasons, instruction patterns) matched with inflections and `*` gaps, longest span first.
It splits clauses, resolves subjects, objects, causes ("the bells make…"), pronouns (by number: "it" is the rain, "they" the
flames) and negation, and returns one of four answers: **supported** (1 candidate), **partial** (what was left out, named),
**ambiguous** (up to two choices, e.g. "spared" from flood or from fire) or **unsupported** (each reason named, and up to two
honestly related alternatives, never for a forbidden idea or a contradiction). A forbidden idea in a coordinated clause refuses
that clause; one set off by commas modifies its neighbour and refuses the sentence. Every candidate is built by the engine
(`buildRealityClaim`) against the live run, with the region chosen where the belief can act; a reading the village cannot hold
anywhere is refused (`not_here`), never offered as understood. Instructions and markup are stripped, reported, and never set a
number.

**The model contract** (`interpret v2`, server): the browser sends only the sentence, the scenario id and seed, the day and a
hashed run reference; the server rebuilds the village, asks the model for output in a schema generated from the operator
registry, fills in provenance, validates, builds, moves a reading to a region where it can act, and drops readings that act on
something the sentence never names (`fidelity.ts`). The browser rebuilds every reading against the live run again (`wire.ts`).
A model only proposes; the engine decides. No model has been called from this repository yet (LIVE unverified).

## 13. Not done yet

Villager cognition that carries these beliefs through real persuasion (phases 07-09); 3D drawing of chickens, stones and each
operator's effect (phase 10). `smoke`, `bell` and `livestock` are logical kinds with no 3D representation of their own.
