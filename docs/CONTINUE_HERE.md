# Continue here

Read this first after any context reset, then [`../prompts/AGENT_RUNBOOK.md`](../prompts/AGENT_RUNBOOK.md) and
[`PROGRESS.md`](PROGRESS.md).

## Phase and status

- **01 V1 audit: VERIFIED. 02 Migration and baseline: VERIFIED.** V2 is the working V1 game (engine, chapters, expeditions, saves,
  replays, Three.js world + 2D fallback, MCP, offline belief composer), imported with history from V1 `main@6a92862`, with golden
  values pinned by `tests/unit/v2-migration.test.ts` and the 3D world under browser test in `tests/e2e/v2-world3d.spec.ts`.
- **03 Provider, auth and budgets: NOT STARTED. It is the next task (below).** No LLM work has begun; every switch in
  `src/v2/features.ts` is `false`.

## Last good commit / branch

Branch `claude/gracious-heisenberg-x6dvn1` of `JaredVogler2/BeliefEngine_V2`. Commits: `a5c1c8a` (V1 import, merge of `6a92862`),
`cc0389c` (identity and licences), then the commit that adds the V2 tests and these records (see `git log`).

## Working files changed in phases 01-02

`src/v2/features.ts`, `tests/unit/v2-migration.test.ts`, `tests/e2e/v2-world3d.spec.ts`; identity in `package.json`,
`package-lock.json`, `index.html`, `src/main.tsx`, `src/ui/screens.tsx`, `src/styles.css`; `docs/ASSETS.md` and the two licence
inventories; the V2 records in `docs/` (see [`README.md`](README.md)); `README.md`.

## Commands run and exact results

In [`BASELINE.md`](BASELINE.md): typecheck, lint, 364/364 unit, build, size, sim smoke 256/256 (identical to V1), both replay examples
identical, MCP demo identical, Journey B 28/28, NL demo identical, the Playwright suite, and the 3D spec including the slow two-day
trace in 3D.

## Mock vs LIVE model tests

No model has ever been called from V2. V1's mocked-provider tests pass: **TESTED MOCK ONLY**. LIVE: **UNVERIFIED**.

## Screenshots and browser/device

[`screenshots/v2-baseline/`](screenshots/v2-baseline/): the production build in headless Chromium 1243 on SwiftShader (no GPU), the
Three.js canvas at seven viewports plus the 2D map; scored in [`3D_QUALITY_REPORT.md`](3D_QUALITY_REPORT.md). No real GPU, phone or
Safari.

## Known blockers and risks

1. **V1's pull request [JaredVogler2/BeliefEngine#2](https://github.com/JaredVogler2/BeliefEngine/pull/2) is not in V2** (3D part 2:
   HUD, aftermath scene, art-director pass, 3D test projects). It was open and changing when V2 was cut. Merge it before touching
   `src/render3d/` or `src/ui/play/` (instructions below). Phase 03 does not touch those directories, so it is not blocked.
2. **3D tests are slow on a software rasteriser** (≈3 fps; each click waits for a stable frame). CI runners are about twice as slow as
   this container. Keep new 3D browser tests short; long 3D traces go behind `BE_SLOW_3D=1`.
