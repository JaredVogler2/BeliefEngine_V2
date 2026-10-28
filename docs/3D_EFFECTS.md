# What written laws look like in 3D (phase 10)

The 3D world is an observer. It draws the run it is handed and plays effects for events the engine logged; it never decides a
physical outcome and never writes to the run. Phase 10 adds the vocabulary for Generative Reality: the things a written law acts on
(hens, loose stones, the bank they raise), and the effects of each operator, every one traced to a logged event and to data the
engine computed.

Code: `src/render3d/plan.ts` (what to show, as plain data), `src/render3d/effects.ts` (plays plans), `src/render3d/reality.ts` (hens,
stones, coops, the raised bank; the lift), `src/render3d/snapshot.ts` (what the renderer is given). Tests:
`tests/unit/render3d-reality.test.ts`, `tests/e2e/v2-world3d.spec.ts`.

## 1. What the renderer is given

- **Things**: coops; live hens with their positions (strays on the far bank included), each drawn as body, head, comb, beak and tail
  turned together so a hen reads as a hen at any zoom; loose and placed stones (wet ones darker);
  the bank raised by hauled stones (one course of fitted stone per level, drawn at the waterline where water presses on it).
- **Last night's applied effects**, as the executor recorded them: event id, law, operator, targets, and what each entity effect
  amounted to once every law's pull was combined (`amount`: tiles of lift, loads of weight).
- **Written laws by their own clauses**: a written belief carries a neutral V1 spec only for its thresholds; the snapshot describes it
  by its first clause's trigger, target and operator, and powers it from what the reality executor itself finds tonight (the rung
  bell, the lit lanterns). Without this the ledger in the world would have shown a bell law as "needs a lit beacon".

## 2. Event → effect

| Event | Effect | From |
|---|---|---|
| `REALITY_EFFECT`, `APPLY_FORCE` up | **lift**: exactly the hens the executor lifted rise to the height it computed, hover with a flutter, settle; blob shadows shrink with height | applied targets and `amount` |
| `REALITY_EFFECT`, `SET_MATERIAL_PROPERTY` | a ring at each stone whose weight changed | applied targets, stone positions |
| `REALITY_EFFECT`, `ALTER_TEMPERATURE` | **chill** (cooler: pale motes sinking over each lit fire) or heat (sparks rising); a ring where the law holds when no fire burns | the event, lit fires |
| `REALITY_EFFECT`, water operators | ripples at the law's sources | the law's sources tonight |
| `REALITY_EFFECT`, rain operators | a rain ring at what powered it (the bell) | the law's sources |
| `REALITY_EFFECT`, growth / feelings / other | rings on the fields, runes over people, rings on the things it touched | applied targets |
| `BANK_RAISED` | the stone carried from the villager to the bank (arc), dust where the bank rises | actor, tile |
| `STONE_RAMS_BRIDGE` | splash and dust at the bridge | the event |
| `WATER_POOLED` | rain gathering over the pooled ground | the pooled tiles' centre and count, carried by the event |
| `FIRE_WARDS_COOLED` | rings at the lit beacons whose ward sank | the event, lit beacons |
| `STRAYS_FLEW_HOME` | rings at the coops | the event |
| `NPC_ACT` (a villager's own choice) | the villager gestures; an arc only along a real tie (resist-coloured when arguing against) | actor, target, ties |
| `TEST_*`, `LIE_DISCOVERED`, `NPC_CLAIM_*` | eyes over the villager who demands proof (trust or danger once answered), a ring on a liar seen through, rival marks on a villager putting their own story | the event |

Rules: an effect plays only for an event of that very night (tested over every recorded chain); a law that never woke shows nothing
(the bell rang every day in the control chain and nothing rose); reduced motion holds a lift without motion and shortens the rest;
every planned effect carries its reason for the log and assistive text.

## 3. Screenshot matrix

Real frames of the production build on software WebGL (SwiftShader, no GPU), from the recorded chains
(`tests/fixtures/v2-bridge-traces.json`) by `scripts/capture-matrix-v2.ts`; each line of its output names the chain, the day and the
camera. In [`screenshots/v2-phase10/`](screenshots/v2-phase10/):

| Frame | What |
|---|---|
| `A-day1-reality` | day 1 of a Generative Reality run (Redbank, seed 2), interface at rest |
| `B-law-wakes-hens-lift` | claim A wakes on day 6: its glyph and the hens rising to the height the engine computed |
| `C-law-wakes-stone-bank` | claim B wakes on day 6: the bank courses, the waking law's ripples around the lit lantern |
| `D-compound-weather-aftermath` | the morning after claim C acted (its village's last night), in the end-of-run scene; its pooled tiles are part of the water drawn on Eastbank, where the river also flooded, so they are not told apart in this frame |
| `E-debate-near-bridge` | villagers acting on their own around the bridge (gestures, arcs along real ties) |
| `F-law-let-go-wavering` | a written law let go, wavering, with the ledger open (constructed: support withdrawn by setting beliefs; the law's own rules then make it waver) |
| `G-aftermath-loss` | the end-of-run scene after claim A's loss: the hens it saved, the homes the flood took |
| `H-phone-390-hens-lift` | the waking law and lift on a phone, 390×844 |
| `I-phone-320-low` | a small phone, 320×568, lowest tier: still 3D, the raised bank and the stones |
| `hens-rising-*` (from the browser test) | a bell night played live in the 3D world: the hens in the air over the coop |

## 4. Performance (measured only on a software rasteriser)

From the matrix (`info()` of each frame): at the high tier, 1440×900, 520-750 draw calls and 0.54-0.67 M triangles; at the low tier,
320×568, 147 draw calls and 0.23 M triangles. Frame rates on SwiftShader (0.3-1.9 fps here) say nothing about a GPU: **frame times on
real hardware, a real phone or real Safari are UNVERIFIED.** The reality layer adds 10 instanced draws (hen body, head, comb, beak, tail
and shadow; stones; coops and roofs; the bank's courses), whatever the number of hens.

Browser tests: `npx playwright test --project=desktop-3d --project=phone-3d` (V1's `world3d.spec.ts` with V2's `v2-world3d.spec.ts`):
**46 passed, 4 skipped by design** (29 minutes on software WebGL). They cover the quality tiers, context loss and restore, restart
memory, picking by click and tap, the camera's limits, axe accessibility over the live world, the 2D/3D toggle and, for phase 10,
the bell night in which the executor's hens rise to the engine's height and settle.

## 5. Status

- **Effects traced to the engine: VERIFIED** (unit tests over the recorded chains; a 3D browser test plays a bell night and watches the
  executor's hens rise and settle; the outcomes drawn from saved states).
- **Three physical laws in 3D matching canonical state: VERIFIED** for A (the lift), B (the raised bank and placed stone), C (moved
  water drawn by the water surface the engine computes; pooled ground marked by its effect).
- **"Premium real-time gameplay": NOT MET, by my own reading of these frames.** The village reads clearly and the effects follow the
  engine, but it is a daylight toy diorama, not the dusk "Lantern Vale" of [`3D_VISUAL_STANDARD.md`](3D_VISUAL_STANDARD.md); hens are
  drawn about twice life size against the houses so a phone can read them; no human has judged it. Stages 1-9 of [`3D_IMPLEMENTATION_PLAN.md`](3D_IMPLEMENTATION_PLAN.md) remain.
