# BELIEF ENGINE V2 — Generative Reality

**Tell the village anything. Convince them. Watch reality respond.**

The LLM-enabled successor to [BeliefEngine V1](https://github.com/JaredVogler2/BeliefEngine): a browser strategy game where you change
what a village believes, and enough shared belief becomes physical law.

## Status, honestly

- **Phases 01-02 are done: V2 is the working V1 game.** V1's engine, three story chapters, procedural expeditions, saves and replays,
  the Three.js world with its 2D fallback, the local MCP server and the offline belief composer were imported with their full history
  from V1 `main@6a92862` and verified here: 364 unit tests (V1's 356 + an 8-test migration tripwire), the V1 browser suite, golden
  replay hashes identical to V1, the MCP acceptance journey 28/28. Results: [`docs/BASELINE.md`](docs/BASELINE.md).
- **The 3D world is now tested in a browser.** V1's browser tests always ran on the 2D map (headless browsers have no GPU);
  `tests/e2e/v2-world3d.spec.ts` forces the Three.js world and checks WebGL2, painting, picking by engine id and identical hashes.
- **No generative feature exists yet.** Every V2 capability is switched off in `src/v2/features.ts`; the game needs no model, key or
  network after load. No language model has been called by this repository.
- Not deployed (no live URL). No human has played V2. Never run on a real GPU, a real phone or real Safari.
- The art direction for V2's 3D world is set ([`docs/3D_VISUAL_STANDARD.md`](docs/3D_VISUAL_STANDARD.md), a lantern-lit valley at
  dusk) and today's world is measured against it ([`docs/3D_QUALITY_REPORT.md`](docs/3D_QUALITY_REPORT.md)); the work to reach it is
  planned, not done ([`docs/3D_IMPLEMENTATION_PLAN.md`](docs/3D_IMPLEMENTATION_PLAN.md)).

Where to pick up: [`docs/CONTINUE_HERE.md`](docs/CONTINUE_HERE.md). What every document is: [`docs/README.md`](docs/README.md).

## Play it

```bash
npm ci
npm run dev                          # http://127.0.0.1:5173
npm run build && npm run preview     # production build on http://127.0.0.1:4173
```

Node ≥ 22.12. Add `?renderer=3d` to force the Three.js world on a machine without graphics acceleration (it picks the 2D map there),
or `?renderer=2d` for the classic map. The V1 player guide (controls, a three-minute first game, every mode) is
[`docs/v1/README.md`](docs/v1/README.md) and still applies.

## Develop and test

| Command | What it does |
|---|---|
| `npm run typecheck` / `npm run lint` | strict TypeScript; ESLint (the engine forbids `Math.random` and `Date.now`) |
| `npm test` | Vitest: engine, chapters, generator, composer, MCP over real stdio, source guards, and the V2 migration tripwire |
| `npm run test:e2e` | Playwright on the production build: V1's specs (2D map) and `v2-world3d.spec.ts` (the Three.js world) on desktop and phone |
| `BE_SLOW_3D=1 npx playwright test tests/e2e/v2-world3d.spec.ts --project=desktop` | also replays two days of a recorded route by clicks in 3D (slow on a software rasteriser) |
| `npm run test:e2e:browsers` | smoke tests in Chromium, Firefox, WebKit and an iPhone 14 profile |
| `npm run test:sim:smoke` | 256 bot runs: balance, determinism, exploit search |
| `npm run replay:example` | rebuild a recorded victory from nothing and compare its hashes |
| `npm run mcp` / `npm run mcp:demo` / `npm run acceptance:mcp` | the local MCP server / a scripted agent plays a chapter / Journey B, 28 checks |
| `npx tsx scripts/capture-3d.ts --url http://127.0.0.1:4173 --size 1440x900 --day 1 --out shot.png` | photograph the real 3D world |

## How V2 will be built

Phases 03-17 in [`prompts/README.md`](prompts/README.md), one verified increment at a time
([`prompts/AGENT_RUNBOOK.md`](prompts/AGENT_RUNBOOK.md)). The shape and the contracts every phase keeps:
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). The audit of what V1 can and cannot do: [`docs/V1_AUDIT.md`](docs/V1_AUDIT.md).

Implementation principles:

- V1 has actual code and tests; migrate, do not rewrite blindly.
- Natural language can be widely understood, but arbitrary executable physics is NOT possible unless simulated primitives exist; explain unsupported semantics and ask clarification.
- Never execute LLM-generated JavaScript, shaders or WASM in normal public gameplay.
- LLM decisions are structured proposals; deterministic game rules remain authoritative.
- Captured validated LLM decisions make replays reproducible without re-calling a model.
- Provider keys belong in server environment or Vercel OIDC, never prompts, frontend bundles or git.
- Vercel AI Gateway and individual model APIs are metered. Default offline mode free of inference costs.
- The existing V1 3D renderer uses raw Three.js, not React Three Fiber; reuse it until there is a demonstrated reason to replace.
- Creative sandbox has separate unranked outcomes; standard scenarios remain balanced.

<details><summary>Original Claude Code kickoff for the whole program</summary>

~~~text
/goal Read prompts/README.md, prompts/00_MASTER_GOAL.md and prompts/AGENT_RUNBOOK.md. Build BELIEF ENGINE V2: Generative Reality, migrating the actual V1 source into this repo without modifying V1. Preserve the deterministic gameplay, scenarios, replay, MCP, and Three.js world. Implement live opt-in LLM-powered belief interpretation, genuinely reasoning villagers with persistent memory, an extensive validated compositional rules DSL, and actual social-to-physical 3D effects. Default classic gameplay must work without any model key. Build secure Vercel-hosted inference with strict quotas/budgets and private server credentials. Commit small verified phases, capture actual browser evidence, run real provider smoke tests only after private configuration, and never claim mocked LLM behavior is live. Deliver playable desktop and iPhone browser experiences, meaningful win/loss/replay, and a rigorous adversarial review.
~~~

</details>

## Licence

MIT ([`LICENSE`](LICENSE), carried from V1). No third-party art, music or fonts ([`docs/ASSETS.md`](docs/ASSETS.md)); runtime
dependencies are `react`, `react-dom` and `three` (MIT).
