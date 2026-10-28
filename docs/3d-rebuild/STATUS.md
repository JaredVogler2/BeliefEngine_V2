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
| Unit tests (356 when this audit was written; 364 now) incl. `rng-hash`, `redbank`, `scenarios`, `mcp-*`, `nl-*` | `tests/unit/**` |
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

## 3D-02 to 3D-10: what was built, and the checks each rests on

The code is in `src/render3d/**` (about 8,000 lines, one lazy chunk), behind the `WorldRenderer` interface in `src/render/types.ts`. Nothing
below changes a rule: the renderer reads a copy of the run (`SceneSnapshot`) and the engine never reads the renderer.

| Phase | What exists | Checks |
|---|---|---|
| 02 Renderer, camera, lighting | Three.js 0.186.1 on WebGL2 (`World3D.ts`); a tabletop camera that pans, zooms to the cursor, orbits within limits (azimuth ±75°, elevation 24–66°), pinches, resets and focuses a person or place, eased on its own clock (`camera.ts`); a warm low key light with a soft shadow map, a sky fill, tone mapping, distance haze, a screen-space sky with drifting clouds; weather moods chosen from the engine's forecast and flood level (`atmosphere.ts`) | `world3d.spec.ts` boots, draws and picks on two projects; frames A, B, D in `VISUAL_QA.md` |
| 03 Terrain, water, weather | The height field is the engine's elevation times one constant, rounded off, with the river channel cut, building plots levelled, a layered plate edge; a ground texture painted from the tile map with paths worn to doors (`terrain.ts`, `groundTexture.ts`); a river and flood surface whose height at every tile is the engine's depth (`water.ts`); rain, wind, wet ground | `render3d-scene.test.ts`: heights tile for tile, surface at the engine's depth on every wet tile, no water on any dry tile, a calm village wet only in the river; frames D, E2, M |
| 04 Architecture and vegetation | Five cottage variants plus cabin, granary, hall, chapel, ruin; bell tower, mill with a turning wheel, market, shelter, well, pen, campfire, beacon; an arched stone bridge built from the engine's own footprint; seven tree kinds, shrubs, tufts, flowers, reeds, crops that ripen with the engine's growth, fences. All procedural, instanced or merged per material | frames A, B, F; `ASSET_LICENSES.md` (no files, nothing to license) |
| 05 Villagers | One hand-built figure per villager, costume from role and faction and the engine's `look`, held props, animated walk, work, rest, watch, shelter; routes follow the engine's passable tiles; standing on the bridge deck when on it; gestures for events | frames B, C; crowd and tap tests |
| 06 Belief magic | Pure planners turn logged events and the engine's law geometry into effects (`plan.ts`); shader-painted law ground (rune wheels, rings, drops), reach discs the size of the engine's flood shield, ripples on the river, ribbons only along real ties, social lens, forecast stripes and contours (`magic.ts`, `effects.ts`, `glyphs.ts`) | `render3d-plan.test.ts` (six parity fixtures) and "every effect the world starts names an event the engine logged"; frames C, E, E2, F, K, M |
| 07 Immersive HUD | A compact rail of views, a story tray, a card anchored to the selection, a side sheet (bottom sheet on a phone) for detail, camera insets so nothing sits under a panel, an end-of-run scene of the real final world (`Hud.tsx`, `Play.tsx`, `MapView.tsx`, `Aftermath.tsx`) | the world keeps at least 75% of a desktop screen and 60% of a phone's at rest (test, on the 3D projects); axe passes on the desktop and phone projects including 320×568 (those run on the classic map, which sits under the very same interface DOM; axe was **not** run against a page with the 3D canvas live); frames A2, C, G, H, I, K, L |
| 08 Asset pipeline and optimisation | No asset files by design; every texture painted at load from a seed, every mesh built by code; instancing, per-material merging, static batching of landmarks; three quality tiers with a run-time monitor and software-GL detection; lazy 3D chunk; disposal on every rebuild | `PERFORMANCE.md`; bundle budget in CI (`npm run size`); leak test |
| 09 Visual QA and regression | 16 real frames, a scorecard, ranked defects, a functional regression table | `VISUAL_QA.md`; `world3d.spec.ts` on `desktop-3d` and `phone-3d`; the classic specs on `desktop` and `phone` |
| 10 Art-director review and release | Defects fixed and frames recaptured; honest per-phase verdicts | `FINAL_REVIEW.md` |

## Phase table

Statuses are PASS / PARTIAL / FAIL / UNVERIFIED, re-checked in `FINAL_REVIEW.md`. "PARTIAL" names what is missing in the row. The later
world-class visual pass (finishing chain, art pass, phones and screens) is recorded in `docs/3D_QUALITY_REPORT.md`, against the art direction in
`docs/3D_VISUAL_STANDARD.md` and the plan in `docs/3D_IMPLEMENTATION_PLAN.md`.

| Phase | Status | Evidence / what is outstanding |
|---|---|---|
| 3D-01 Source audit and migration | PASS | This document. |
| 3D-02 Renderer, camera, lighting | PASS | Controls, picking and lighting work and are tested on software WebGL. **UNVERIFIED:** feel and shadow quality on a real GPU. |
| 3D-03 Terrain, water, weather | PASS | Engine-derived heights and depths asserted tile for tile; floods cover exactly the engine's flooded tiles. Water has no refraction or reflection. |
| 3D-04 Architecture and environment | PASS | Detailed procedural kit; flaws listed in `VISUAL_QA.md` (plain plaster, repeated variants). No hand-modelled assets and no glTF pipeline (see below). |
| 3D-05 Villagers and life | PARTIAL | 14 recognisable, animated, pickable people on the engine's tiles. They are simple, blocky figures, drawn up to a third larger at the overview so they stay legible. Motion was measured frame to frame (`docs/3D_QUALITY_REPORT.md`) but not watched as video. No level-of-detail rig (not needed at 14 people). |
| 3D-06 Belief magic and feedback | PASS | Parity fixtures and the event-named-effect test; frames E, E2, F, F2. Effects are legible, not yet lavish. |
| 3D-07 Immersive HUD and controls | PASS | Desktop and phone layouts tested with real pointer events on the 3D projects; keyboard flow and axe on the classic-map projects (same interface DOM). **UNVERIFIED:** a real phone, a real screen reader. A selected house now says what tonight's water does at its door and draws the way to the nearest shelter (`world3d.spec.ts`). |
| 3D-08 Asset pipeline and optimisation | PARTIAL | Budgets met and measured on software GL; **UNVERIFIED** on any GPU or phone. The playbook's glTF/Blender path was not used: procedural by choice (`ASSET_LICENSES.md`). While the chunk arrives and the village is built, the stage shows a small sky with a floating island and a progress bar. |
| 3D-09 Visual QA and gameplay regression | PASS | 16 real frames reviewed, 9 defects fixed, regression tables green (see `FINAL_REVIEW.md` for the exact runs). Automated pixel-diff baselines were not built; frames are reviewed by eye and by structural tests, as the phase allows. |
| 3D-10 Final art direction and release | PARTIAL | Reviewed, repaired, recaptured. Scorecard has three areas at 3 of 5, so **premium is not claimed**. Nothing is deployed: there is no live URL and no Vercel deployment was made. |
