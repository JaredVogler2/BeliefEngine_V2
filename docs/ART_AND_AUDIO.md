# Art and audio: what each signal means and where it comes from

Everything here is drawn or synthesised in code (`docs/ASSETS.md`). Effects are **derived from engine events**: nothing is played for a result
that did not happen, and every effect has a text twin (the action summary, the morning digest, the log) so a muted or reduced-motion player gets
the same facts. Screenshots of real engine states are in `docs/screens/` (`npx tsx scripts/capture-states.ts`): calm day, a live law, the surge
night, the end-of-run scene, each at 320x568, 390x844, 768x1024 and 1440x900.

## Map effects (`src/render/MapRenderer.ts`)

| Engine event | What you see | Notes |
| --- | --- | --- |
| `RUMOR_SEEDED` (you tell someone) | a warm ink spiral unwinds above the listener | `playAction`, immediate |
| `MESSENGER_SENT`, `BELIEF_SHIFT`, `BELIEVER_GAINED` | a dotted gold trail travels along the *actual tie* between the two people (the same curve the social lens draws), then a glowing head and "✦ believes" | one stroke style for trusted word |
| `BELIEVER_LOST`, `DISTRUST_REVERSAL` | a jagged, cool, unbroken stroke ending in a cross | the opposite signature on purpose |
| `EVIDENCE_STAGED` / `EVIDENCE_BACKFIRED` | a ring at the place, and an eye opens over each witness (gold; red when the proof fails) | witnesses are found from the beliefs the event moved |
| `GATHERING` | a wide ring and a line to each attendee | |
| `RUMOR_CHALLENGED`, `RIVAL_CAMPAIGN`, `RIVAL_REBUTTAL` | two coloured rings (violet against gold) contest the listener, then "rumour a → b" floats up with the measured change | counter-propaganda is a contest, not a flash |
| `LAW_AWAKENING` | a rune expands over the ground the law will govern, with a faint ground wash | belief crossing the threshold |
| `LAW_ACTIVATED` | a larger rune, two rings, a golden flash and a **brief scale swell of the whole world** around the law | skipped when motion is reduced |
| `LAW_COLLAPSED`, `LAW_SUPPRESSED` | red and grey contest rings | |
| `HOME_SPARED`, `FIELD_SPARED`, `BRIDGE_HELD` | green or gold rings at the saved thing | |
| `FIRE_*`, `FIELD_BURNED` | sparks; `SMOKE_SICKNESS`: grey puffs over the coughing villager; `RAIN_DISPLACED`: a blue wash; `BRIDGE_COLLAPSED`: timber sparks and a camera move | contrasting warnings |
| `DEATH` | a grey ring | |

Caps: at most 80 live effects (36 on the low-quality profile), 26 gossip strokes per resolution, 40 events considered; the unit and E2E tests
replay a burst and assert the cap (`tests/e2e/visual.spec.ts`). Reduced motion shortens or skips every animation and removes the world swell.

## End-of-run scene (`src/ui/scene.tsx`)

A strip read from the final state: dawn (victory) or dusk (defeat); one house per home, lit if it stands and slumped if it fell; the bridge whole or
broken; a dot per villager (gold alive, outlined dead); water, grain or a wolf-moon foreground by kind of danger. About two seconds, with a Skip
button, still when motion is reduced, and its caption states the same numbers in text.

## Audio (`src/audio/audio.ts`, Web Audio only)

| Cue | Used for |
| --- | --- |
| seed, ritual, gather, counter, deny | telling, staging proof, gatherings, challenges, refused actions |
| bell | ringing the bells; **panned to the side of the map the tower stands on** |
| law | a rising five-note figure when a law wakes |
| warn, night, dawn, creak | warnings, night falling, morning, the bridge groaning under strain |
| rescue, loss, win, lose | a home spared, a death, the verdicts |
| ambience | two drones, a slow arpeggio whose register follows the threat, **wind** whose level and pitch rise with the danger, and a **creek** where the village has a river |

Music and effects have separate switches and volumes, remembered locally; a visible mute button is in the play bar; audio starts only after the first
user gesture; at most 24 voices at once, every voice disconnects itself, the ambience can never be started twice, and nothing uses `Math.random`.
`tests/unit/audio.test.ts` drives the module against a fake Web Audio graph to check each of those claims. *Not verified*: how any of it sounds
(nobody has listened to it in this environment), and real-device audio unlock behaviour.
