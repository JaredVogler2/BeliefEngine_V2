# Phase 03 — Sculpted landscape, beautiful moving river, real flooded terrain, atmosphere

## Objective

Make the land and water look like the MOST IMPORTANT pieces of a premium 3D miniature village. The current flat green checkerboard, straight blue stripe, rectangular hatched flood overlays and repetitive patches must disappear from gameplay. Underlying strategic tiles/grid may continue invisibly in the authoritative engine, but the graphics must be **continuous curved 3D terrain**.

## Land geometry

- Create coherent heightfield/hand-authored diorama mesh aligned to engine tile elevations: embankment, low floodplain, dry hills, connected river valley and farm terraces. Smooth interpolate between grid samples without obscuring risk: display flood vulnerability using subtle soil moisture, reeds and optional explicit tactical overlay.
- Borders: natural rounded terrain plate with exposed layered earth/stone cliff cross-section, or landscape vanishing into painterly fog. No visible rectangular tile seams.
- Distribute 4–6 material zones: grassy meadows, worn paths, tilled farmland, wet riparian soil, stony slopes, village courtyards. Blend colors spatially (vertex colors/splat map/decals) rather than checkerboard blocks.
- Winding paths with smooth width and junctions; believable road/bridge alignments; avoid clipping buildings and terrain.
- Add microdetail: short instanced grass clumps, rocks, flowers, bushes, reeds, fallen logs, tiny mushrooms near forest patches; deterministic placement derived from scenario seed, constrained to navigable tiles and preserving gameplay clickability.
- Grounding: all structures conform to surface height, have foundations and shadow contact. No floating houses/trees or obvious mesh intersections.

## River visuals

- River meanders between modeled banks with a real surface mesh; build bank geometry, stones, shoreline mud/wet strips and limited foam at rocks/pillars.
- Water shading: teal/blue-green with animated flow normals or procedural vertex displacement, sunlight reflections/specular, translucent-looking shallows, opaque deeper central channel, small foam/ripple details, flowing edges. Avoid flat blue plastic, mirror-like glass or expensive real-time planarity on phone.
- Flow direction and speed reflect canonical engine river metadata; physically plausible visual transport downstream, ambient eddies near obstacles.
- Animated flood stage: a height/range transition of visible water consistent with actual engine flood-depth cells, including bank crossing, pooled water near low homes and submerged farmland; no blue checkerboard or disconnected rectangles. World-water meshes interpolate at day resolution; game physics remains exactly canonical.
- Bridge clearance/pier immersion changes with water, nearby villagers react to actual danger; show foam/current intensifying as surge approaches.
- River Fear Fire law effect (only if actually active): water visibly curves away from lit beacons and occupies alternate path/area, with a brief arcane glow at contact. The terrain, flooded cells and bridge status MUST agree with engine state. If engine is tile-based, smoothed render can round edges but not falsely show safe house as flooded, or vice versa.

## Weather and time-of-day

- Sunny calm village (warm golden light, scattered soft shadows, small drifting clouds).
- Approaching storm (cooler fill, clouds, increased flow/wind and visible forecast, animated rain particles on high settings).
- During storm (darkened sky but readable world, gusting trees, surface rain ripples, wet material variations, lightning flashes very restrained and optional).
- Post-crisis (sunbreak, drying ground, debris/flood aftermath, repaired/destroyed structures visibly identifiable).
- Day transitions should be brief skippable environmental animations, not 6 seconds of passive waiting. Weather must be legible to users with motion reduction and muted audio.
- Local visual cloud shadows and mist are optional at low quality tier; never destroy material readability with full-scene fog.

## Techniques and costs

Use 3D meshes, performant shader/material effects where warranted, weather sprites instanced / procedural, and mesh subdivisions sufficient for contours but not enormous. Keep simulation hydrology CPU/headless and feed renderer cached water surface/risk masks. Implement high/medium/low shader paths with inexpensive animated ripples for mobile. Refrain from importing several megabytes of high-res water shaders with unbounded per-frame uniforms.

## Required visual acceptance

At fixed floodless day: hills visually roll, banks have volume and distinctive shoreline, animated water follows meander, a home appears elevated above floodplain. At surge day: water physically floods appropriate depressed parcels and obscures footpaths; wetness/flood progression visible and understandable. At protective-law day: altered water route from active beacons is real and visibly different. Capture 3 actual browser screenshots and accompanying engine tile assertion fixture. A green sheet with blue rectangular water still FAILS, regardless of lighting or particle density.

## Test

Assert render elevations derived from canonical map; changes in state produce geometry/visible depth changes. Use browser capture plus engine snapshots; no fake water mesh inconsistent with events. State reset/seed change updates terrain without memory leaks. Record FPS impact of flood interpolation.