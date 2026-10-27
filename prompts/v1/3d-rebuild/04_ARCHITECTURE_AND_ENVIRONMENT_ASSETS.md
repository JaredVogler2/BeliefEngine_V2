# Phase 04 — Handcrafted miniature architecture, vegetation and rich world detail

## Objective

Make the settlement look assembled by a talented environment artist. The current project displays simple small rectangular icons for houses. Replace them with authored 3D meshes that are appealing when zoomed in and read distinctly when zoomed out.

## Building art kit

Model multiple real 3D variants or load original/licensed GLBs (procedural generator or Blender scripting encouraged). **Each building asset must have actual volumetric roof, wall, eaves, chimney/ornament, door and windows rather than a single extrusion.**
- Cottage: 3–5 asymmetric variants, plaster wall imperfections, timber framing, steep roof with tile/wood slate details, gables, porch, flowerboxes, chimneys and windows. Different footprint and rotation, not rescaled clones.
- Farmhouse and barn: expanded timber body, canopy, farm implements, trough/fence and hay/stacks. Visible pitched roof, door and yard.
- Watermill: timber/stucco on bank, animated wheel, short water channel, millsacks; no random wheel rotation when bridge/river state unsuitable.
- Stone bridge: curved deck/arched supports, masonry stones, parapet, lanterns, visible walkway, changing flood exposure and damaged/failing geometry at low integrity.
- Bell tower: tall distinctive silhouette with stone steps and bell frame, ringing animation tied to actual claim/action, shadow cast over houses.
- Beacon stations: braziers or sturdy torch pedestals with fuel containers, ignition state, dynamic emissive flames, smoke, controlled shadow/light.
- Market/hall: awnings, stalls, hanging signs, carts, barrels and social gathering space.
- Shelter/refuge: elevated pavilion/chapel with tents and safe walkway, clearly visually distinct.
- Fences/wood bridges/gates/stone walls that follow paths and support narrative context.
- All important buildings clickable via proxy collider/hit area and highlight on hover/focus; building ID matches engine.

Make roofs warmer in sun and cool in shadow, roof-tile density readable at typical zoom. Materials physically coherent: clay plaster roughness, wood grain restrained, stone irregularity, amber windows. Use bevels and high-quality normals to avoid sharp default boxes. Avoid adding model detail so fine it is invisible from the player camera; shape hierarchy is key.

## Plants and wildlife

At least 4 tree varieties/age/shape variants (oak with rounded canopy, pine with layered boughs, birch with delicate branching, willow by river), using well-designed foliage groups and effective lighting. Non-flat foliage with self-shadowing approximations; no uniform cones. Trees make shaded clusters and vary height/rotation/branch structure.

Add grass tuples/patches, wildflowers, reeds in water, shrubs, farm crop rows, climbing vines, hedges, logs, moss and rock clusters. Use instanced geometry/deterministic seeded scatter with exclusion near houses/roads. No foliage forest blocking the critical bridge or obscuring selection; hide/fade trees under camera or selection context as needed.

Life props: carts, market tents, buckets, laundry, benches, crates, lanterns, fishing poles and chimney smoke. Multiple miniature landmarks that players notice during pan/zoom; no static unmodeled stick figures.

## Village layout and story

Make **east and west banks feel like distinct human places**, not symmetric gridded cards. Road curves, cottages cluster logically, market at crossroads, farms on lower land, shelter elevated, bridge central choke and treeline beyond. Colors/props communicate role and community. Respect actual scenario buildings, positions and navigable connectivity. If art desires conflict with physics or map paths, adapt staging while preserving semantic geography.

Distinct silhouette at initial wide view:
- The tallest bell tower landmarks the village.
- Primary bridge has visible crossing and strong stone silhouette.
- Beacon sites appear as meaningful installations, not anonymous orange circles.
- Farm plots visibly different from grass.
- Each district has housing clusters and footpaths.
- A safe hill is immediately recognizable.

## Asset pipeline

If Blender available, generate exportable GLBs via scripts, check triangulation/normals/origin axes/pivots, glTF 2.0 material compliance and model license. Also store reproducible asset source scripts, texture source and scene assembly data. If Blender unavailable, build advanced mesh factories using lathe/extruded shapes / procedural roof pitches / joined geo in TS and export through scripts if practical. DO NOT quietly replace a premium house with a box because the asset pipeline is inconvenient. A compact glTF file can contain multiple reusable variants; scene instancing matters more than number of draw calls in one building.

Do not hotlink random models from CDN or use unlicensed packs. Record asset origin and license. Progressive loading gives a textured/procedural graceful fallback but production hero route must show full assets on both desktop and phones.

## Quality gate

Screenshot without HUD must show richly modeled architecture and vegetation at both default camera and close-up, clearly distinct buildings and cast shadows, winding roads, high/low land; houses should look warm, collectible and detailed. Compare a zoomed house against the flat screenshot: it should have roof shape, chimney, window, wall material and surrounding props. If it looks like a tiny box, fail. Test 10+ variants, 4+ tree styles, real bridge and tower, correct game world entity mapping.