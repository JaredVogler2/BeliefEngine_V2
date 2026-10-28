> V1's `docs/3D_IMPLEMENTATION_PLAN.md` as of `22b7b1c53ab5` (JaredVogler2/BeliefEngine `main`, its world-class visual pass), merged into V2 on
> 2026-10-28 and kept here for reference. V2's own document is [`../3D_IMPLEMENTATION_PLAN.md`](../3D_IMPLEMENTATION_PLAN.md); paths below are V1's.

# Belief Engine: 3D implementation plan (world-class visual pass)

This plan turns the art direction in `docs/3D_VISUAL_STANDARD.md` into work that can be checked. Each phase below names what changes,
where in the code it changes, and the evidence that shows it is done: a test, a measurement or a captured frame that a person has
looked at. `docs/3D_QUALITY_REPORT.md` records the results, including what did not reach the bar.

## Where the project starts (audit)

| Area | State before this pass |
|---|---|
| Stack | React 19 interface, Vite, TypeScript. The 3D world is raw Three.js 0.186 (WebGL2) in `src/render3d/` (about 8,500 lines), lazily loaded as its own chunk. The classic 2D canvas map stays as the fallback (`?renderer=2d`, and the default without graphics acceleration). |
| Separation | The renderer reads a read-only `SceneSnapshot` (`src/render3d/snapshot.ts`) and never writes to the engine. The engine, saves and the MCP server are untouched by renderer work (`git diff 1077522 HEAD -- src/engine mcp server` is empty). |
| Content | All geometry and textures are procedural (no asset files), placed from the scenario seed. Terrain with strata and a floating-island root, a flow-shaded river and engine-exact floods, five cottage types plus civic buildings, instanced forests, animated villagers, weather moods, a cloud sea with islets, birds, magic effects tied to engine events. |
| Lighting | A warm sun with PCF shadows (2048 px high, 1024 medium, none low), a hemisphere fill, a cool fill light and exponential fog. ACES tone mapping was applied per material by the renderer. There was no environment map, no post-processing, no ambient occlusion and no bloom. MSAA came from the canvas. |
| Tiers | `high` / `medium` / `low` profiles (`src/render3d/context.ts`), a frame-time monitor that steps down tiers and render scale, a software-GL cap of 3 fps, and `?quality=`, `?scale=`, `?debug=1`. |
| Tests | 364 unit tests, a 256-run simulation smoke, 140 classic browser tests, 34 3D browser tests (software WebGL), axe checks, a hosting check under the production CSP, and a cross-browser smoke. |

Why not React Three Fiber, drei or Rapier: the renderer is a working, tested, imperative Three.js codebase behind a small interface
(`WorldRenderer`). Porting it to R3F would change every file and buy nothing visible. The game has no physics that a player sees (the
engine is a deterministic simulation), so a physics engine would add weight with no effect. The brief allows plain Three.js. WebGPU is
not required anywhere: everything runs on WebGL2.

## Phases

### WC-1. Rendering foundation

* **Finishing chain** (`src/render3d/post.ts`). The scene renders into a half-float buffer with a depth texture. One composite pass then
  applies, in this order:
  * depth-only ambient occlusion from paired samples (4 pairs on high, 2 on medium, none on low);
  * the ink line;
  * bloom;
  * ACES tone mapping and the sRGB encoding, applied once.

  FXAA follows on high and medium. Tone mapping happens in that one pass only: materials rendered into the buffer are not tone mapped.
* **What each pixel is.** Opaque materials write a class code into the alpha channel, which the screen never shows. A standing thing
  writes `1 + glow` and the ground writes `-(1 + glow)`, where glow is the material's own emissive light. Transparent materials keep the
  code that is already there. This gives three things without a second geometry pass:
  * ink only on standing things: where their depth breaks away from what is behind them, and where they meet the ground;
  * no ink on grass or on the ground's own folds;
  * bloom only on what the materials say emits light (windows at night, lanterns, fire, magic).
* **Sky light** (`src/render3d/env.ts`): a procedural sky rendered once through `PMREMGenerator` and used as `scene.environment`. Its
  strength follows the weather. The hemisphere light keeps only the weather's tint.
