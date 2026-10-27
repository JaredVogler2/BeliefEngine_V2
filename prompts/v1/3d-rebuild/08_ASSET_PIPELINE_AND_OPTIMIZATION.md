# Phase 08 — High-quality assets that load quickly; performance on actual phones

## Art asset production is part of the implementation

Do not declare assets "to be added later" or swap every planned GLB with procedural primitive placeholders. Build repeatable pipeline supporting Blender Python generation/import/export OR well-crafted Three.js geometry factories converted to reusable assets. Prefer glTF 2.0 / GLB for runtime. Record model hierarchy, pivots, scale, normals, AO, vertex color and texture format. Use coherent material library and mesh asset manifest versioned with source.

Asset checklist:
- Terrain + banks + road materials + scenic base and river geometry.
- Cottages 4+ architectural variants, farm, mill, bridge, bell tower, hall, refuge, beacon.
- Tree variants 4+, bushes, grasses, crops, wildflower clusters, rocks, fence sections, carts, crates, lanterns.
- Named villagers 14+ using shared rig or performance-appropriate procedural animation with differentiated clothes/hair/gear.
- Environmental VFX: fire, smoke, mist, rain, water foam, rune ribbons.
- Audio/optional title art reused from existing project if licensable.
All scene items need actual asset paths/generators, fallback assets and validation tests. Maintain docs/3d-rebuild/ASSET_LICENSES.md listing origin, attribution, commercial license and embedded source for each external asset.

## Efficient R3F/Three implementation

- Use memoized/shared BufferGeometries, material caches and instanced meshes for high-count foliage/stones/flowers/roof details; instancing preserves lighting and variety via per-instance transforms/colors.
- Group static geometry by material where feasible, avoid thousands of unique drawcalls.
- Use LOD: high detail for interactive key landmarks and close zoom; lower silhouette for distant scenery. Disable/simplify shadow for tiny distant props.
- Avoid heavy physically accurate transparency and expensive many-light setups.
- Adaptive device-pixel-ratio: cap DPR on phones, dynamic quality based on observed frame budget and regression while camera moving. Respect browser visibility changes.
- Shadow quality tiers: desktop real soft shadow; mobile lower-res key shadow plus baked/contact hints.
- Water shader tiers: animated normals/shore foam on high; simple animated highlights on medium; single-pass textured flow on low. Never turn to flat blue block.
- Postprocessing: only if it helps. Bloom or SSAO need measured benefit and quality switch. Shader/pass compatibility tied to renderer selection; WebGL2 baseline.
- Models: compressed glTF geometry (Draco or Meshopt when useful), textures KTX2/Basis only when warranted with correctly hosted decoder assets. Check actual bytes and decode cost; don't blindly compress tiny geometry. Use referenced official Three.js GLTFLoader/DRACOLoader docs.
- Reuse animations/skins across villagers. Far NPC update cadence may be lower, but apparent motion should remain smooth.
- Use resource disposal: textures/materials/geometries/animation mixers on scene replace; prevent leaking GPU memory with every new seed.

## Cold load and fallback

- Show tasteful in-world loading scene/progress with actual load status, not indefinite spinner.
- Critical visible geometry loads before distant decor; lazy-load noncritical assets.
- Missing GLB triggers a graceful stylized 3D fallback for that asset only and logs issue, not blank whole game.
- If WebGL2 unsupported, provide clear error and optionally old 2D engine as accessible degraded mode—not pretend full 3D is universally possible.
- No dependence on external CDN availability for core art after build; self-host generated assets in build.
- Vercel static asset routing, content hashes and cache-control considered.

## Performance target (aspirational until tested)

Desktop: stable 60fps at default village camera, no stutters >100ms during normal actions, 2-second initial visible scene after app bootstrap on warm reasonable network (record actual timing and environment).
Mobile: median >=30fps during normal play at suitable quality with no 3-second animation freezes, successful pan/orbit/selection.
Memory budgets: inspect GPU/JS behavior across 10 consecutive restart or new-seed cycles; no monotonic leak in owned resources. Startup bundle and transfer report should be recorded rather than promise an arbitrary low download weight.

Track drawcalls, geometries, triangles, texture memory, frame time p50/p95, shader compile stalls, FPS during active flood, device/browser. Provide developer quality monitor behind flag, not always-on production overlay.

## Objective signoff

Test on Chrome desktop + Playwright WebKit/iOS-like viewport as approximation, and actual iPhone/Safari if available. Device with limited GPU may auto choose low setting, but image must retain dimensional architecture, sculpted terrain and dynamic river. Never "optimize" by swapping all buildings to icon sprites. Game engine turns/canonicals produce exact same outcomes across quality profiles. Save recordings and data in docs/3d-rebuild/PERFORMANCE.md.