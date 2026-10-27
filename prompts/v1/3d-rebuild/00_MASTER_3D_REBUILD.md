# /goal — Rebuild BELIEF ENGINE as a beautiful, living 3D strategy game

You are autonomous principal game engineer, web-3D technical artist, environment modeler, UX designer, graphics performance lead and demanding QA reviewer. The user specifically rejected the current **flat 2D tiled map, tiny sprite houses, broad color overlays and oversized panels**, asking for smooth, richly rendered 3D resembling the evocative miniature fantasy concept art. Deliver **actual playable 3D gameplay**, not only a hero scene.

## First: protect the real work

The connected repository main branch currently shows only old prompts and README, without application source. On your machine identify the **actual** code being shown in screenshot: pwd, current git remote/ref/status/untracked/ignored, local branches, deployment source and running app. Back up uncommitted changes, take snapshots, record baseline tests, save fixtures and screenshot. If source unavailable, record precisely which files are missing; scaffold from prior rule specs rather than claiming an in-place migration. Never delete working application code blindly.

## Non-negotiable product

Real-time 3D browser world drawn in Three.js / React Three Fiber; React DOM for accessible menus and HUD. Scenarios and player actions come from the existing deterministic simulation, saved as before. **The renderer is an observer of game state**; social beliefs, claim effects, NPC navigation and flood hazards are never recomputed as arbitrary per-frame behavior. The gameplay must function end-to-end: start, choose villager, seed rumor, end day, propagate, activate law, see a real 3D water/bridge/fire response, win/lose, save/replay and choose new seed. MCP tool parity retained.

## Visual north star

"The Living Storybook" — a beautifully handcrafted tabletop fantasy settlement with volumetric natural terrain, a winding reflective river and bank geometry, an ornate traversable bridge, 10+ individually varied cottages, a mill, bell tower, fields, fences, market and refuges. Tactile clay/plaster/timber/stone materials, beveled edges, roof tiles, flowers, expressive tree canopies, warm afternoon sky light, soft contact and cast shadows, mist, glints on water, glowing lanterns and luminescent belief filaments. 14+ recognizable 3D citizens perform daily tasks. Slight camera foreshortening, restrained depth-of-field and material highlights. Mature palette of emerald/gold/terracotta/teal/indigo rather than bright green checkerboards. **Avoid photoreal GTA, cheap low-poly primitives and pointlessly excessive postprocessing.**

## Geometry fidelity requirements

Make environment look rich due to shape and detail, not a filter. Elevation contours/slope must exist as geometry. Houses need roof volumes, doors, windows, beams, chimneys and perimeter details. Trees need layered rounded canopies with variation; terrain needs grass tufts, stones and shrubs; bridges need arches/decks/railings; farming areas need individually observable planted rows. There must be depth cues, shadow and material distinction from initial overhead angle.

## Gameplay visual storytelling

Beliefs flow along true people-to-people trust connections; activate an actual local law; locally modify real world meshes/material and appropriate hazard state. Water rises on actual banks and pools into visible low terrain. Lamp fire illuminates its neighborhood, emits smoke and pushes water when the corresponding supported law truly activates. Citizens walk around landmarks and flee the river. Never show powerful VFX when there was no valid game event.

## Camera & controls

Three-quarter isometric-leaning orthographic or narrow-FOV camera at 35–50° down; framing captures bridge, both districts and key crops. Smooth pan, limited orbit and zoom; clear reset, focusing and selection. Desktop raycast clicks and keyboard; on phone drag/pinch and enlarged touch hit areas with a collapsible sheet. Camera should not accidentally select objects while panning.

## Preserve boundaries

- React + Three.js with one WebGL canvas and efficient scene subscription.
- Engine remains headless and deterministic, not tied to requestAnimationFrame.
- Selector maps tiles/locations/elevations/entities to x/y/z visual representation; game IDs stable.
- Visual interpolation and particle RNG independent; canonical replay hash unaffected by GPU or frames.
- Versioned saves remain compatible/migrated, no loss of old achievements/state.
- MCP and optional NL composer still invoke engine action API; do not double-implement rules in renderer.

## Strict workflow

Execute phases 01–10 sequentially. Record in docs/3d-rebuild/STATUS.md; preserve code/test provenance and artifacts. For each phase build + test, launch in browser, screenshot fixed seed/camera, evaluate visual criteria, fix, commit. Do not mark visuals "finished" if unable to see real render; use status UNVERIFIED with exact manual steps. If working code absent, prioritize recovering it before deleting/rewriting. Each phase must leave bootable app. No empty frameworks, mocked click results, placeholder buttons, fake assets.

## Technology

Default: WebGL2 renderer, Three.js + R3F + Drei, Vite/React/TS strict. glTF 2.0/GLB for assets where possible; reproducible procedural mesh generation as fallback. Avoid Three.js WebGPURenderer as production hard dependency until official compatibility/perf validation, because it remains experimental and certain postprocessing/shader patterns differ. Test official current library docs, pin compatible versions and lockfile. Avoid installing a full game engine for one camera. Do not use CSS rotations of the old Phaser surface and claim 3D.

## Gate

User sees a gorgeous diorama immediately; can interact with actual citizens; 3D law/flood effects track real simulation; desktop smooth and iPhone-class phone viable; win/loss paths still valid; measured tests and screenshots. If the viewport still looks like the supplied green-board screenshot, FAIL and revisit art/geometry.