# 3D visual standard: "Lantern Vale"

The art direction and the measurable bar for Belief Engine V2's 3D world. It applies the *World-class interactive 3D visual
experience* standard from the [PROMPTS_FOR_REUSE](https://github.com/JaredVogler2/PROMPTS_FOR_REUSE) repository (`Web-graphics`) to this
game, using the reference image the project owner supplied. How the world measures against it today:
[`3D_QUALITY_REPORT.md`](3D_QUALITY_REPORT.md); how it gets there: [`3D_IMPLEMENTATION_PLAN.md`](3D_IMPLEMENTATION_PLAN.md).

## 1. The reference

The owner's reference is a digital painting published by Spectra Studios (spectra-studios.com): a lantern-lit fantasy village in a
deep, misty canyon. It is a mood reference only. **It is not committed to this repository** (third-party artwork) and nothing from it
is copied into the game; the numbers below were measured from it.

What it does, in the order a viewer notices:

1. **Warm light inside a cool world.** Amber windows, arched doorways and lanterns glow against teal-slate rock, mist and water.
2. **A sanctuary enclosed by wilderness.** Tall rock walls and pillars, trees growing on their tops, hanging growth from above; the
   village sits in the one sheltered pocket.
3. **Depth in layers.** Dark foreground rocks and still water, a lit village and an arched stone bridge in the midground, cliffs
   fading into blue haze behind, a bright sky opening at the top that backlights the haze.
4. **A mirror of water.** The calm river reflects every warm light as a long vertical streak; floating leaves and small glints break
   it up.
5. **A clear focal point.** The largest lit building and the bridge sit where the river leads the eye.

Measured from the image (the artwork area, sampled per pixel):

| Group | Share of pixels | Representative colour |
|---|---|---|
| deep shadow (luminance < 0.12) | 19% | `#080e13` |
| cool midtones (teal-slate rock, water, foliage in shade) | 27% | `#23373f` (p25 `#192d37`, p75 `#2d3f47`) |
| cool lights and haze | 24% | `#8e9b98` (p75 `#c8d3ca`) |
| water body | 9% of frame | `#273c44` (deep `#1b323a`) |
| moss and foliage | 6.5% | `#3d483f` (lit `#5c695d`) |
| warm darks (lit timber and stone) | 4.4% | `#85542b` |
| warm glow (windows, doors) | 6.5% | `#c68c4d` (p75 `#dc9d59`) |
| hot cores (lantern flames, brightest panes) | **1.4%** | `#f7d37c` (p75 `#fbe18b`) |
| sky opening | 2.9% | `#e7eae2` |

Mean luminance **0.33**; warm pixels **12%**; hot cores **1.4%**. The image is mostly cool and dark, and warm light is a *scarce
accent*: that scarcity is what makes it precious.

## 2. Why it fits this game

Belief Engine is about people turning shared stories into physical law while a flood, a drought or a wolf pack closes in. The
reference's contrast is the game's own:

| In the picture | In the game |
|---|---|
| warm lanterns, windows, hearths | people, belief, the Keeper's stories; lit beacons, bells and vigils that power laws |
| cool water, rock, mist, night | the world that does not care: river, flood, drought heat, wolves, winter |
| a sheltered village in the wild | the village the player is trying to keep alive |
| lights reflected in still water | *River fears fire*: firelight holding back the river, literally |

So the palette is not decoration: **warm light means human belief at work, cool means the world**. A law that wakes should add warm
light to the world where (and only where) it acts; a law that fails should visibly go dark.

## 2a. Relationship to V1's art direction

V1's open pull request [JaredVogler2/BeliefEngine#2](https://github.com/JaredVogler2/BeliefEngine/pull/2) carries its own
`docs/3D_VISUAL_STANDARD.md`: "an inked storybook diorama … floating in a sea of cloud", from a cozy village-builder reference given to
that session. V2 is directed by the reference above instead. What carries over from V1's direction: daylight readability, painted
procedural materials, dense lived-in set dressing, magic colours reserved for meaning, weather that follows the engine's forecast,
contact shadows, the immersive HUD. What does not: the floating island over a cloud sea (V2 encloses the village in landform), the
afternoon-only palette (V2 adds dusk and night), ink outlines as the main stylisation (optional in V2, never at the cost of the warm/cool
lighting). When JaredVogler2/BeliefEngine#2 is merged into V2, its standard moves to `docs/v1/` and this one stays authoritative
([`V1_AUDIT.md`](V1_AUDIT.md) §16).

## 3. Pillars

1. **Sanctuary in the wild.** Every chapter is a pocket of human warmth enclosed by a larger, cooler landscape: river valleys between
   high mossy cliffs, rock pillars crowned with trees, a backdrop that fades into haze. The playable plate must stop looking like a
   tabletop board with a cut edge.
2. **Light is information.** Warm light marks belief, powered sources and safety; cool tones mark threat; gold marks trust ties and
   law reach; violet marks rival stories; red-orange marks harm. No glow without a game meaning.
3. **Day to plan, night to see belief work.** Planning happens in clear late-afternoon light so the board reads; **End Day** sends the
   sun down, lanterns and windows come on, and the night's events play out in lantern light; dawn shows the result.
4. **A living diorama.** Water moves, leaves sway, smoke rises, fireflies and motes drift at night, villagers walk their routes and
   carry lanterns after dark. Nothing loops so obviously that it reads as a screensaver.
5. **Readable first.** At every hour a player can still tell where the water is, what is flooded, who is where, which buildings
   stand, which law is active and what it covers. Atmosphere never hides game state.

## 4. Palette tokens

| Token | Hex | Use |
|---|---|---|
| `night-shadow` | `#080e13` | deepest shadows, night sky edge |
| `deep-teal` | `#0f222d` | night fog and water depth |
| `slate-teal` | `#23373f` | rock, cliff faces, shaded foliage |
| `mist` | `#8e9b98` | haze and distant cliffs |
| `pale-mist` | `#c8d3ca` | lit haze near the sky opening, highlights on stone |
| `sky-glow` | `#e7eae2` | sky opening, dawn horizon |
| `moss` / `moss-lit` | `#3d483f` / `#5c695d` | vegetation |
| `water` / `water-deep` | `#273c44` / `#1b323a` | river body (flood water greyer and murkier) |
| `timber-warm` | `#85542b` | lit wood and stone near light |
| `window-glow` | `#c68c4d` → `#dc9d59` | windows, doorways, lantern housings |
| `lantern-core` | `#f7d37c` → `#fbe18b` | flames, hot centres; never more than ~2% of the frame |
| `trust-gold` | `#f2b84b` | belief, trust ties, law reach (already the effect planner's trust colour) |
| `rival-violet` | `#7a63ff` | rival stories |
| `danger` | `#ff6b57` | fire, harm, failed proof |
| `rain-cyan` | `#4cc9f0` | rain and bell-driven water effects |

Daylight planning keeps the same hues but lifts luminance: sunlit moss, warmer stone, water still darker than the land.

## 5. Light and image pipeline

- **Colour management**: sRGB output, one tone mapper for everything that is lit (ACES Filmic today; AgX acceptable), including the sky
  and particles, so nothing double-converts or skips tone mapping.
- **Key light by time of day**: a low warm sun (10-25° elevation) late in the planning day; a cool moon key at night; the sun's
  direction moves, not only its colour.
- **Fill and ambient**: a cool sky/hemisphere fill so shadows read teal, not grey.
- **Local light**: windows and lanterns are emissive at all tiers; on high and medium, a capped pool of real point lights (or baked
  light textures on the ground) around the nearest or most important sources: beacons, campfires, the bridge lanterns, the hall.
- **Bloom**: selective, threshold above the brightest lit surface so only flames, lantern cores and law glows bloom. Off on low.
- **Shadows**: one directional shadow, soft but correctly biased, covering the playable area; contact darkening under buildings and
  villagers. The renderer must request a shadow type that three r186 still has.
- **Environment light**: a small generated environment (gradient or room-style PMREM) so stone, roof slate and water get plausible
  specular instead of flat shading.

## 6. Atmosphere, landform, water

- **Height fog** in the valley, teal at night, warm-grey in late afternoon; distance haze that turns far cliffs into layered
  silhouettes; mist over water at night.
- **Enclosing landform**: non-interactive cliffs, rock pillars and forested ridges around the plate, generated from the chapter seed
  so every village has its own skyline; they block the "edge of the board" view at every allowed camera angle.
- **Sky**: a gradient with a bright opening or horizon glow and, at night, a few stars; optional light shafts on high.
- **Water**: a dark mirror. High: planar or screen-space reflections of lit buildings and lanterns. Medium and low: reflected warm
  streaks from an environment or a reflection texture, never a flat colour. Gentle ripples, floating leaves, foam only where water
  moves fast. Flood water uses the same surface, murkier, with debris.

## 7. Architecture, people, effects

- **Buildings**: steep slate or thatch roofs, timber framing, chimneys, balconies on the larger halls, windows big enough to read as
  lit from the default camera; each landmark keeps a distinct silhouette (bell tower, chapel spire, mill wheel, beacon cages, the
  arched stone bridge with lantern posts).
- **Villagers**: readable silhouettes at the default zoom, role props, faction colour accents, a lantern after dark; fewer draw calls
  per person than today (merged or instanced rigs).
- **Belief magic**: gold filaments travel only along real trust ties; a law waking lights its reach on the ground and kindles lanterns
  around its powered sources; a wavering law flickers; a failed or suppressed law goes dark; rival stories are violet. Every effect is
  planned from an engine event id (as `src/render3d/plan.ts` already does) and none appears when the engine says nothing happened.
- **Threats are visible**: the flood's depth, burning and smoking tiles, wolf packs and their targets, the forecast for tonight. (Since
  phase 17 the 3D world draws packs, live fire, smoke and ash, with a mark over each pack at the overview; the forecast and the social
  lens reach it since V1's 3D work was merged; high contrast and labels are still missing: the plan's stage 1.)

## 8. Camera and composition

- Default desktop view: a three-quarter view with the village centre as focal point, the river as a leading line, foreground rock or
  water at the bottom edge, enclosing cliffs at the top edge, sky visible above them.
- Phone portrait: composed for the tall frame (closer, steeper, the village stacked along the river), never a crop of the desktop view;
  the HUD bottom sheet must leave the focal point visible.
- Smooth eased orbit, pan and zoom within limits that never show the end of the world; recenter always available; two-finger rotate on
  touch.

## 9. Interface

Dark translucent panels with warm gold accents and serif headings (the existing HUD language), never opaque slabs over the focal point;
44 px touch targets; world-anchored labels for the selected person and the active law; reduced-motion and high-contrast respected in 3D
as well as in 2D.

## 10. Quality tiers keep the identity

| | High | Medium | Low |
|---|---|---|---|
| Lighting | sun/moon + local point lights + bloom + environment light | sun/moon + fewer local lights + cheap bloom | sun/moon + emissive only, no bloom |
| Shadows | soft, 2048 | 1024 | blob/contact shadows |
| Water | real reflections | reflected streaks from a texture or environment | the same streaks, cheaper normals |
| Atmosphere | height fog, haze layers, light shafts, motes | height fog, haze, fewer motes | exponential fog, painted haze layers |
| Landform | full ridge geometry | simplified ridges | silhouette cards |

Low must still look like the same art-directed game at dusk: warm windows, cool mist, reflected lanterns.

## 11. Acceptance criteria

A change to the 3D world is accepted when all of these hold, checked on real captures of the running canvas:

1. **Captures**: 1920×1080, 1440×900, 1366×768, 390×844, 393×852, 844×390 and 360×740; states: day-1 planning, a law active and
   powered at night, the threat night (flood, drought or wolves), a resolution mid-animation, the debrief scene; seed, state and camera
   recorded for each.
2. **Rubric** (Web-graphics §14, scored 1-5 by inspecting captures, with the reasons written down): art direction, geometry and
   materials, lighting and depth, environmental richness, animation and liveliness, interaction quality, camera, mobile appearance,
   performance. Target **≥ 4 in every row**; scores are aids, never evidence by themselves.
3. **Palette at night** (same measurement as §1): warm pixels 8-18%, hot cores ≤ 2.5%, mean luminance 0.25-0.40, deep shadow 10-25%.
   Day planning: mean luminance 0.40-0.60 with water still darker than land.
4. **Readability**: every state the 2D map shows (flood depth, fire, smoke, packs, forecast, lens, labels on selection) is visible in
   3D; `tests/e2e/v2-world3d.spec.ts` keeps passing (WebGL2, painted, picking by engine id, identical hashes).
5. **Performance, measured not assumed**: desktop 60 fps target at 1920×1080 on a named GPU; capable phones 60 fps target, 30 fps
   floor, on a named device; draw calls ≤ 250 on medium and low (566 at low and 1,101 at high today); no frame-time spikes on End Day. Software-rasteriser
   numbers are reported as such and never as device performance.
6. **Robustness**: no console errors or shader warnings, context loss recovers with a notice, tab suspension pauses, resize and
   orientation keep the composition, reduced motion stops non-essential motion.

## 12. Not acceptable

A green board with a cut edge floating in a gradient; flat even lighting; glow with no game meaning; bloom that hides geometry; a
handful of random dots as particles; effects that play when the engine logged nothing; a phone view that is a shrunken desktop; any
screenshot that is not from the running canvas presented as the game.
