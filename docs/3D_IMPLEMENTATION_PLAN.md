# 3D implementation plan

How the existing Three.js world gets from where it is ([`3D_QUALITY_REPORT.md`](3D_QUALITY_REPORT.md)) to the
[visual standard](3D_VISUAL_STANDARD.md). It follows the phase order of the Web-graphics standard (audit → art direction → foundation →
scene → motion → polish → mobile → QA → release) and V2's phase 10, and it keeps the rules every phase must keep
([`ARCHITECTURE.md`](ARCHITECTURE.md) §3): the renderer observes, it never decides, and a rule that changes the simulation must be visible
when it fires and invisible when it does not.

**Status of this plan:** stage 0's merge is done (2026-10-28: V1 `main` at `22b7b1c`, which carries JaredVogler2/BeliefEngine#2 and
JaredVogler2/BeliefEngine#3, merged as ordinary history; verification and the new capture set are recorded in [`PROGRESS.md`](PROGRESS.md));
stage 1 is IN PROGRESS (2026-10-28, phase 17's review follow-up: the dangers on the ground and context loss VERIFIED; the forecast
reaches the 3D world since stage 0's merge, the lens and high contrast do not; labels and console warnings NOT STARTED); stages 2-9 are
NOT STARTED. Nothing here is done until its evidence exists. V1's own visual pass (its standard, plan and report) is kept in
[`v1/`](v1/3D_QUALITY_REPORT.md); the baseline numbers below predate it.

## Baseline the plan starts from

Measured in this repository on the V1 renderer as imported (headless Chromium 1243, SwiftShader, no GPU; details in the quality
report): WebGL2, sRGB + ACES, one shadowed sun, no environment light, no post-processing; **566 draw calls and ≈223 k triangles per
frame** at the low tier (1366×768, 0.69 render scale, ≈2.9 fps on the software rasteriser), **1,101 and ≈495 k at high**, 1.5 M
triangles for Ashwood's forest at high. Daylight only: no frame is ever at night. Wolf packs, live fire and smoke, the social
lens, the flood forecast and name labels are not drawn in 3D (packs, fire, smoke and ash are since stage 1's first rows, below). The plate ends in a cut edge in front of a gradient.

## Stage 0: bring in V1's open 3D work (merged 2026-10-28)

[JaredVogler2/BeliefEngine#2](https://github.com/JaredVogler2/BeliefEngine/pull/2) (immersive HUD, end-of-run scene, art-director pass,
batching, 3D browser projects, perf tooling) is based on the commit V2 imported, so it merges as ordinary history.

- When it is merged in V1 (or the owner asks for it sooner): `git fetch https://github.com/JaredVogler2/BeliefEngine main` and
  `git merge FETCH_HEAD` on a V2 branch. Expected conflicts and resolutions are in [`CONTINUE_HERE.md`](CONTINUE_HERE.md).
- Run both 3D suites (V1's `desktop-3d`/`phone-3d` projects and `tests/e2e/v2-world3d.spec.ts`), the 2D suite, the unit suite with the
  migration tripwire, and recapture the matrix below. Fold the two 3D specs into one only after both pass.
- **Acceptance:** all suites green; tripwire unchanged (JaredVogler2/BeliefEngine#2 touches no engine file); a new capture set and quality-report scores.

Every stage below starts from that merged renderer. Doing stages 1-9 first would mean editing the same 30 files twice.

## Stage 1: information parity and correctness (no new look yet)

| Change | Where | Acceptance |
|---|---|---|
| Draw wolf packs (position, size, target) from `snap.packs` | new `render3d/hazards.ts` (packs, fire and smoke are one layer); `snapshot.ts` now also carries each pack's hunger and the 2D map's count of packs out | an Ashwood capture shows every pack the 2D map shows. **VERIFIED** 2026-10-28: as many wolves per pack as the 2D map draws, around the engine's position, trotting to where the engine moves them; a mark over each pack that shows through the trees at the overview; a starving pack's coat and eyes run red ([`render3d-hazards.test.ts`](../tests/unit/render3d-hazards.test.ts), [`v2-world3d.spec.ts`](../tests/e2e/v2-world3d.spec.ts) "the dangers on the ground…" on desktop-3d and phone-3d; [overview](screenshots/v2-phase17/world3d-ashwood-hazards-desktop.jpg), [at the pen](screenshots/v2-phase17/world3d-ashwood-wolves-phone.jpg)). A pack's target is not drawn (the 2D map does not draw it either). |
| Draw live fire and smoke tiles from `snap.fire` / `snap.smoke`; burned ground updates mid-run from `changes.fire` / `changes.terrain` | `hazards.ts`, `groundTexture.ts`, `terrain.ts`, `World3D.setState` | a beacon-ignition night shows flames on the tiles the engine burns, smoke where it says smoke. **VERIFIED** 2026-10-28: flames on every burning tile, out of the roof when a standing building is on it; a haze over every tile the engine has smoky; ash painted on the ground the night a tile burns out, without rebuilding the village (Redbank seed 2: the beacons set Ivo's home alight, it burns down, and three nights later its tile is ash, all played in the 3D world; same tests, [capture](screenshots/v2-phase17/world3d-redbank-fire-desktop.jpg)). |
| The social lens, the flood forecast and high contrast in 3D | `World3D.setOptions` (stored today, never read), `magic.ts`, `effects.ts` | toggling each changes the 3D frame; e2e assertion through a debug hook. **Partly done:** the forecast reaches the 3D world, on its first frame too, since stage 0's merge (`world3d.spec.ts` "the flood forecast and the other view options reach the world on its first frame"); the lens and high contrast are still never read in 3D (NOT STARTED). |
| Name label on the selected person and the active law | world-anchored DOM labels via `entityScreen` | label follows the entity while the camera moves |
| Shadow type three r186 still has; sky, particles and ribbons through the tone mapper; particle size from viewport height and DPR | `World3D.ts`, `sky.ts`, `particles.ts`, `effects.ts` | zero console warnings in `v2-world3d.spec.ts` (add a warning watcher) |
| Context loss shows a notice and offers the 2D map; `visibilitychange` pauses the loop; DPR changes are followed | `World3D.ts`, `MapView.tsx` | e2e: `WEBGL_lose_context` → notice → restore → painted again. **VERIFIED** 2026-10-28: the renderer already kept the context restorable, rebuilt the village on restore and skipped frames while the page is hidden; the player now sees a notice in the middle of the paused village with "Use the classic map" ([capture](screenshots/v2-phase17/world3d-context-lost-desktop.jpg)), and a change of pixel density with no change of size is followed (`v2-world3d.spec.ts` "a lost graphics context pauses the 3D view…": lose → notice, uncovered → restore → painted again; density 1 → 2 → drawing buffer ×1.5 at the medium tier). Headless Chromium raises no media-query event for an emulated density, so the test raises the page's own listener after a real density change. |

## Stage 2: time of day (the core of the new look)

- Planning happens in late-afternoon light; **End Day** lowers the sun, kindles windows and lanterns, plays the night's events in
  lantern light, and dawn brings the result. The engine's threat moods (calm, storm, threat, heat, dusk, sunbreak in
  `render3d/atmosphere.ts`) multiply with the time of day rather than replacing it.
- The sun's **direction** moves (today only its colour and intensity change); a cool moon key at night; exposure follows the hour.
- Window and lantern emissives ramp with the hour (`materials.ts` already scales windows by mood); a capped pool of real point lights
  goes to the most important sources (beacons, campfires, bridge lanterns, the hall) on high and medium.
- **Acceptance:** night captures meet the standard's palette band (warm 8-18 %, hot ≤ 2.5 %, mean luminance 0.25-0.40), day captures
  0.40-0.60 with water darker than land; the transition plays under reduced motion as a cut; resolution effects stay readable at night.

## Stage 3: landform and atmosphere

- Replace the cut plate edge and the gradient void with an enclosing landform generated from the chapter seed: cliff walls, rock
  pillars crowned with trees, forested ridges, all outside the playable tiles and outside the camera's limits; flood chapters get a
  gorge, drought chapters a terraced bowl, wolf chapters a forest valley.
- Height fog in the valley, layered distance haze, a sky with a bright opening or horizon glow and stars at night; light shafts on high.
- **Acceptance:** from every allowed camera angle no frame shows the end of the world; the far landform reads as layered silhouettes;
  draw calls for the landform ≤ 20.

## Stage 4: water

- High: planar (or screen-space) reflection of lit buildings and lanterns; medium and low: reflected warm streaks from an environment
  or reflection texture. Floating leaves, ripples, foam only where water runs fast; flood water murkier with debris.
- **Acceptance:** a night capture shows reflected lantern streaks under every lit waterside source; the flood still covers exactly the
  engine's tiles (`tests/unit/render3d-plan.test.ts` style parity check on the water mask).

## Stage 5: lanterns, set dressing, people

- Lantern posts along roads, the bridge and doorways; larger readable windows; villagers carry lanterns after dark; fireflies and motes
  at night; larger, smoother villager silhouettes.
- Belief magic in the new language: a law waking kindles lanterns within its reach around its powered sources; wavering flickers;
  failed or suppressed goes dark; rival violet; every effect still planned from an engine event id (`render3d/plan.ts`).
- **Acceptance:** each law state has a capture; no effect plays without its event (existing plan-parity tests extended).

## Stage 6: image pipeline

- A generated environment (PMREM) for plausible specular; selective bloom over a threshold above the brightest lit surface (flames,
  lantern cores, law glows only); one tone-mapping pass; anti-aliasing that survives the post chain.
- **Acceptance:** no double tone mapping (a test renders a known emissive value and samples it); bloom off on low with the same
  identity; captures before and after per tier.

## Stage 7: performance

- Draw calls from 566 to **≤ 250 on medium and low**: merge or instance villager rigs (15-23 meshes each today), merge static props,
  tree LOD; let the quality monitor step back up; keep the world rebuild off the frame on a tier change.
- Measure on a named desktop GPU and a named phone; software-rasteriser numbers stay labelled as such.
- **Acceptance:** the budgets in the standard §11.5 with the device named; no frame spike above 50 ms on End Day on the desktop GPU.

## Stage 8: phone composition and touch

- A portrait composition (closer, steeper, the village stacked along the river) with the bottom sheet leaving the focal point visible;
  two-finger rotate; 44 px targets; safe areas; landscape at 844×390.
- **Acceptance:** captures at 390×844, 393×852, 360×740 and 844×390 scored ≥ 4 for mobile appearance; touch tests for tap, drag,
  pinch (and a manual check of two-finger rotate, which Playwright cannot synthesise).

## Stage 9: visual QA loop and release

- A repository script that captures the whole matrix (7 viewports × day, law at night, threat night, mid-resolution, debrief) and
  measures the palette statistics the standard defines (a TypeScript port of the measurement used in the quality report).
- At least three capture → score → fix iterations, each recorded in the quality report with the frames.
- **Acceptance:** every rubric row ≥ 4 with written reasons, every standard §11 item checked, `npm run test:e2e` and the 3D suites green.

## After stage 9: V2 phase 10

The visual effect registry for the new rule operators of phases 04-06 (forces on entities, material changes, river flow, growth,
fire, structural health, light, social events), keyed by canonical rule plans and event ids, on top of the lantern-light language
above.
