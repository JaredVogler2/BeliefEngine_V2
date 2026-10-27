# V2 progress log

One entry per verified checkpoint, newest first. Status words follow [`prompts/AGENT_RUNBOOK.md`](../prompts/AGENT_RUNBOOK.md):
NOT STARTED, IN PROGRESS, IMPLEMENTED UNVERIFIED, VERIFIED, BLOCKED. V1's own build log is [`v1/PROGRESS.md`](v1/PROGRESS.md).

| Phase | Status | Evidence |
|---|---|---|
| 01 V1 audit | **VERIFIED** | [`V1_AUDIT.md`](V1_AUDIT.md); V1 baseline run in a clone ([`BASELINE.md`](BASELINE.md)) |
| 02 Migration and baseline | **VERIFIED** | [`MIGRATION.md`](MIGRATION.md), [`BASELINE.md`](BASELINE.md), `tests/unit/v2-migration.test.ts`, `tests/e2e/v2-world3d.spec.ts` |
| 03 Provider, auth, budgets | NOT STARTED | next: [`CONTINUE_HERE.md`](CONTINUE_HERE.md) |
| 04-17 | NOT STARTED | |
| 3D visual track (standard, plan, report) | standard and plan written; implementation NOT STARTED | [`3D_VISUAL_STANDARD.md`](3D_VISUAL_STANDARD.md), [`3D_IMPLEMENTATION_PLAN.md`](3D_IMPLEMENTATION_PLAN.md), [`3D_QUALITY_REPORT.md`](3D_QUALITY_REPORT.md) |

Live model calls so far: **none**. Inference spend so far: **0**.

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
