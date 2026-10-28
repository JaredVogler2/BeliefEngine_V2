# 3D quality report: V2 baseline

> **Superseded renderer.** On 2026-10-28 V2 merged V1's later 3D work (JaredVogler2/BeliefEngine#2 and JaredVogler2/BeliefEngine#3: immersive HUD, end-of-run
> scene, a finishing chain with ink lines and ambient occlusion, yards and props). The frames and scores below are of the renderer *before*
> that merge; V1's own record of its pass is [`v1/3D_QUALITY_REPORT.md`](v1/3D_QUALITY_REPORT.md).
>
> **Phase 10 (2026-10-28), the merged renderer.** Frames of the merged renderer with phase 10's effects are in
> [`screenshots/v2-phase10/`](screenshots/v2-phase10/) and described in [`3D_EFFECTS.md`](3D_EFFECTS.md). What changed against the rows
> below: the threat mood and forecast reach a freshly loaded world (V1's P0, fixed by the merge); ink lines and ambient occlusion give
> the houses and trees edges; a written law now shows on the ground (its glyph) and in its effects (hens rising to the engine's height,
> the stone carried to the bank, the bank's courses, pooled water marked); the merged HUD leaves most of the screen to the world (a
> browser test checks it). What did not change: it is still lit as day at every hour, still a plate in a void, still green-dominated,
> and draw calls at the high tier are 520-750 (147 at low) against the standard's 250. The rows below were not re-scored: a re-score
> with the palette measurement is stage 9's work, and nothing here should be read as meeting the bar.

What the 3D world looks like on 2026-10-27, measured against the [visual standard](3D_VISUAL_STANDARD.md). The renderer is V1's,
exactly as imported from `6a92862` (no file under `src/render3d/` has changed). Every frame below is a capture of the running
production build's canvas; none is a mock-up. The plan to close the gaps: [`3D_IMPLEMENTATION_PLAN.md`](3D_IMPLEMENTATION_PLAN.md).

**Verdict:** a clean, readable, cohesive **daylight toy diorama**, and the opposite of the chosen direction. It has no dusk or night,
no warm/cool contrast, no local light, a board that floats in a gradient void with a cut earth edge, saturated green everywhere, and
three game threats the 3D world does not draw. Its strengths (the bridge, the house kit, dense instanced forests, the gold
belief-magic language, an observer architecture with parity tests) are worth keeping. Today it scores **2 of 5 in five of the nine
rows and 3 in the rest; nothing reaches the target of 4.**

## How the frames were made

- Production build served by `vite preview` on port 4174; headless Chromium 1243 with WebGL2 on **SwiftShader** (a CPU rasteriser:
  every frame rate here is a CPU number, not a GPU one).
- `scripts/capture-3d.ts`: a bot plays the engine up to the named day (`--policy`), the state is loaded through the save format, the
  interface is hidden unless noted, and the **high tier is pinned** (`--quality high`) so the art is seen at its best. One frame uses
  the low tier that automated and software-GL browsers actually get.
- Mood-dependent states (law, threat, Ashwood, Harvest) were captured with a scratch copy of that script that adds one call,
  `__beRenderer.advance(4)`, before the final render. On a CPU rasteriser the renderer clamps each frame's time step to 0.1 s, so its
  2.2 s mood blend would otherwise be caught half-finished.
- Palette numbers use the per-pixel groups of the standard §1, with the same measurement used for the reference (an ad-hoc script; a
  repository version is plan stage 9). *Warm* and *hot* measure hue, not light source: a peach dusk sky or a yellow heat haze
  counts as warm.

## Frames

All in [`screenshots/v2-baseline/`](screenshots/v2-baseline/). Redbank seed 1 unless noted; draw calls and triangles are the
renderer's own `info()` for that frame.

| Frame | State | Tier | Draw calls | Triangles |
|---|---|---|---|---|
| `calm-1920x1080`, `calm-1440x900`, `calm-1366x768` | day 1, no interface | high | 1,101 | 494,842 |
| `calm-390x844`, `calm-393x852`, `calm-360x740` | day 1, phone portrait, no interface | high | 1,062 | 491,848 |
| `calm-844x390` | day 1, phone landscape | high | 1,101 | 494,842 |
| `calm-lowtier-1440x900` | day 1, the tier automation gets | low | 566 | 222,733 |
| `law-1440x900`, `law-390x844` | day 6 of an evidence-first bot's run (a law active), settled | high | 1,112 / 1,073 | 495,478 / 492,484 |
| `hazard-1440x900`, `hazard-390x844` | day 6 doing nothing, the night before the surge, settled | high | 1,110 / 1,071 | 494,950 / 491,956 |
| `effect-1440x900`, `effect-390x844` | day 5's real events replayed, 1.2 s in | high | 1,124 / 1,085 | 495,712 / 492,718 |
| `ashwood-1440x900` | Ashwood seed 6, day 5 (wolves; dusk mood), settled | high | 900 | **1,497,252** |
| `harvest-1440x900` | Harvest seed 1, day 5 (drought; heat mood), settled | high | 887 | 363,665 |
| `hud-calm-1440x900`, `hud-calm-390x844` | day 1 with the interface, as a player sees it | high | 1,101 / 1,062 | — |
| `map2d-calm-1440x900` | the 2D map, for comparison | — | — | — |

## Palette against the reference

| Frame | Mean luminance | Deep shadow | Warm | Hot | Green |
|---|---|---|---|---|---|
| **Reference** (owner's image) | **0.33** | **19%** | **12.4%** | **1.4%** | **6.5%** |
| Standard band, night | 0.25-0.40 | 10-25% | 8-18% | ≤ 2.5% | — |
| Standard band, day planning | 0.40-0.60 | — | — | — | — |
| `calm-1440x900` (day) | 0.65 | 0% | 5.0% | 0.04% | 30.9% |
| `calm-390x844` (day, phone) | 0.75 | 0% | 1.1% | 0.01% | 19.2% |
| `hazard-1440x900` (night before the surge) | 0.65 | 0% | 4.9% | 0.04% | 29.9% |
| `effect-1440x900` (resolution) | 0.65 | 0% | 5.4% | 0.26% | 30.8% |
| `ashwood-1440x900` (dusk mood) | 0.52 | 0% | 4.2% | 2.9% (the sky) | 35.3% |
| `harvest-1440x900` (heat mood) | 0.68 | 0% | 16.0% (haze) | 2.5% (haze) | 18.9% |

Every 3D frame is too bright even for the daytime band, has no deep shadow at all, and is green-dominated; no frame is ever at night.

## What the frames show

1. **Daylight only.** Every state, including the night before the surge and the moment a law acts, is lit by the same high midday
   sun. The game's nights, when laws act, are never shown at night.
2. **A board in a void.** The village is a rectangular plate with a brown cut edge floating in a pale gradient, about a quarter of
   every desktop frame is empty sky, and in a portrait frame with the full screen to itself more than half is void (`calm-390x844`).
3. **Threat is not legible in the world.** The night before Redbank's surge (`hazard-1440x900`) looks the same as day 1 apart from a
   slightly fuller river: the storm mood the renderer has is driven by the forecast option, which does not reach a freshly loaded 3D
   world (the same defect V1's pull request JaredVogler2/BeliefEngine#2 calls its P0). Ashwood shows no wolf pack at all; fire and
   smoke tiles are not drawn anywhere ([`V1_AUDIT.md`](V1_AUDIT.md) §9.5).
4. **A law at rest is invisible.** On day 6 of a run with an active law (`law-1440x900`) nothing on the ground says so; the law only
   becomes visible as effects during a resolution.
5. **The belief-magic language is good.** `effect-1440x900`: gold rings where the law acts at the bridge, rune glyphs over people
   who changed their minds, gold ribbons travelling along real trust ties. It is already the standard's trust-gold, planned from engine
   event ids, and would read far better against a dark world.
6. **Phone.** With the interface (`hud-calm-390x844`) the world fills the width between the bars and stays legible, but the column
   of eight view buttons covers its right edge and the second story card is cut off. Without the interface, at full screen height, the
   camera backs off: the board shrinks into the middle of a void and the uniform fog washes it out.
7. **Interface.** Dark navy glass, gold accents, serif headings: already the standard's interface language and the most on-direction
   part of today's frames. The world keeps about 60% of the desktop screen; the opening story cards overlap its lower left.
8. **Moods that work.** Harvest's heat (yellowed light, dry haze) and Ashwood's dusk sky are legible and show the renderer can carry
   a mood; Ashwood's dense instanced forest is the richest scene.
9. **The 2D map** is flat but the most legible view: every villager is labelled (the 3D world labels no one); two labels collide
   ("Pip" over "Tilly").

## Scores (Web-graphics rubric, 1-5, against the V2 standard)

| Area | Score | Why |
|---|---|---|
| Art direction and cohesion | **2** | coherent as a toy diorama, but midday-only, saturated green and floating: the opposite of the warm-in-cool sanctuary the standard asks for |
| Geometry and materials | **3** | roofs, chimneys, timber framing, a fine stone arch bridge, varied trees; painted textures read flat from the default distance; villagers small and blocky |
| Lighting and depth | **2** | one fixed high sun, soft shadows, uniform fog; no local light, no environment light, no layered haze; threat moods mostly unseen |
| Environmental richness | **2** | Redbank is large empty meadow; nothing exists beyond the plate; Ashwood's forest is the exception |
| Animation and liveliness | **3** (provisional) | water flow, sway, walking villagers, chimney smoke and effect motion exist in code and in the effect frame; motion was not watched at speed (a CPU rasteriser draws ~1 frame a second at high) |
| Interaction quality | **3** | picking by click and tap verified by tests, effects planned from real events; but packs, fire, smoke, lens, forecast and labels are missing in 3D |
| Camera | **3** | a good desktop and landscape three-quarter framing, bounded orbit; the end of the world is always in view; no portrait composition |
| Mobile appearance | **2** | legible with the interface, but tools cover the world; without it, small and hazy |
| Performance and fluidity | **2** (provisional) | 1,101 draw calls and 495 k triangles at high (Ashwood 1.5 M), 566 at low: far above the standard's 250 budget for phones; no GPU or phone measured |

## Ranked deficiencies

| Rank | Deficiency | Plan stage |
|---|---|---|
| P0 | the 3D world hides game state the 2D map shows: wolf packs, fire and smoke tiles, forecast and threat mood on load, lens, labels | 0 (V1 PR fixes the forecast on load) and 1 (packs, fire, smoke and ash drawn since phase 17: [plan](3D_IMPLEMENTATION_PLAN.md) stage 1) |
| P0 | no time of day: nights are never shown, so there is no warm/cool story at all | 2 |
| P1 | the board floats in a void with a cut edge | 3 |
| P1 | water is a turquoise toy surface with no reflections | 4 |
| P1 | draw calls and triangles far above budget | 7 |
| P1 | portrait composition and tool overlap on phones | 0 (V1 PR adds a portrait view) and 8 |
| P2 | an active law is invisible at rest; villagers small and blocky; meadows sparse | 5 |
| P2 | shadow type removed in three r186 (warns, falls back), sky and particles skip tone mapping, particle size ignores viewport | 1 and 6 |

## Keep

The stone arch bridge and the house kit, the instanced forests, the gold belief-magic language and its event-id planning, the heat
and dusk moods, the interface's dark-and-gold language, and the observer architecture with its parity tests.

## Not verified

Motion at real speed, any GPU, any phone, Safari or WebKit drawing this world in V2, and how a person reads it. The palette
measurement is a proxy and is always read together with the frames.
