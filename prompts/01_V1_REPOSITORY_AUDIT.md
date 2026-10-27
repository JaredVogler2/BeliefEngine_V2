# Phase 01 — Actual V1 adversarial source inspection before writing V2

## Scope

Inspect V1 GitHub main from a fresh checkout (plus any accessible active development branch). Do NOT trust summary docs alone. Inspect precise files listed in V1_CODE_AUDIT_SUMMARY.md and at least package.json, tests/e2e/inventor.spec.ts, tests/unit/nl-llm.test.ts, src/ui/play/Compose.tsx, src/engine/nl/llm.ts, src/engine/laws/effects.ts, server/interpreter.ts, mcp/server.ts and src/render3d/World3D.ts.

## Build and test baseline

Clone V1 to temporary read-only working directory; inspect git log, LICENSE, package/lock versions and CI. Run npm ci, typecheck, lint, npm test, build and targeted Playwright smoke where environment supports WebGL2. Execute original unit tests of composing existing belief, two winning Redbank traces, MCP demo, 2D and 3D scene if available. Preserve exact golden hashes. If tests fail (e.g. current prerelease/library mismatch), record stack trace, distinguish existing defect from environment/graphics limitation and plan minimal fix in V2 only. Never report source-reported green check as newly run verification.

## Architecture evidence

Create docs/V1_AUDIT.md covering:
- State and action lifecycle, RNG, versioning, public engine API, cloned source list and tests.
- Social propagation math, neighbor trust, memory and faction policy; which decisions are generated, scripted or computed.
- NL input → offline parse/LLM schema → belief AST → balance/stress → compose → social spreading → world law effect.
- Full current subject/effect/trigger vocabulary with unsupported examples.
- Interpreter endpoint auth, timeout, allowed origin, body validation, quotas and cache; identify serverless/global holes.
- 3D world architecture; determine whether raw Three.js or R3F; check actual art screenshots and incomplete rebuild.
- How story mode, inventor mode, generated runs, MCP and save locations work.
- Existing e2e tests vs real mobile Safari/human testing gaps.

## Design gap matrix

Classify features: KEEP (golden engine, replay, original campaigns), EXTEND (law/effect DSL, agent memory, UI), REPLACE (finite NL parser in Generative mode, in-memory limiter for public use), OPTIONAL (remote MCP, physics rigid bodies), UNVERIFIED (live LLM, deployed application).

## Migration safety

Identify source license/attributions, binary assets, generated reports, .env files/secrets. Record exact commit pinned for import so V2 reproducibility is traceable. No write to V1. If V1 source changed significantly from previous review, update downstream plan based on inspected evidence.

## Gate

A real audited code map + exact test results, known limitation list, migration actions and initial design decisions committed. No claim of new LLM-enabled game yet.
