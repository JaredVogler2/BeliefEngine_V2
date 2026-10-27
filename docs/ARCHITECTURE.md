# Architecture (V2 baseline)

How the migrated game is put together today, the rules every later phase must keep, and where V2 work plugs in. The detailed code
map with line references is [`V1_AUDIT.md`](V1_AUDIT.md); this page is the shape.

## 1. One authority, many observers

```
           browser UI (React)          MCP client (stdio)        bots / scripts / tests
                 │                            │                           │
           src/ui/store.ts             mcp/service.ts            src/engine/ai/bots, scripts/
                 │                            │                           │
                 └──────────────┬─────────────┴─────────────┬─────────────┘
                                ▼                           ▼
                      GameSession.act(action)        replayRun(options + actions)
                                │
          ┌─────────────────────┴──────────────────────────────────────────────┐
          │ src/engine (pure, deterministic, no I/O, no clock, no Math.random)  │
          │  actions ─► planning-phase state                                   │
          │  END_DAY ─► resolveDay: social step ─► law step ─► computeModifiers │
          │             ─► hazards (flood, fire, crops, wolves, sickness) ─►    │
          │             rivals/factions ─► evaluate ─► dawn                     │
          │  RunState (plain JSON) + event log ─► stateHash / eventHash         │
          └─────────────────────┬──────────────────────────────────────────────┘
                                │ state + events (read-only)
          ┌─────────────────────┴───────────────────┐
          ▼                                         ▼
   WorldRenderer: World3D (Three.js, lazy chunk)    selectors, debrief, night report,
               or MapRenderer (Canvas2D fallback)   forecast, counterfactual search
   answers hitTest with engine ids; never acts      (UI panels, MCP tools)
```

- **`GameSession.act` is the only mutation path** for the browser, MCP, bots and the composer. Invalid actions are refused with a
  typed code and change nothing.
- **Determinism**: every random draw is `rand(seed, domain, ...keys)`; the same options and actions give the same `stateHash` and
  `eventHash` in the browser, over MCP and in a headless replay. Golden traces in `tests/fixtures/` and the V2 tripwire
  (`tests/unit/v2-migration.test.ts`) hold this in place.
- **Renderers observe**: they get a read-only snapshot (`src/render3d/snapshot.ts`) and the event list, plan effects from event ids
  (`src/render3d/plan.ts`), and turn a click into `{kind, id}`; the UI turns that into a selection, never into an action.

## 2. Directory map

| Path | Layer | Notes |
|---|---|---|
| `src/engine/core` | rules kernel | types and versions, actions, night resolution, events, rng, hashing, replay, selectors, debrief, counterfactuals |
| `src/engine/social`, `laws`, `world`, `ai` | simulation | belief diffusion, law pressure and status, bounded physical effects, hazards, villager routines, rivals, factions, bots |
| `src/engine/content`, `gen`, `progress`, `save` | content and meta | 3 chapters, procedural villages and the verified catalog, the Atlas, save format |
| `src/engine/nl` | belief language v1 | offline lexicon reader, `BeliefAST`, balance, stress test, model-reply validator |
| `src/render3d`, `src/render` | presentation | Three.js world and the Canvas2D map behind `WorldRenderer` |
| `src/ui`, `src/audio`, `src/App.tsx`, `src/main.tsx` | shell | React screens, store and persistence, composer, procedural audio |
| `src/v2` | V2 switches | `features.ts`: `serverInference` on since phase 03 (an opt-in offer), the rest off |
| `src/ai` | online-reading client | same-origin `/api` only, session token in memory, no request before the player opts in |
| `mcp/` | agent interface | stdio MCP server over a transport-free game service |
| `server/ai/`, `api/` | inference service | transport-free app (`app.ts`), config, sessions, durable fail-closed quotas, AI SDK 7 provider, metering, task contracts; `api/*.ts` are the Vercel Functions ([`AI_SETUP.md`](AI_SETUP.md)) |
| `scripts/`, `tests/` | tooling | tournaments, capture, acceptance journeys; unit, browser and simulation tests |
| `docs/`, `prompts/` | records and plans | [`docs/README.md`](README.md) says which docs are V2 records |

## 3. Contracts later phases must keep

1. **Classic is V1.** With every switch in `src/v2/features.ts` off, the game, its saves and its hashes are V1's. Changing classic
   behaviour on purpose is a rules change: bump `RULES_VERSION`, re-record fixtures, update the tripwire in the same commit.
2. **No model writes state.** A model can return a structured proposal (an interpretation, a villager intention). Code validates it
   against a schema and the world, then expresses it as ordinary actions or rule specs that `GameSession` applies.
3. **Replays never call a model.** Every accepted model output goes into a versioned decision record (model id, prompt version,
   input digest, validated proposal) that travels with the run, the way a written belief already travels inside its `COMPOSE` action.
4. **Credentials stay on the server.** The browser bundle reads no key; `tests/unit/no-unsafe-code.test.ts` enforces it. CSP
   `connect-src 'self'` means inference endpoints are same-origin functions.
5. **The renderer stays an observer**, and a rule that changes the simulation must also be visible in the 3D world (and must not be
   visible when it did not fire).
6. **Protocol identifiers do not change**: save, archive, catalog and MCP run formats, the MCP server name and resources, storage keys.

## 4. Where V2 work goes

| Phase | New code | Seam to existing code |
|---|---|---|
| 03 provider, auth, budgets | **built**: `server/ai/` + `api/` (`/api/ai-status`, `/api/session`, `/api/interpret-belief`, `/api/npc-decision`, `/api/ai-metrics`), durable limiter, metering ([`AI_SETUP.md`](AI_SETUP.md)) | `src/ai/client.ts` replaced V1's `src/ui/interpreter.ts`; the composer's consent notice; `serverInference` on |
| 04-06 belief language and primitives | `src/engine/rule-language/`: a versioned typed DSL (selectors, triggers, conditions, bounded effects) that compiles V1 `RuleSpec`s unchanged, plus new world primitives in `src/engine/world/` | `laws/effects.ts` `computeModifiers` (today a fixed `switch`), `nl/ast.ts` (today 1-2 clauses of a closed union) |
| 07-09 villager cognition and society | `src/agents/`: salient-event selection, bounded memory with provenance, model-proposed intentions | `ai/routines.ts`, `ai/utility.ts`, `core/memory.ts`; belief change stays in `social/*` |
| 10 3D effects | effect registry keyed by rule plans and event ids in `src/render3d/` | `render3d/plan.ts`, `magic.ts`, `effects.ts`; [`3D_IMPLEMENTATION_PLAN.md`](3D_IMPLEMENTATION_PLAN.md) |
| 13-14 MCP and replay | the same decision records exposed through MCP export/import | `mcp/service.ts` `versions` block, `save/versions.ts` |

## 5. Test layers

| Layer | Command | Covers |
|---|---|---|
| unit | `npm test` | engine, content, generator, composer, MCP over stdio, source guards, V2 tripwire (364 tests) |
| simulation | `npm run test:sim:smoke` | 8 bot policies × 4 families, determinism, exploit search |
| browser | `npm run test:e2e` | V1's 14 specs on the 2D map plus `tests/e2e/v2-world3d.spec.ts`, which forces the Three.js world |
| cross-browser | `npm run test:e2e:browsers` | smoke in Firefox, WebKit and an iPhone 14 profile (CI installs those browsers) |
| hosting | `npm run verify:hosting` | the CSP and headers from `vercel.json` in a real browser |
| replay | `npm run replay:example` | the README example rebuilt from nothing |
