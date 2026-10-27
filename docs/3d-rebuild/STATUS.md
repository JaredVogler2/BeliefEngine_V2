# 3D rebuild — status

This is the working record of the move from the flat Canvas2D map to an interactive 3D world (the `prompts/3d-rebuild/` phases).
It is updated as each phase is verified. Every claim below names the command, test or screenshot it rests on; anything that could not
be checked is marked **UNVERIFIED** with the manual steps, and anything that failed is marked **FAIL**.

*Last updated: see the git log of this file. The phase table at the bottom is the source of truth.*

## 3D-01 — Source audit and migration plan

### Where the real application is

- Repository: `https://github.com/JaredVogler2/BeliefEngine`, branch `claude/gracious-gates-95kmda` (pull request #1). The working copy is `/home/user/BeliefEngine`.
- The application source **is** in the repository (it is not "prompts only"): Vite 8 + React 19 + TypeScript 6 (strict), package manager npm, entry `index.html` → `src/main.tsx` → `src/App.tsx`.
- No Phaser / Pixi / R3F was ever used. The map was a hand-written **Canvas2D** renderer (`src/render/MapRenderer.ts`, 1,400 lines) with procedural sprites (`src/render/sprites.ts`).
- The deterministic engine (`src/engine/**`) is headless: pure functions over a JSON `RunState`, a stateless hash RNG, a replay checker, a versioned save format, and one `GameSession` controller that the UI, the bots and the MCP server all use (`src/engine/core/session.ts`).
- Nothing was deployed by this work; no live URL exists.

### Baseline that was protected before the renderer changed

| What | Where |
|---|---|
| Engine, content, saves, MCP, NL composer: untouched by the 3D work (`git diff main -- src/engine mcp server` shows only the earlier phases) | `src/engine/**`, `mcp/**`, `server/**` |
| Seeded winning and losing traces (state hash + event hash) used by the replay tests | `tests/fixtures/*-traces.json` |
| Unit tests (356 at the time of writing) incl. `rng-hash`, `redbank`, `scenarios`, `mcp-*`, `nl-*` | `tests/unit/**` |
| Browser journeys with real clicks on both renderers' DOM (desktop 1366×768, Pixel 7 390×844) | `tests/e2e/**` |
| Screenshots of the old flat map at the default seed (calm day 1, flood night, law active; desktop and phone) | `docs/3d-rebuild/screenshots/baseline-2d/` |
| Saved states: the e2e `persistence` and `resilience` specs save and reload mid-day runs; `scripts/capture-3d.ts` loads bot-played states through `window.__belief.load` | `tests/e2e/persistence.spec.ts`, `tests/e2e/resilience.spec.ts` |

The 2D renderer was **kept**, not deleted: it is the fallback (no WebGL2, no graphics acceleration, or the player's choice) and the A/B
comparison. A 2D/3D toggle is in the map tools and `?renderer=2d|3d` overrides (`src/render/choose.ts`).

### Module audit (exact paths)

| Module | Verdict | Notes |
|---|---|---|
| `src/engine/**` (core, social, laws, world, gen, ai, nl, progress, save) | **KEEP** | No rule, score, social-graph or save change was made to suit graphics. `RULES_VERSION` stays 1.0.0 (hashes depend on it). |
| `mcp/**`, `server/**` | **KEEP** | MCP server, run verifier, NL interpreter proxy. Same `GameSession` API as the UI. |
| `src/ui/store.ts`, `src/ui/persist.ts`, `src/ui/progress.ts`, `src/ui/modes.ts` | **KEEP** | Store, autosave, progression. |
| `src/ui/play/MapView.tsx` | **ADAPT** | Chooses the renderer, forwards state/options/events through the common `WorldRenderer` interface, owns pointer/keyboard handling for both. |
| `src/ui/play/Panels.tsx` (`getRenderer()?.focusVillager/focusTile`) | **ADAPT** | Calls the interface, not a class. |
| `src/ui/screens.tsx` (title backdrop uses `MapRenderer` directly) | **KEEP** | The title screen stays on the light 2D backdrop (no WebGL cost before the player chooses to play). |
| `src/render/types.ts` (`WorldRenderer`) | **NEW** | The contract both renderers implement. |
| `src/render/choose.ts` | **NEW** | Feature flag: URL, saved choice, WebGL2 and software-GL detection. |
| `src/render/MapRenderer.ts`, `src/render/sprites.ts`, `src/render/palette.ts` | **TEMPORARILY FALLBACK** | Flat tile drawing, sprite houses, screen-space overlays. Kept as the fallback renderer and the A/B baseline. **RETIRE** is deferred until the 3D world has been played by people on real devices, which has not happened (see Known issues). |
| `src/render3d/snapshot.ts` | **NEW** | `getSceneSnapshot(runState)` and `getSceneChanges(prev, next)`: the read-only adapter. |
| `src/render3d/coords.ts` | **NEW** | The one place the axes are defined: x = east = tile column, z = south = tile row, y = up; 1 tile = 1 unit; height = engine elevation × 0.28. |
| `src/render3d/World3D.ts` and the other `src/render3d/*.ts` | **NEW** | The Three.js world (see the table below). |

### The adapter, against the phase's list

| Spec | Implementation |
|---|---|
| `getSceneSnapshot(runState)` | `src/render3d/snapshot.ts`: terrain ids, elevation, per-tile water depth, fire/burn/smoke, the engine's own passable mask, landmarks (tile, health, lit, fuel, data), villagers (tile, duty, status, look), laws (status, strength, radius, *what powers them tonight, from the engine's own `triggerSources`*), ties, regions, packs, the threat kind. Typed arrays are copied once per state change, never per frame. |
| `getSceneChanges(prev, next)` | same file: rebuild / terrain / water / fire / changed landmark ids / changed villager ids / laws. Unchanged entities are not touched. |
| `getEntityAtRaycastHit(hit)` | `World3D.hitTest(x, y)` raycasts invisible proxy volumes whose `userData.entity = { kind, id }` and returns `{ kind, id }`: an engine id, never a mutation. |
| `dispatchPlayerAction(intent)` | The renderer never dispatches. `MapView` calls `store.select(...)`; actions go through `store.act(...)` → `GameSession.act` (the same validated API as the old UI and MCP). |
| animation clocks separate from the simulation day | `World3D` keeps its own `time`; `advance(seconds)` steps animation without touching the run. Render randomness is `src/render3d/rand.ts` (seeded from the scenario and seed, never the engine's generator). |
| serialize / deserialize stays the engine's | `serializeRun` / `deserializeRun` are untouched; `window.__belief.load/parse` (debug only) use them. |

### 3D-01 acceptance

| Check | Result |
|---|---|
| Existing game runs before migration | PASS: `docs/TEST_RESULTS.md` records the browser suite green before the 3D work (140 passed, 0 failed, 52 skipped project-specific cases). With the 3D renderer present and software-GL defaulting to the classic map, the same suite was run again on this branch: 138 passed, 2 failed (a toast re-render race I introduced, fixed and re-run green), 52 skipped. |
| Two saved states load | PASS: `tests/e2e/persistence.spec.ts`, `tests/e2e/resilience.spec.ts` ("a save made elsewhere … loads and plays on"). |
| Same seed/actions → same canonical state with either renderer | PASS for the 2D default environment (`redbank.spec.ts`, `scenarios.spec.ts` replay the recorded traces with real clicks and compare `stateHash`/`eventHash`). 3D coverage: see 3D-09. |
| Baseline screenshot at a fixed camera | PASS: `docs/3d-rebuild/screenshots/baseline-2d/`. |
| New route / flag boots without deleting the old path | PASS: `?renderer=3d` / `?renderer=2d`, plus the map-tools toggle. |
| No rewrite of social graph, claims, physics, scores or MCP | PASS: the engine and MCP directories have no changes in this work. |

## Phase table

Statuses are PASS / FAIL / UNVERIFIED. They are re-checked at the end in `FINAL_REVIEW.md`.

| Phase | Status | Evidence / what is outstanding |
|---|---|---|
| 3D-01 Source audit and migration | PASS | This document. |
| 3D-02 Renderer, camera, lighting | in progress | |
| 3D-03 Terrain, water, weather | in progress | |
| 3D-04 Architecture and environment | in progress | |
| 3D-05 Villagers and life | in progress | |
| 3D-06 Belief magic and feedback | in progress | `tests/unit/render3d-plan.test.ts` (six parity fixtures), `scripts/capture-3d.ts --resolve 1` |
| 3D-07 Immersive HUD and controls | not started | |
| 3D-08 Asset pipeline and optimisation | not started | |
| 3D-09 Visual QA and gameplay regression | not started | |
| 3D-10 Final art direction and release | not started | |
