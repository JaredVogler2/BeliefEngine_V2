# BELIEF ENGINE — Premium 3D visual rebuild

**OVERRIDES the previous 2D/Phaser rendering plan.** Execute this program to replace the current blocky map screenshot with an **interactive, richly modeled, smoothly animated 3D fantasy-village diorama**. This requires working game code, not concept art, a static 3D title screen, a fancy shader over flat sprites, or a gallery of beautiful renders.

## Start Claude Code Opus 5.5 Max with:

~~~text
/goal Read prompts/3d-rebuild/00_MASTER_3D_REBUILD.md and execute phases 01–10 in order. This instruction supersedes earlier 2D/Phaser rendering directions. Preserve my actual social simulation, scenarios, saved-game compatibility, game rules and MCP integration. Rebuild the entire visual experience into a premium, interactive, real-time 3D fantasy diorama with modeled terrain, flowing river, detailed buildings, vegetation, individual animated villagers, cinematic sun and shadows, physically visible magical transformations and elegant contextual UI. The 3D world must remain genuinely playable, not be a static scene. First locate and protect the existing code; do not assume the screenshot's code is in GitHub main. Commit each verified milestone and capture actual browser screenshots for visual comparison. Do not stop until all 10 phase gates pass, or report the exact blocked gate and evidence.
~~~

## Repository caveat

When authored, GitHub main held only the previous implementation-prompts folder and a root README, **not the application code depicted in the screenshot**. This may be an unpushed local working tree or a separate deployment source. Before migration inspect locally available source and backups. If absent, honestly document what is missing and rebuild game from existing specs only as a disclosed recreation, never pretend to have modified unavailable source.

## Visual intent: The Living Storybook

A lush miniature medieval fantasy village seen from a flattering three-quarter overhead angle, with sculpted rolling land, moss and wildflowers, curving river with translucent moving water, handsome stone/wood bridge, distinct terracotta-roofed cottages, timber framing and windows, softly detailed trees, gardens, roads, a watchtower, lanterns, tiny animated villagers, flowing rumor-magic filaments, warm sunlight, convincing shadows, slight haze and atmospheric depth.

**Not** photorealism, not blocky Roblox/Minecraft, not a flat illustrated image, not a low-poly tiled prototype, not a sea of repetitive green cubes. Target cohesive crafted stylized 3D with compelling real materials and forms. This should look dramatically more polished than the supplied screenshot even with the HUD hidden.

## Execution order

1. [00_MASTER_3D_REBUILD.md](00_MASTER_3D_REBUILD.md) — non-negotiables and acceptance rules.
2. [01_SOURCE_AUDIT_AND_MIGRATION.md](01_SOURCE_AUDIT_AND_MIGRATION.md) — real-code audit, backups and engine boundary.
3. [02_RENDERER_CAMERA_LIGHTING.md](02_RENDERER_CAMERA_LIGHTING.md) — true Three.js world, composition, cinematic lighting and controls.
4. [03_TERRAIN_WATER_WEATHER.md](03_TERRAIN_WATER_WEATHER.md) — dimensional landscape, animated river, floods and weather.
5. [04_ARCHITECTURE_AND_ENVIRONMENT_ASSETS.md](04_ARCHITECTURE_AND_ENVIRONMENT_ASSETS.md) — detailed original 3D architecture, props and living environment.
6. [05_VILLAGERS_AND_LIFE.md](05_VILLAGERS_AND_LIFE.md) — animated, identifiable 3D characters tied to real activities.
7. [06_BELIEF_MAGIC_AND_FEEDBACK.md](06_BELIEF_MAGIC_AND_FEEDBACK.md) — responsive magical propagation and real physics changes.
8. [07_IMMERSIVE_HUD_AND_CONTROLS.md](07_IMMERSIVE_HUD_AND_CONTROLS.md) — premium legible lightweight UX and touch.
9. [08_ASSET_PIPELINE_AND_OPTIMIZATION.md](08_ASSET_PIPELINE_AND_OPTIMIZATION.md) — asset pipeline, glTF, performance/quality profiles.
10. [09_VISUAL_QA_AND_GAMEPLAY_REGRESSION.md](09_VISUAL_QA_AND_GAMEPLAY_REGRESSION.md) — interactive visual snapshots and full game regression.
11. [10_FINAL_ART_DIRECTION_AND_RELEASE.md](10_FINAL_ART_DIRECTION_AND_RELEASE.md) — adversarial art director pass, release gate.

## Rules

- **Renderer tech**: prefer Three.js + React Three Fiber + Drei on WebGL2. Stable and broadly supported. Experimental WebGPU is optional, not a launch dependency.
- **Engine**: deterministic pure TypeScript simulation remains the source of truth. No physics tied to frame rate. Keep winning strategies, saves and MCP parity.
- **Visual quality**: no single-plane terrain, cubes pretending to be houses, sprites billboarded to fake all dimensional elements, uniform tree poles, noisy oversaturated bloom, or invisible map buried under cards.
- **Proof**: actual browser screenshots from at least three game states, desktop and mobile interaction tests, performance logs, game-rule unit tests, reproducible winning run.
- **Reversible migration**: protect existing version before modifications. Commit coherent phases.
- **Release**: beautiful static screenshot ALONE is insufficient. The world must also be navigable, reactive and playable.

## Final question

With the entire HUD hidden, would a viewer immediately see a beautiful living three-dimensional fantasy settlement and know where the river, buildings, characters and hazards are? If not, the rebuild is incomplete.