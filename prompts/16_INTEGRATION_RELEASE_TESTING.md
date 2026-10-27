# Phase 16 — Real integration tests and deployable V2 release

## Product acceptance journeys

**A — Classic:** Start original Redbank with inference completely disabled and no network, finish legal win and loss, save and replay, ensure original golden engine outcomes. Load Harvest/Ashwood, expedition and original MCP smoke. Original scene selection and UI work.

**B — Novel law:** With live interpretation (if configured), write novel "chickens rise into the air when bells sound"; receive honest interpretation/clarification and mechanics preview, select witness, pay AP, activate via persuasion, see real animal movement or explain unsupported if archetype not implemented. Write independent material transformation and compound weather/fire law; verify distinct actual world deltas and attractive corresponding 3D effects. A sentence about time reversal is refused/partial with exact unsupported clause. Full victory and defeat paths reachable.

**C — Living society:** Six named villagers with different goals react to same novel statement and subsequent contradictory evidence. Verify model requests actually sent (with private configured provider) and persona/memory-driven intentions differ; trust graph changes and at least one faction strategic response. No raw hallucinated world state changes.

**D — Replay:** Save complete V2 run including model proposals, reload and replay without network; compare exact engine hashes/events with initial run. Revise prompt template/model version, prove historical AST is not silently reinterpreted. Test corrupted save recovery.

**E — MCP:** Official SDK client starts generative run, calls propose/confirm belief, talks to NPC, advances game, inspects effect, completes and replays; unauthorized/stale/duplicate actions denied. Remote MCP not claimed unless genuinely implemented, secured and tested.

**F — Phone UX:** iPhone-like WebKit 320/390/430 widths, Chrome desktop/Firefox smoke; 3D selection/zoom, composer keyboard viewport, consent/timeout/error, modal focus, game controls, accessible output, reduced motion, save/resume. Real iPhone hardware only if actually tested and identified.

## Test targets

npm ci, typecheck, lint, unit, test:sim with hundreds/thousands seeds and stored model outputs, build, Playwright E2E, browser console/network check, security fuzz, CSP, functional WebGL2 on supported browser, app bundle/perf report, no secrets scan. At least 150 interpretation fixtures, 100 cognitive cases, 1000+ generated local simulation states without provider calls (record actual counts, don't invent).

## Live inference acceptance

When user privately configures AI Gateway authentication:
- invoke real structured interpreter on 10 diverse clauses including unsupported and compound;
- invoke named agents across 2 rounds with evidence and context;
- capture actual provider response validations, model routing ID, request latency, token count, estimated cost, error/refusal rates;
- confirm accurate semantics and no provider output bypasses engine validator;
- verify cost cap/resilience under rate limiter and streaming state.
If no auth/billing, mark LIVE unverified and stop saying "LLM enabled live" on UI; mocks cannot substitute.

## Deployment

Vercel SPA build + server functions if used; set allowed origins, auth/session tokens, durable limiter/store and project hard gateway budget. Deploy only if authorized. Production endpoint must be tested with live site browser, full flow and quota; if deploy unavailable, provide accurate steps and mark NOT DEPLOYED. Never invent URL. Avoid Vercel functions relying on process memory for shared state. README explains keys and prices without asking user to paste secrets.

## Documentation

docs/FINAL_ACCEPTANCE.md table with each capability PASS/FAIL/UNVERIFIED, exact command/log, seed and model/test versions, real screenshot path, authorizations, pending action. docs/RELEASE.md with reproducible installation, builds, Vercel config, API key/OIDC and authorized cost caps. README clearly distinguishes Classic offline vs Generative Reality live.

## Gate

Genuinely playable V2 with novel interpreted beliefs, lived NPC responses, deterministic history, physical 3D world changes, optional MCP and safe inference, with all claims backed by observed tests. If live key unavailable, label integrated-but-not-live-tested and explain.
