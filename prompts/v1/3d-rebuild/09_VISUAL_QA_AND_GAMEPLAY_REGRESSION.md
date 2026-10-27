# Phase 09 — Independent visual and functional acceptance; test the actual pixels

## Problem we're solving

The screenshots shown by the user are 2D even though the earlier desired concept reference was a richly dimensional storybook fantasy settlement. An automated test suite proving only that a canvas exists would have passed the wrong product. Hence we need **visual gates** based on browser screenshots and actual human-like interactions.

## Screenshot matrix

For a canonical seed, camera angle and quality profile, capture REAL render frames at:
A. Default Day 1 overview, no inspector: river and bridge visible, architecture/terrain/trees lit beautifully.
B. Close view of 2 cottages and orchard: roof detail, bevels, masonry, chimneys, glazing, shadow, ground props and citizens visible.
C. Select villager, social lens: identity legible, 3D avatar highlighted, actual gossip arcs, HUD does not obscure.
D. Pre-surge storm: clouds, wind, rising water stage, wet ground, danger obvious but world not pitch black.
E. Activated River Fears Fire: lit beacons, ripple repulsion and changed FLOOD geometry, side effect region visible.
F. Bridge Stands Watched: physically present watchers, bridge resilience motif, law meter and social justification.
G. Loss aftermath: ruined village consequences visible; not generic victory screen with unrelated image.
H. Victory aftermath: protected structures visible, soft celebratory sky and debrief.
I. Mobile portrait default, selected villager, bottom action sheet; no clipping.
J. Low-quality mobile: still 3D, legible and attractive.

Browser automation can save screenshots under test artifacts; document seed, exact viewport, device scale, quality flag, commit, tested hardware and expected variation. Compare with existing screenshot as anti-target by feature checklist, not blind pixel color metric. Evaluate reference concept art quality goals qualitatively with explicit categories.

## Minimum scorecard (1–5; require 4+ for each major area before declaring premium)

- Three-dimensional depth: roof shape, building surfaces, rolling terrain, realistic object overlap and camera foreshortening.
- Art coherence: common stylized material/texture palette, natural silhouettes, no random clashing model packs.
- Environmental life: wind/water/smoke/villagers coherent, not static table.
- Lighting/material: warm cinematic sun, believable shadows, material richness, no flat shaded green boxes.
- River: moving, volumetric appearance, visually corresponds to flood.
- Architecture: bridge, tower, homes and farms have personality and zoom-in detail.
- Citizens: identifiable, animated in legal location and pickable.
- Magical causality: visible social→law→physical pipeline on real world state.
- UI discipline: map gets priority, crucial info available with minimal clutter.
- Phone usability: 3D readable and smooth, controls usable.
- No faux completion: compare real screenshots to requirements without relying on code comments or agent claims.

The 1–5 ratings are internal reviews, not a claim of independent end-user scores. When ratings <4, identify visible flaw and fix, capture new frame, not subjective positive descriptions.

## Functional game regression

- Fresh game -> starter claim -> select citizen -> AP deduction -> Day advance -> actual belief spreading -> Law activation -> modeled flood changes -> 3D NPC evacuation -> win/lose debrief -> replay new seed.
- Same seed+actions yields identical canonical engine hash across old/new renderer and high/low quality settings.
- At least two distinct Redbank strategies documented with verified win traces from existing earlier phase.
- Save/resume while a law is active and mid-storm; no loss of world, incorrect animations after rehydrate, duplicated event VFX.
- MCP game tools retain parity with browser if MCP implemented; natural language composer claims still use validated rules, not direct graphics manipulation.
- Check selecting crowded villager, bridge and beacons with mouse and phone-sized touch.
- Repeated restart, map focus and quality toggle do not leak WebGL resources or accumulate canvases.
- Offline default core game works if optional LLM/API unavailable.

## Visual regression automation

Use Playwright screenshots for stable scenes (fixed seed, animation time frozen or stepped for snapshots, fixed camera). Automated screenshot diff baseline is helpful but changes to GPU/browser affect pixels, so combine with structural assertions and manual inspection. WebGL automated screenshots may require a configured browser GPU mode; report if screenshot capability is absent. Don't manufacture screenshots with image generation to claim runtime fidelity.

Quality tests:
- No blank screen, pink missing textures, floating houses, citizen feet through ground, uniform cube forests, blocky water overlay, wrong flood stage, clipping near bridge, modal over main character or hidden CTA.
- Lighting consistent after orbit, touch hit targets correct.
- FPS capture with representative camera and storm, p50/p95 frame durations, no crash after repeated scene switching.

## Deliverables

docs/3d-rebuild/VISUAL_QA.md with screenshot links/paths, scenario seeds, summary scores and 5 biggest issues. Tests and code proving actual game continuity. Do not mark phase complete without actual browser visual review; if visuals cannot be inspected, mark incomplete with exact manual steps. Commit corrected results.