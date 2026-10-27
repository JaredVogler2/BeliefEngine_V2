# Phase 02 — Real-time Three.js renderer, camera and cinematic lighting

## Implement a high-quality hero scene

Build one actual React Three Fiber canvas integrated into existing game app with 3D volumetric objects (not a CSS illusion). Use single Canvas scene with sensible component ownership: WorldScene, SceneCamera, Terrain, Water, Buildings, Foliage, Citizens, Effects, InteractionController, LightRig and AdaptiveQuality. DOM HUD overlays interact correctly.

Set world coordinate convention explicitly, e.g. x=east, z=north, y=elevation. Provide stable conversion and test it. One scene camera, one controlled animation loop, clean disposal on restart/unmount.

## Composition and camera

Use flattering orthographic or low FOV perspective, look down 35–50°, azimuth 30–50° over bridge with both districts in frame. Allow smooth eased pan and zoom and bounded orbit, fast center-reset, focus entity, select raycast targets. Avoid tilt allowing camera underground. Intentional large central view with scenic diorama edges, visible elevation. Interpolation independent of canonical turns. At 320px mobile preserve map usability with zoom/focus, do not shrink all to invisibility.

## Cinematic light without overdoing it

Physically plausible color management and consistent material roughness. Warm area-like/directional sun key with soft cast shadow, cool sky/hemisphere ambient fill, tuned tone mapping/exposure, contact shadow or ambient occlusion on roof-ground/tree-ground, distant colored haze and subdued background, selective emissive fire/window lights. If bloom used it must apply to magic and fire only, not make the entire world glow. Use stable material palette: emerald meadow, golden grass, teal river, deep stone, terracotta roofs, ivory plaster, rich timber, candlelit amber, dusky blue shadows and lilac spell glow.

Ensure sun shadows not jagged; tame shadow bias and shimmering, no z-fighting, grounded props and alpha sorting errors. Optimize shadow casting and geometry draw calls instead of turning off depth. Optional decorative floating particles should be light.

## CRITICAL art threshold

A prototype comprised of green PlaneGeometry and several BoxGeometry houses FAILS. Even this phase must include one attractive detailed "hero corner": arched bridge, 2 distinctive houses, orchard/tree clusters, scenic sculpted embankment, cobblestone path, water with movement and cast shadows. Make the art choices concrete and revise them in browser. The scene without HUD must be visually compelling.

## Interaction

Real world raycasting identifies selected existing landmark/villager; highlight mesh and update actual React side panel. Camera drag won't trigger selection. Pause/restart cleans listeners, WebGL resources and audio. Responsive resize; no WebGL black canvas, infinite render loops or duplicate canvases.

## Gate

Capture actual screenshots from initial isometric camera at desktop and mobile sizes. Show material depth, shaped geometry, shadows and landscaping; test camera/select real entities; verify graphics doesn't mutate seed replay. Build, typecheck and E2E smoke pass. Commit only after inspection; if inability to render, record visual quality UNVERIFIED.