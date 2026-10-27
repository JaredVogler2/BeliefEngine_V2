# Phase 10 — Brutal art-director review, repair, release

## Your role

Pretend you're evaluating this as a premium independent fantasy strategy game that must compete for a player's attention. Stop congratulating the implementation for simply meeting functional requirements. User rejected previous screenshot; ask if the new result is unmistakably superior in composition, sophistication, atmosphere and real-time 3D depth. Visually compare screenshots with original anti-target and design north star from README.

## No-compromise rejection conditions

Reject release if ANY:
- Main gameplay still looks like 2D icons, green rectangular tiles, or simple extruded cubes.
- Houses lack compelling roof/door/window/chimney/foundation details and tree/terrain surroundings.
- Water remains static blue rectangles or flood activation is only a HUD meter.
- View is fixed fake-isometric 2D instead of freely pan/zoom/limited-orbit real 3D.
- Citizens only appear as flat sprite cards or cylinders with no identifiable role/animation.
- HUD occupies so much screen that the village does not dominate.
- Fancy screenshot cannot actually play a game or has mock game states.
- Game mechanics/replay/saves/MCP are broken by renderer migration.
- Mobile graphical path is blank or so low frame rate it cannot be played.
- No visual evidence of the rebuilt application was actually captured/reviewed, yet it is declared complete.

## Visual review loop

1. Capture 10 required scenes from phase 09.
2. Arrange before/after comparisons with user screenshot anti-target, and write concrete observed changes (volume, terrain contour, bridge detail, canopy, sunlight, water, HUD fraction).
3. Create ranked defect list (P0/blocker, P1/ugly/critical, P2/polish).
4. Fix all P0 and at least top 5 P1, recapture screenshots.
5. Conduct gameplay walkthrough, not only camera-only exploration; fix any controls that became cumbersome due to 3D interaction.
6. Run full engine, E2E, compatibility and performance suite and record actual results.
7. Verify default Vercel production build and run browser route.
8. Document actual deployment URL only if one exists and was tested. If deployment unavailable, provide setup and status.
9. Verify source backup and migration story, check stale old 2D instructions overridden so no future agent undoes work.
10. Mark each phase PASS/FAIL/UNVERIFIED honestly; do not assert premium quality on missing evidence.

## Required results

- Full playable browser build with premium 3D world on default route.
- Three game-changing 3D law interactions and at least one complete win/loss run.
- Camera orbit/pan/zoom and touch selection, plus accessible UI alternatives.
- Cinematic lighting, sculpted topology, real buildings, lush landscape, living people and physically visible hazards.
- Local/save/MCP/replay parity as applicable.
- Versioned model sources, licenses, test matrix and perf measurements.
- docs/3d-rebuild/FINAL_REVIEW.md and docs/3d-rebuild/STATUS.md report; actual screenshots and benchmark artifacts where possible.
- Named commit hashes and final source tree; rollback if critical test failures occur.

## Final artist's test

Launch game with no HUD. Pause on Day 1 and capture screenshot. Ask:
"Would this look at home on the front page of a polished indie game collection? Does every important thing have volume, substance, material and story? Would someone immediately recognize this as a compelling fantasy village and not a map editor or dashboard?"

If no, continue iterating rather than stopping. The user's explicit complaint takes priority over previous prompt's "2D storybook" tolerance.