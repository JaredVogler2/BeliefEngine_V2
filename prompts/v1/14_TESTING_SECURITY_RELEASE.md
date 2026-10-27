# Phase 14 — Release hardening and publicly playable browser build

Do not claim release-ready until the implementation is truly runnable, tests are green, and interactive game flows are verified. This phase is about **truthful production evidence**, not just adding a Vercel config file.

## Production and security checklist

Build is client-only for baseline human single-player mode. Configure static hosting (Vercel-compatible), SPA deep-link handling, cache/version semantics, favicon, metadata, basic accessibility and privacy explanation. No unnecessary analytics, telemetry or cookies. If adding optional MCP/LLM backend (phases 16–17), isolate and feature flag it; browser game must run without it.

Dependency hygiene:
- Lockfile committed; check dependencies for vulnerabilities/licenses and selectively update safe versions.
- No secrets in git/client bundle, no production secrets in VITE_ variables.
- CSP where practical for static code/assets; avoid unsafe injection/eval and unsanitized HTML.
- Scenario/seed params schema-validated; stored saves parse safely with migration/fallback.
- Avoid dynamically executing user-authored claims as code.
- No paid/proprietary unlicensed fonts/assets.
- Error UI and graceful recovery for storage blocked/unavailable, WebGL failure, missing content and load timeout.

## Required automated test matrix

**Unit**:
- AP/cost invariants and legal/illegal actions.
- Deterministic PRNG and stable replay hash.
- Belief propagation trust, evidence, opposition, memory.
- Law activation/hysteresis/contradiction; actual physics impacts.
- Map hazards, navigation, survival/rescue and resources.
- Quest victory/defeat and impossible scenario detection.
- Score, achievements and progress save/reset.
- Random bad scenario input/seed version gracefully handled.

**Integration**:
- Two valid Redbank wins and one loss with exact reproducible seed+trace.
- At least one victory trace for each other shipped authored level.
- Social effect → law activation → river/bridge/physical change → objective outcome.
- Cross-map cut-off affects social contact.
- NPC strategic reaction and player counterplan.
- Generated valid seeds, 1,000+ offline unless system limits disclosed.
- Full save/reload maintains deterministic continuation.
- Event log retains causal provenance and never contradicts state.

**End-to-end (browser)**:
- Clean-load start, tutorial, action selection, AP update, day resolution, observable event, win and lose screen.
- Retry same seed, new seed, share seed, campaign mode and daily mode.
- Phone and desktop interaction, keyboard and tap behavior, accessibility smoke.
- Save/resume after reload; corrupted save recovery; settings/mute persistence.
- No console errors during common flows and no blank screens.

Check all buttons, dropdowns, cards, map click targets, dialog dismissals; not only initial route.

## Manual playthrough protocol

If browser tool/device available, play complete runs on at least one campaign scenario and one expedition seed. Document where decisions were satisfying, confusing, unfair, or grindy. If no browser automation, explicitly say unverified and provide steps for user testers—do not invent observed sessions.

## Quality release gates

1. Fresh checkout and npm ci succeed.
2. npm run typecheck, lint, test, build, test:e2e pass (if unavailable, say exactly why; do not fabricate).
3. Two genuinely distinct complete victories in initial scenario, plus credible loss, verified via engine integration.
4. At least 3 playable campaign scenarios, including different mechanisms and endings.
5. Valid random/seeded expedition, same-seed replay, daily variant, usable debrief.
6. Auto-save/recovery and nonfatal errors handled gracefully.
7. Critical touch interactions tested at small phone width.
8. At least one actual browser E2E covers meaningful input → social shift → physical effect → ending.
9. Honest accessibility checklist and telemetry/privacy.
10. Source, assets, documentation committed with commit hashes.

## Deployment

For Vercel: create project, connect repository if authorized/available, set build command npm run build and output directory dist (or framework-appropriate settings), deploy and smoke-test live URL. If deployment access unavailable, prepare exact deploy instructions and report **not deployed**. Do not invent live URL, tests, metrics or client compatibility. Ensure branch deployed matches tested commit.

Add docs/RELEASE_CHECKLIST.md, docs/TEST_RESULTS.md with commands/output/time/version, docs/KNOWN_ISSUES.md, and clear README with controls and 3-minute demo instructions. If a blocker stops release, prioritize fixing it before novelty features.

## Phase gate

Do not mark complete without actual evidence. Commit and provide user-facing accurate status. Phase 15 adversarial review can reopen release if critical problems found.