# Phase 01 — Audit source, preserve gameplay and plan renderer migration

## Source audit

Inspect local git status, branches, remotes, assets and deployed app source if accessible. GitHub main only held prompts at authoring time. Find screenshot's implementation before claiming preservation. Identify package manager, entry point, renderer/Phaser/Pixi/DOM structure, canonical game engine, reducer, state event log, scenarios, world map, belief actions, save schema, MCP server and any tests.

Categorize each affected module: KEEP (engine, content, MCP), ADAPT (state subscriptions, tile to 3D coordinate, world selectors, click actions), REPLACE (flat tile drawing, sprites, screen-wide overlays), TEMPORARILY FALLBACK (old renderer for A/B), RETIRE (obsolete graphic utilities after acceptance). Document this table with exact file paths from real code, not invented paths.

Protect baseline: branch/backup without discarding user changes; record seeded victory/loss traces, tests, actual screenshots from default seed/day, and save samples. Set feature flag 2D/3D during transition and capture equivalent scenes for comparison.

## Required adapter

Design a read-only SceneSnapshot derived from authoritative state with version/revision, terrain elevation/biome, water cells and flow, road geometry, landmarks with tile position and health, villagers with origin/destination/status, law active/intensity/radius, hazards and queued visual events. Renderer projects world x/z from existing tile x/y and height y from terrain or water, preserving stable entity IDs.

Core functions:
- getSceneSnapshot(runState): scene data only.
- getSceneChanges(previous, next): stable diff and event-ids.
- getEntityAtRaycastHit(hit): engine entityId, never arbitrary gameplay mutation.
- dispatchPlayerAction(intent): same validated reducer/API used by old UI and MCP.
- camera/game animation clocks separate from simulation day.
- serialize/deserialise remains engine responsibility.

Large maps may require view projections with typed arrays/memoization rather than allocating new meshes on every reducer update. Move geometry/physics computation into actual engine if it affects outcomes; render-only aesthetic details may be nondeterministic.

## Test and acceptance

- Document true application location and what was found/unavailable.
- Existing game runs before migration; 2 saved states load.
- Same seed/actions produce same canonical state before and after renderer swap.
- Baseline screenshot at fixed camera, if browser-accessible.
- New route or feature flag boots without deleting old game path.
- No rewrite of social graph, claims, physics, scores, MCP to make graphics easier.
- If source absent, mark migration blocked and bootstrap properly with honest distinctions. Commit audit evidence.