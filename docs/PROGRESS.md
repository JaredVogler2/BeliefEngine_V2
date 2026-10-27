# V2 progress log

One entry per verified checkpoint, newest first. Status words follow [`prompts/AGENT_RUNBOOK.md`](../prompts/AGENT_RUNBOOK.md):
NOT STARTED, IN PROGRESS, IMPLEMENTED UNVERIFIED, VERIFIED, BLOCKED. V1's own build log is [`v1/PROGRESS.md`](v1/PROGRESS.md).

| Phase | Status | Evidence |
|---|---|---|
| 01 V1 audit | **VERIFIED** | [`V1_AUDIT.md`](V1_AUDIT.md); V1 baseline run in a clone ([`BASELINE.md`](BASELINE.md)) |
| 02 Migration and baseline | **VERIFIED** | [`MIGRATION.md`](MIGRATION.md), [`BASELINE.md`](BASELINE.md), `tests/unit/v2-migration.test.ts`, `tests/e2e/v2-world3d.spec.ts` |
| 03 Provider, auth, budgets | **VERIFIED with mocks, a real Redis and an offline `vercel build`; LIVE UNVERIFIED (no credential); NOT DEPLOYED** | [`AI_SETUP.md`](AI_SETUP.md), [`AI_COSTS.md`](AI_COSTS.md), `tests/unit/ai-*.test.ts`, `tests/e2e/v2-online.spec.ts`, [`screenshots/v2-phase03/`](screenshots/v2-phase03/) |
| 04 Generative belief language | NOT STARTED | next: [`CONTINUE_HERE.md`](CONTINUE_HERE.md) |
| 05-17 | NOT STARTED | |
| 3D visual track (standard, plan, report) | standard and plan written; implementation NOT STARTED | [`3D_VISUAL_STANDARD.md`](3D_VISUAL_STANDARD.md), [`3D_IMPLEMENTATION_PLAN.md`](3D_IMPLEMENTATION_PLAN.md), [`3D_QUALITY_REPORT.md`](3D_QUALITY_REPORT.md) |

Live model calls so far: **none**. Inference spend so far: **0**. Deployments: **none**.

---

## 2026-10-27 — Phase 03: the inference service, safe with no credentials

**What was done**

- Checked the current APIs before writing code: `ai@7.0.155` (latest; `generateText` + `Output.object`, `instructions` replaces the
  deprecated `system`), `@ai-sdk/gateway@4.0.128` (API key, else OIDC), the gateway budget and OIDC docs (updated 2026-09-08/10),
  and the public model catalog (496 models; defaults `anthropic/claude-haiku-5.5` $0.10/$0.50 and `anthropic/claude-sonnet-5.5`
  $2/$10 per million tokens). Recorded in [`AI_SETUP.md`](AI_SETUP.md) and [`AI_COSTS.md`](AI_COSTS.md).
- Built `server/ai/` as one transport-free app behind five Vercel Functions in `api/`: `GET /api/ai-status`, `POST /api/session`
  (consent + allowed origin + per-network rate → HMAC-signed 2 h token), `POST /api/interpret-belief` (the V1 vocabulary contract;
  phase 05 adds v2), `POST /api/npc-decision` (validated against each villager's own moves, targets and memories),
  `GET /api/ai-metrics` (operator only). Durable store over the Upstash REST protocol with one atomic Lua reservation across
  session, network, project-call, token and dollar counters; worst-case cost reserved before a call and settled after; **fail
  closed** on any store error; validated-only cache re-validated on read; metering with no text, session, address or key.
- **Found and fixed a deployment defect before deploying**: Vercel's builder keeps `.ts` import paths (verified with
  `vercel build` 65.4.0 offline), so functions importing `../server/*.ts` crash with `ERR_MODULE_NOT_FOUND`;
  `rewriteRelativeImportExtensions` fixes it, and `tests/unit/ai-functions.test.ts` (mutation-checked) keeps it fixed. The SPA
  rewrite now leaves `/api/` to the functions (audit hole H12).
- Browser: `src/ai/client.ts` (same-origin, token in memory only, nothing sent until the player opts in) replaced V1's
  `src/ui/interpreter.ts` and its build-time `VITE_INTERPRETER_URL`; the composer gained a consent notice (what leaves the device,
  who pays, offline always works) and labels every online reading with its source, "simulated (no model)" for the scripted
  provider. `V2_FEATURES.serverInference` is now on (an offer, not a default). V1's in-memory proxy was removed.
- Local simulator `npm run dev:api` (same app; scripted provider with `BE_AI_DEV_PROVIDER=mock`); `npm run ai:smoke` for the LIVE
  test (refuses and exits 2 without a credential); `.env.example` with names only; CI now installs `redis-server` and requires
  the real-Redis tests.

**Commands and results** (this container: Node 22.22, redis-server 7.0.15, Chromium 1243)

