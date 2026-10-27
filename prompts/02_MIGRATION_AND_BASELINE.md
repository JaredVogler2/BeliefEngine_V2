# Phase 02 — Preserve and port the working original into the V2 repository

## Safety-first steps

This repository initially only contains V2 prompt documents; V1 is a separate source. Use a safe temporary clone of V1 at the pinned audited commit. Copy selected source with a verified script or git history integration (history preservation if practical), keeping V2 prompt files. Do not force push, delete V2 documents or overwrite V1. Avoid using a GitHub template copy that silently loses important fixtures/metadata. Include original LICENSE and third-party notices. Adjust package name/app identity/README and relevant Vercel project labels to BELIEF ENGINE V2.

## Minimal port scope

Copy real src/engine, src/render3d, src/render fallback, src/ui, src/audio, mcp, scripts required for builds/tests, index, public/assets, package/lock, TS/ESLint/Vite/Playwright configs, existing test fixtures and relevant game docs. Preserve core golden run fixtures and migration tests. Exclude secrets/local node_modules/dist/test-results, and optionally bulky historical reports not used in CI; document excluded data. Carry content/graphics licenses. Check case-sensitive path casing and build imports.

## Compat and regression

Run fresh npm ci, typecheck, lint, test, build, original e2e smoke. One browser screenshot in 3D and 2D; selection + claim composition. Exercise Redbank first-day interactions, seeded win trace, Harvest/Ashwood load, save/load, expedition startup and local MCP tool smoke. Confirm old gameplay still functions and source hash remains same under same seed/actions. Do not alter game math to simplify migration.

If current 3D defaults to 2D in software WebGL/automation, force known 3D flag and record whether browser can actually render it; don't claim 3D verified from fallback-only screenshot. Check whether art direction needs follow-up fixes.

## Preserve separation

- GameSession/controller remains authoritative.
- V2 inference modules live in clearly separated server, engine/rule-language and agents/ directories, with adapters to old RunState.
- Original Classic path runs with inference flag OFF, zero network calls.
- Versioned save migration handles legacy claims/AST and version hashes; never silently rewrite historical replays.
- Original MCP remains functional, no model call needed to use it.
- Add new V2 feature flags default to OFF until secure infra and integration gates.

## One complete vertical smoke

From V2 app, create original run, seed an existing claim, advance day, see belief pressure and real world effect, lose/win end screen, save/replay; confirm no provider key required. Attach exact test command/result. Add CI workflow to repeat.

## Gate

V2 repository now contains a real running baseline game, tests and 3D capabilities—not only prompts. Golden seeded replay and migration tests pass; commit clean source checkpoint before expanding into LLM features. If baseline source cannot be accessed, mark blocked and provide exact recovery path.
