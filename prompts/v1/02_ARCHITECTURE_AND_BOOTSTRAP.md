> **SUPERSEDED VISUAL ARCHITECTURE:** Keep a pure deterministic TypeScript game engine and React app shell, but implement the authoritative primary viewport in Three.js / React Three Fiber, not Phaser. 3D camera, assets, terrain, water, selection and lighting must meet [the current 3D master](3d-rebuild/00_MASTER_3D_REBUILD.md). Other core interface/testing requirements remain valid.

# Phase 02 — Create a working browser game scaffold and testable engine boundary

**Goal:** create a real running browser application in this repository, not a static mockup. Read 00, 01 and existing docs. Prefer implementation over further debate.

## Repository bootstrapping

Use current mutually compatible stable Node LTS, React, TypeScript strict, Vite and Phaser (or technically defensible equivalent). Read official documentation before choosing dependency versions. Add scripts:
- npm run dev, build, preview, typecheck, lint, test, test:watch, test:e2e, test:sim (or documented equivalents).
- Playwright config (desktop + mobile), Vitest config, ESLint, formatting, .gitignore, optional CI workflow for typecheck/unit/build.
- Root README with setup/run/test/deploy and controls.
- Documentation placeholders with honest statuses, not "all done."
- Fail clearly for unsupported browser or corrupt saves, never an unhandled crash.

## Architecture (enforce these module seams)

src/engine/core/ — pure TS state, turn reducer, PRNG, typed events, selectors.
src/engine/social/ — social graph, memory, persuasion, propagation.
src/engine/laws/ — law registry, activation, conflicts, physical rule hooks.
src/engine/world/ — tile map, weather, resource/threat effects, villagers in places.
src/engine/content/ — schemas and validated scenario/card definitions.
src/engine/ai/ — optional NPC planners, bot strategy interface.
src/engine/save/ — versioned serialization, migration, validation.
src/render/ — Phaser scenes, sprite layering, map camera, effect visualization.
src/ui/ — React screens, HUD, action planner, cards, menus, accessibility.
src/audio/ — lazy-loaded soundscape and sound settings.
src/analytics/ — local dev-only events/reports; no tracking by default.
tests/ — unit, property/integration, E2E, seed replay, simulation tournaments.

If the repo is already structured, preserve existing conventions while retaining clean architecture. Graphics must NEVER mutate canonical RunState. State changes only via explicit typed actions and pure reducers / documented mutators with deterministic tests.

## Critical interfaces

Implement a minimal tested API:
- createRun({scenarioId, seed, difficulty}) => RunState
- getAvailableActions(state, selection) => feasibility/cost/previews
- planAction(state, action) => state or structured error
- resolveDay(state) => {state, events, summary}
- getWorldView(state), getSocialView(state), getLawView(state) => UI projection
- serializeRun / deserializeRun (version tagged)
- replayRun(seed, orderedActions) => same hash and event stream

Use fixed seed, deterministic PRNG; seed=0 MUST be valid. Do not call Math.random(), Date.now() or network in the authoritative simulator. Make replay hashing canonical and stable independent of object insertion order when feasible. Record content/schema version for replay compatibility. Cap events per tick and graph iterations for stability.

## UI shell that genuinely starts

Design a polished but lean introductory shell:
- Title art/motion with obvious "Play" call to action.
- Main menu: New Game / Continue (if save) / How to Play / Settings / Credits.
- World screen with placeholder tiles (not empty canvas), side panel and visible clock.
- Basic camera pan/zoom, hover/focus/selection; fit appropriately on mobile.
- Run detail with threat progress, day, remaining AP, available claims.
- At least one interaction that actually goes through typed reducer and changes state/event log.
- Placeholder environmental hazard may be simple; state that entire scenario is NOT yet complete in progress log.

## Rendering and responsiveness

Use a 2D isometric-ish or 3/4 orthographic tile style with layered landmarks, readable agent silhouettes and satisfying movement (not a sterile network graph as main game view). Prefer orthographic for reliable hit testing if isometric introduces undue complexity. React overlay presents social graph and cards in accessible DOM; Phaser visualizes map and characters. Single Phaser instance, destroy on unmount, no duplicate animation loops. Responsive mobile view should use collapsible panels, not shrink full desktop board to unreadable scale.

## Testing and operational quality

Implement unit tests for initial state validity, deterministic seed output, legal vs illegal action, AP never negative, replay serialization. Build and run actual local server when environment permits. Test a clicked interaction in Playwright if possible. No any types in central domain state without explicit rationale. Add error boundary, empty state, loading state and error handling.

Add developer-only debug panel enabled by documented local flag, exposing seed, run state, event log, view overlays, and deterministic next-step controls. Debug features must not accidentally leak into competitive scoring.

## Acceptance

- npm install or npm ci works on fresh checkout.
- typecheck, lint, unit tests and production build pass; any unavailable validation explicitly recorded with reason.
- A user can launch game, press Play, see actual world and perform an action that has a deterministic logged effect.
- A saved state roundtrips; seed replay is identical in at least one test.
- Layout is structurally mobile-capable.
- Commit a reproducible bootstrap state before proceeding.