| Command | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass |
| `BE_REQUIRE_REDIS=1 npm test` | 34 files, **400 passed** (was 364: +47 inference tests in five new files, +2 secret guards, the 14 V1 proxy tests removed with the proxy, the 4 V1 client tests rewritten as 5) |
| `npx vitest run tests/unit/ai-store.test.ts` | 8 passed, incl. 100 racing reservations from 4 clients on real Redis → exactly 10 admitted, counters exact |
| `npx vitest run tests/unit/ai-app.test.ts` | 22 passed, incl. 100 simultaneous requests through 4 app instances sharing one store (memory and real Redis): provider calls = the per-network quota (60), never more |
| `npm run build`, `npm run size` | pass; entry 231 KB gzip (was 228), no credential name, gateway host or SDK code in the bundle |
| `npm run verify:hosting` | hosting configuration verified (CSP, headers, flows) |
| `npx playwright test tests/e2e/v2-online.spec.ts --project=desktop` | 4 passed (Classic makes no `/api` request; consent; simulated reading labelled; not configured; provider failure spends nothing) |
| `vercel build` (CLI 65.4.0, offline, scratch copy) | 5 functions (`nodejs24.x`) + static site; each built function imported and called with plain Node: `disabled` unconfigured, `quota_unavailable` with an unreachable store |
| `npm run ai:smoke` | `LIVE: UNVERIFIED` (no credential), exit 2, nothing called |
| `npx playwright test` (full) | **149 passed, 59 skipped, 0 failed** in 8.9 min (was 145/55: the 4 online-reading tests pass on desktop and skip on phone) |

**Mock vs LIVE:** every inference test used a scripted provider or the AI SDK's `MockLanguageModelV4`: **TESTED MOCK ONLY**. No model
has been called. **LIVE: UNVERIFIED.** No Vercel project exists for this repository: **NOT DEPLOYED.**

**Known limits:** no CAPTCHA/BotID (sessions are rate-limited per network; project-wide call and dollar caps bound the total); the
Upstash REST protocol is exercised through a local shim over real Redis, not against Upstash itself; costs in `AI_COSTS.md` are
list-price arithmetic, not measurements.

---

## 2026-10-27 — Phases 01 and 02: V1 audited, imported and verified

**What was done**

- Audited V1 `main@6a92862` (its CI run on that commit: success) with four read-only code audits and hand spot-checks of the
  claims the audit leans on; ran V1's whole baseline in a throw-away clone. Inspected V1's open
  [JaredVogler2/BeliefEngine#2](https://github.com/JaredVogler2/BeliefEngine/pull/2) (3D part 2, unmerged, still receiving commits) and
  left it for a later ordinary merge ([`V1_AUDIT.md`](V1_AUDIT.md) §16).
- Imported V1 with its 67-commit history as an unrelated-history merge (`a5c1c8a`); V1's prompts, README and build log relocated under
  `prompts/v1/` and `docs/v1/`; four raw tournament archives (444 KB) left out. Nothing was written to the V1 repository.
- Identity (`cc0389c`): package `belief-engine-v2` `2.0.0-alpha.0`, page title, a "V2" mark on the title screen; save, archive, catalog
  and MCP identifiers deliberately unchanged. Fixed V1's missing three.js attribution (licence inventory, `docs/ASSETS.md`, Credits).
- Added `src/v2/features.ts` (every V2 capability off), `tests/unit/v2-migration.test.ts` (pins the V1 golden values; mutation-checked)
  and `tests/e2e/v2-world3d.spec.ts` (the first browser tests that draw the Three.js world: V1's browser tests all ran on the 2D map).
- Wrote the V2 records: audit, migration, baseline, architecture, the 3D visual standard (from the owner's lantern-lit canyon
  reference and the Web-graphics standard), the 3D implementation plan and the 3D quality report with real captures.

**Commands and results** (full table in [`BASELINE.md`](BASELINE.md))

| Command | Result |
|---|---|
| `npm ci`, `npm run typecheck`, `npm run lint` | pass |
| `npm test` | 29 files, **364 passed** (V1: 356) |
| `npm run build`, `npm run size` | pass; 228 / 193 / 6.2 KB gzip within budgets |
| `npm run test:sim:smoke` | 256/256, `SMOKE OK`, output identical to V1's |
| `npm run replay:example` (both routes) | identical hashes |
| `npm run mcp:demo`, `npm run acceptance:mcp`, `scripts/nl-demo.ts` | identical to V1; Journey B 28/28 |
| `npx playwright test` | see [`BASELINE.md`](BASELINE.md) |
| `BE_SLOW_3D=1 npx playwright test tests/e2e/v2-world3d.spec.ts --project=desktop` | 3 passed (incl. the two-day route clicked in 3D: identical hashes), 1 skipped (phone-only test), 7.7 min |

**Mock vs LIVE:** no model was called. V1's mocked-provider tests (`nl-llm` 19, `nl-online-client` 4) pass: TESTED MOCK ONLY.

**Found and recorded, not fixed** (they are V1 behaviour, and the baseline must equal V1): defects D1-D13 in
[`V1_AUDIT.md`](V1_AUDIT.md) §12, among them Settings → "Restart this seed" dropping the run's mode, the archive dropping the Inventor
mark, payload-blind MCP idempotency keys, and a 3D world that does not draw wolf packs, live fire, smoke, the lens or the forecast.
