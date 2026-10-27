# Phase 10 — Make generated laws beautiful and physically honest in interactive 3D

## Start from actual renderer

V1 uses raw Three.js in src/render3d/World3D.ts, with modules for land, water, foliage, people, buildings, camera, effects and magic. Keep this unless a measured advantage justifies migration. Continue V1 incomplete 3D art-direction work, focusing on runtime screenshots. A static generated concept-art image is not proof of quality.

## Rendering new operators

Create a visual effect registry keyed by canonical RulePlan and event IDs:
- Forces: animate supported rigid entities (e.g. chickens) through world locations actually computed by engine, ground shadow and motion arcs.
- Material properties: transform hue, roughness, mesh scale/density only when relevant attributes change.
- River flow: animate actual changed contours and current around obstacles, show downstream effects.
- Plant growth: crops visibly mature/decay, fields change resource production.
- Fire/temperature: believable ignition, heat, smoke, damage and local shadow/light.
- Structural health: bridge reinforcement, cracked building states, material glow.
- Light/visibility: local material fog and emissive cues, not overbloom.
- Social event: actual villagers gesture, debate, move and luminous filaments travel only along trust graph edges.

The renderer is a READ-ONLY observer. Never allow Three.js frame physics to mutate the saved game state. Magical effects activate only on legal engine events; failed/unsupported law shows no physical transformation. Animations skippable and reduced motion supported.

## Art quality

Rich, sculpted 3D valley; detailed roofs/windows/chimneys, stone bridge, animated reflective river, wildflowers and varied canopies, distinct villager silhouettes, cinematic light/shadow, atmospheric haze. No green checkerboard, low-effort cubes or opaque HUD covering scene. Keep V1 optional Canvas2D fallback only for WebGL failures or user preference.

UI stays slim; show which entities currently affected through precise world-space markings and tooltip. Bounded orbit/pan/zoom and large touch hit areas for iPhone portrait.

## Real screenshot test matrix

Day 1 default; two new rule activations; compound weather effect; social debate near bridge; suppressed/expired rule; aftermath debrief; 390x844 and 320x568 mobile. Collect actual screenshots from running browser with seed and camera revision. Test high/medium/low quality, context loss, restart memory, input response, 3D object selection and accessibility. Mobile graphics tier may reduce particles but not replace critical three-dimensional objects with icons.

## Gate

Three distinct working physical laws have 3D representations which match canonical state and look like premium real-time gameplay. Performance metrics measured on named browser/device or honestly marked unverified. Build and E2E still pass.