3. **WebKit has not drawn the 3D world in V2** (it only runs V1's smoke on CI). That V1 pull request reports that WebKit 26.6 does draw
   it.
4. V1 defects D7 (Settings restart drops the mode), D8 (archive drops the Inventor mark) and D9 (MCP idempotency key not bound to the
   request) are user- or agent-facing and small; fix each with a regression test when convenient ([`V1_AUDIT.md`](V1_AUDIT.md) §12).

## Next exact code changes (phase 03, first increment)

Goal: a server-side inference seam that is safe with **no** credentials, before any model is called.

1. **Verify current APIs before writing code**: the installed or latest Vercel AI SDK major and its structured-output API (phase 03
   names `generateText` + `Output.object` for AI SDK v6; confirm in https://ai-sdk.dev/docs), Vercel AI Gateway authentication and OIDC
   (https://vercel.com/docs/ai-gateway/authentication-and-byok), and current model ids from the gateway catalog. Record versions in
   `docs/AI_SETUP.md`.
2. **`server/ai/` core, transport-free and unit-tested** (like `mcp/service.ts`): config loader that reads only server env names
   (`AI_GATEWAY_API_KEY` locally, OIDC on Vercel; model ids; app origin; daily spend cap) and reports `not_configured` without them; a
   limiter interface with an in-memory test double and a durable adapter (Redis/Upstash/Vercel-compatible) that **fails closed** when
   the store is unreachable; token/latency/cost metering that never logs raw player text.
3. **`api/ai-status.ts`** (Vercel function) returning only capability, tier and budget-available booleans, plus `env.example` with
   variable **names** only. Tests: missing key → `not_configured`; secrets never in responses, logs or the client bundle (extend
   `tests/unit/no-unsafe-code.test.ts`); classic mode makes zero requests (`serverInference` stays `false`). Check that
   `vercel.json`'s catch-all rewrite to `index.html` leaves `/api/*` to the functions (audit hole H12).

Then `/api/interpret-belief` with schema-validated output and mock-provider tests (valid, malformed, timeout, outage, quota boundary,
100 concurrent requests, injection), still with `serverInference` off by default.

## Parallel track: the 3D world

[`3D_IMPLEMENTATION_PLAN.md`](3D_IMPLEMENTATION_PLAN.md): stage 0 (merge V1's 3D pull request, below), then stage 1 (draw packs,
fire, smoke, forecast, lens and labels in 3D), then stage 2 (time of day: the core of the lantern-lit look). Independent of phase 03.

## What MUST NOT be rewritten

`src/engine/**` and `tests/fixtures/**` (any change that moves a golden hash is a rules change: bump `RULES_VERSION`, re-record,
update the tripwire, say why); `GameSession` as the only mutation path; the `WorldRenderer` observer contract; save, archive, catalog
and MCP run formats, the MCP server name and resources, `localStorage` keys; the offline composer as the Classic reader and fallback.

## Merging V1's 3D part-2 pull request (JaredVogler2/BeliefEngine#2) when it lands

```bash
git fetch https://github.com/JaredVogler2/BeliefEngine main    # after JaredVogler2/BeliefEngine#2 is merged there
git merge FETCH_HEAD                                           # common ancestor 6a92862: ordinary history
```

A trial merge of JaredVogler2/BeliefEngine#2's head (`37ed18a`) into this branch, made in a scratch copy, conflicted in exactly four files; everything else
(including `package.json`, `src/ui/screens.tsx` and `src/styles.css`) merged cleanly:

| File | Resolution |
|---|---|
| `README.md` | keep V2's; carry V1's edits into `docs/v1/README.md` |
| `docs/PROGRESS.md` | keep V2's; carry V1's new entries into `docs/v1/PROGRESS.md` |
| `docs/3D_VISUAL_STANDARD.md` (both added) | keep V2's; save V1's as `docs/v1/3D_VISUAL_STANDARD.md` |
| `docs/ASSETS.md` | take V1's new rows, keep the three.js runtime line |

Then regenerate the licence inventories (`npx tsx scripts/licenses.ts [--prod] --write`), run the unit suite (the tripwire must not
move: JaredVogler2/BeliefEngine#2 touches no engine file), both 3D browser suites, the 2D suite, and recapture the visual matrix.

## Private configuration needed (names only, never values)

None for the baseline. For phase 03 LIVE smoke tests, the owner sets privately: `AI_GATEWAY_API_KEY` in an untracked `.env.local`
(local) or Vercel OIDC (deployed), the durable limiter's connection variables, and a project spend cap in the Vercel dashboard. Never
paste a key into a prompt, an issue, a commit or a `VITE_` variable.

## Current daily inference budget / usage

No budget configured. Usage: 0 calls, 0 tokens, $0.