* **Shadows**: three.js 0.186 removed `PCFSoftShadowMap`. PCF with a radius (3 on high, 2 on medium) gives the soft edge.
* **Counters**: `renderer.info.autoReset = false` and a reset once per frame, so draw calls and triangles cover every pass.
* **Switches**: `?post=0` turns the chain off (for comparisons), and `window.__beRenderer.setPost({...})` toggles its parts when
  `?debug=1` is set.
* **Edges**: the chain smooths edges itself with FXAA. The canvas therefore asks for multisampling only where the chain cannot run (no
  half-float buffer, or `?post=0`). Under the chain, a multisampled canvas only ever receives a full-screen quad, so it adds memory and a
  resolve and smooths nothing. It also skewed the first measurement of the chain's cost (see the quality report).
* **Evidence**: before/after frames from the same seed and camera; the full 3D browser suite; the boot test's draw-call and triangle
  floors; the hosting check under the production CSP.

### WC-2. Art pass (the standard's palette and density)

* Ground: muted sage-olive meadows, earth yards round homes, worn paths to doors, dry gold patches. These are painted in
  `groundTexture.ts`.
* Forests: denser mixed stands with pines, round broadleaves, tall cypresses, birches, and scattered (never blocked) autumn trees.
  These are in `trees.ts` and `foliage.ts`.
* Houses: windows on more than one side, varied roof colours (terracotta, brick, teal, slate, thatch, umber), and outbuildings and
  props (sheds, woodpiles, carts, fences, washing lines). These are in `buildings.ts` and `landmarks.ts`.
* **Evidence**: a Day-1 overview, a close-up of a house and a forest edge, each compared with the standard's quality bar and
  anti-patterns.

### WC-3. Phones and screens

* Viewports: 390×844, 393×852, 360×740, 844×390 (landscape), 1920×1080, 1440×900 and 1366×768.
* At each one: no horizontal overflow, primary controls at least 44×44 CSS px where the layout allows, safe-area insets respected, and
  the world taking most of the screen at rest.
* **Evidence**: a browser test that walks the viewports and asserts these, plus a captured frame per viewport, inspected.

### WC-4. Performance

* `scripts/perf-3d.ts` records the following with the chain on:
  * median frame time and frames per second;
  * the 1% low;
  * draw calls and triangles per frame;
  * JS heap;
  * time to the first drawn frame.

  It also reports the cost of the chain itself (on against off).
* The tier monitor and render scale (an adaptive pixel ratio) stay in charge. The chain steps down with the tier: no bloom on medium,
  no AO or FXAA on low.
* **Honesty rule**: this container has no GPU (SwiftShader). The figures are measured on that and labelled as such. Nothing here
  claims a real phone's or a real GPU's frame rate.

### WC-5. Iterate on what the frames show

* At least three rounds of capture, inspection, scoring against the rubric below, fixing the worst defects and recapturing.
* Motion is reviewed with `scripts/capture-motion.ts`, which measures frame-to-frame change by region from the real animation clock.

## Rubric (scored 1 to 5 in `docs/3D_QUALITY_REPORT.md`)

* Art direction
* Geometry and materials
* Lighting and depth
* Environmental richness
* Animation and life
* Interaction feedback
* Camera
* Mobile
* Performance

A score is given only for a frame or a measurement that was actually looked at. Where something could not be checked here (a real
iPhone, a real GPU), the report says **UNVERIFIED** rather than guessing.

## Risks and how they are handled

| Risk | Handling |
|---|---|
| The chain costs too much on weak devices | Tiers drop AO, bloom and FXAA, and render scale falls before quality does. The chain can be turned off without code changes. |
| Some browsers cannot render to a half-float buffer | `PostChain.supported()` checks for the extensions. Without them the world draws directly, exactly as before the chain. |
| The alpha codes break when code elsewhere changes a material's blending | The chain re-applies its blend settings every frame for transparent materials. Opaque materials are patched once, before their first compile. |
| Visual changes break picking or tests | Picking uses scene geometry and is untouched by post-processing. The full 3D suite runs before every push. |
| The engine is changed by accident | Renderer work never imports engine internals for writing. The `git diff` check above is part of the final review. |
