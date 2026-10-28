# Belief to reality (phase 09)

A written sentence becomes a rule of the world only through the whole chain: the words are read into the reality language, the
engine builds and prices the claim, the player confirms it, villagers carry or dispute it through the social network, enough of them
come to believe it, something physical sets it off, and the executor changes the run's state through V1's own hazard code. A model
may take part in two places (reading the words, proposing what a villager does); it never decides whether a belief is law or what
it changes.

Code: `src/engine/reality/` (`read`, `build`, `preview`, `execute`, `entities`, `project`, `provenance`), `src/engine/laws/`,
`src/engine/social/`, `src/engine/mind/`. Tests: `tests/unit/belief-bridge.test.ts`, `tests/e2e/v2-bridge.spec.ts`,
`tests/e2e/v2-world3d.spec.ts`. Recorded chains: `tests/fixtures/v2-bridge-traces.json` (`scripts/record-bridge.ts`).

## 1. The chain, link by link

| Link | What happens | Where |
|---|---|---|
| Words → reading | The offline reader (or, with consent, the interpret v2 contract) proposes ASTs; unsupported words are listed with why, never relabelled; what it assumed is stated ("“orchard”: read as the fields of Eastbank (this village has no orchard of its own)") | `reality/read.ts`, `server/ai/tasks/interpret.ts` |
| Reading → claim | Validated (closed vocabulary, ranges, depth), grounded in this village, balanced: power sets the support needed, firm believers, ramp and cost | `ast.ts`, `ground.ts`, `balance.ts`, `build.ts` |
| Preview | Per clause: what it acts on and how many there are now, reach, how long, what sets it off and whether that could happen tonight; the support needed from how many voters; upkeep (bell rituals, lantern fuel); what else it does (only what the engine plays); who may push back (stories pushing the other way, skeptics, the factions involved) | `preview.ts`, `RealityCompose.tsx` |
| Confirmation | `COMPOSE` carries the AST and the run revision it was previewed at; the engine rebuilds it, refuses a stale revision (`STALE_REVISION`), an altered structure (`STALE_BELIEF`), a duplicate (`ALREADY_WRITTEN`) or a fourth belief, and charges the engine's own price | `core/actions.ts` |
| Persuasion | The Keeper's tellings, gatherings, messengers and staged proofs; gossip along trust edges at night; villagers' own choices (minds); skeptics who demand to see it; only the engine changes conviction | `social/`, `mind/` |
| Threshold | V1's law step: local support above the line, enough firm believers, no single voice carrying it, a ramp over days, hysteresis (wavering, then collapse); a contradicting story suppresses the weaker. Nothing else makes a belief law | `laws/resolver.ts` |
| Catalyst and execution | Each night: the trigger is tested against what physically happened (a bell rung, a lantern lit), targets resolved, contributions combined by property (opposite pulls by the support behind each, never by order), written into V1's modifiers and entity intents; every change is an event naming its law | `reality/execute.ts`, `entities.ts` |
| Consequences | V1's flood, fire, crop, wolf and sickness code plays the night; lasting changes stay (a raised bank, a destroyed home) | `world/` |
| Looking ahead | The flood forecast, the map overlay, villagers deciding to evacuate and minds' flood moves all include what written beliefs will do to the water | `reality/project.ts`, `ai/routines.ts` |
| Provenance | From the log: the words, who was told, who carried it, who pushed back, the threshold crossed, what changed, what it came to; in the debrief and the law ledger | `reality/provenance.ts`, `ui/play/Provenance.tsx` |

## 2. The three proof claims, through real persuasion

Each chain below starts from the sentence typed into the composer and is spread by the same greedy, preview-driven bot the balance
tournaments use (no belief is ever set). Replayed from its actions alone it gives the same state and event hashes; in the browser the
same clicks end on the same hash. The chains were re-recorded under phase 11's written-belief rules (2); as recorded under rules 1
they are kept in `tests/fixtures/v2-bridge-traces-rules1.json` and still replay to their own hashes.

| Claim | Village | Became law | What changed in the run | Outcome |
|---|---|---|---|---|
| A. "Chickens fly when the bell rings." | Redbank, seed 2 | day 6 (7 believers, 70%) | 22 hens rise two tiles on nights 6 and 7 and ride out water that would have drowned them; told once and never again (same seed, bell rung every day), nothing rises and every hen drowns | a complete loss: all Influence went to the hens, four villagers drowned |
| B. "Wet stone becomes light beside lanterns." | Redbank, seed 3 | day 6 (8 believers, 74%) | two wet stones by the lit lantern weigh two loads less; a villager carries one to the bank; three tiles of bank stand higher for good and shield every later night | loss (the chapter's flood) |
| C. "At night, bell ringing pulls rain toward the orchard and makes local flames burn weaker." | generated village x1.2, held in Eastbank | day 8 of 9 (8 believers, 70%; day 9 under rules 1) | the river stands one step lower; Eastbank's lowest dry tiles stand a tile deep (12, then 7); fire damage there is cut and the hearths cool; skeptics demanded to see it and nobody showed them; under rules 2 the people it flooded trust the Keeper less and a faction leader stands against it (phase 11) | loss |

A complete win with the composer used: Redbank seed 1, the belief written and spread, the authored Fire Wall decides the chapter.

**Entity rules, checked in isolation** (support shortcut, said so in the tests): a hen across the river with the bridge down flies home
on a still night only when the law lifts it; with the lantern out, or the belief let go (it wavers, then collapses), the stones keep
their weight.

## 3. Harm the player did not ask for

- **Cooler flames lower the fire wards.** Clearly cooler flames (two steps) make the river fear the beacons' fire less: in Redbank
  with River fears fire holding, ringing the bell for "Flames burn weaker when the bell rings" lowers the ward around the lit
  lanterns a step, and at some river levels the homes behind it flood deeper (paired test, support shortcut). Not ringing the bell
  on a flood night is the other choice.
- **Moved rain lands somewhere.** Claim C pools water on Eastbank's low ground; the preview says so before it is written.
- **Opportunity cost.** Claim A saved every hen and lost the chapter.

## 4. What the measurements found

- **Written beliefs were slow (rules 1).** Through the greedy bot a written belief reached law in 6-9 days; chapters last 7-9. A
  written flood ward ("The river turns away from lit lanterns": strong, 70% and six believers) never became law in Redbank's seven
  days; a written grain belief in Harvest became law on day 8 or 9, too late to feed anyone. **Phase 11 changed this** (rules 2:
  support nearer authored laws of equal power, demonstrations at a belief's catalyst): the same flood ward now wins 24-27 of 30
  Redbank seeds ([`GAMEPLAY_V2.md`](GAMEPLAY_V2.md)).
- **Claim C cannot become law in Redbank**: the chapter holds back rain answers until day 4 (V1's pacing rule against a written
  rain belief skipping the chapter's own) and C needs 65% of the whole village. It did in a nine-day generated village.
- **Bugs fixed**: region-wide effects on the river commons (fire, crops, cold, sickness) were keyed to `river`, which the hazards
  never read, so they did nothing; district-wide protections counted once per person or home and summed to the cap; several
  previewed downsides were not modelled (now either modelled, cooler flames, or no longer claimed); the forecast and evacuations
  ignored written beliefs; no stone ever lay within reach of a lantern in Redbank.

## 5. Status

Offline and with a scripted provider: **VERIFIED** (tests above; browser chains on the classic map, the outcomes drawn in the 3D world
from saved states). The model's part (reading words, proposing villager moves): **LIVE UNVERIFIED** (no provider configured). The 3D
world draws what the run holds (hens alive and where, stones, the raised bank, the water); it does not yet animate an effect as it
happens (hens rising, rain bending): phase 10.
