# Phase 18 — Final acceptance: browser + MCP + natural-language beliefs

This is the **last** phase. Earlier release hardening (14) and adversarial review (15) are preliminary; re-run review after phases 16–17 because new interfaces expand the attack surface and can damage balance. **Do not declare fully complete** if any mandatory acceptance test below fails.

## Product tracks and honest status

Track separately:
- **Core Browser Game:** required; must be complete, replayable and offline-capable (after loading assets).
- **Local MCP Agent Play:** required in this revised roadmap; must be complete with a validated full game via an actual protocol client.
- **Remote MCP:** optional until authentication + durable remote storage are provisioned; if incomplete, clearly mark as unavailable, not "supported" or silently point to local adapter.
- **Offline Natural-Language Composer:** required; supported ontology/synonym mapping + explicit abstention on unsupported input.
- **LLM-Enhanced Natural-Language Composer:** optional until a provider key, backend, quotas, and user opt-in are configured; cannot be claimed live without actual provider test.
- **Custom-rule gameplay:** required within supported DSL; validated bounded composition and real physical effects. Unsupported arbitrary literal natural language is honestly identified.

## Three end-to-end proof journeys

**Journey A — Human Story Run**
1. Open game fresh on mobile-sized browser.
2. Start Flood at Redbank, inspect a villager, choose or compose a supported claim.
3. Seed rumor, let graph spread; verify genuine conviction changes and observed effects.
4. Activate law, alter flood/bridge trajectory, experience secondary side effect.
5. Win with first validated route, save a deterministic replay.
6. Lose intentionally in another run, view causally grounded debrief.
7. Restart seed and show a distinct route winning.

**Journey B — AI through MCP**
1. Launch real local MCP server in a compatible client or integration test harness.
2. List scenarios, start game, inspect state/map/social graph.
3. Agent chooses legal actions, pays correct AP, ends day, watches outcomes.
4. Agent navigates a rival counteraction or disaster.
5. Agent completes game and receives valid debrief and replay hash.
6. Replay same seed/action list via direct engine, assert identical canonical outcome and events.
7. Submit unauthorized/duplicate/stale action; reject without changing authoritative state.

**Journey C — Freeform belief**
1. In browser, type "The river turns away from lantern flames."
2. Get semantically faithful explanation/AST tied to bounded river/redirection rule and explicit costs.
3. Confirm, seed and propagate, see ACTUAL river behavior change as law activates.
4. Type a second substantially different claim (e.g. "The watched bridge cannot break"); get DIFFERENT target/effect, confirm and see different physics.
5. Type "everyone instantly survives forever" and an adversarial prompt. Reject or offer bounded honest interpretation, with no exception or credential leak.
6. Save and reload, verify existing authored AST persists and replays deterministically WITHOUT re-calling an LLM.
7. Disable network/API: normal game and offline composer still work. If LLM mode configured, test failure/fallback.

## Data integrity and security

- Single authoritative reducer across browser/MCP/composer.
- Replay version includes world schema, scenario version and authored AST so update does not silently rewrite past results.
- No direct executable code or physics scripts from LLM, no unsafe eval.
- API keys only in secure provider-side runtime, never committed or embedded in browser.
- If remote MCP, verify scoped authentication, Origin, rate limiting, idempotency and optimistic concurrency.
- No arbitrary MCP tool call can expose another player's private run.
- Race tests with browser+agent simultaneous writes if shared remote session is enabled.
- Clear opt-in consent and cost warnings for provider-powered interpretation.

## Re-evaluate actual fun, not just technical functionality

Replay ten varied seeded runs manually or via available tools and compare bot traces. At least:
- 2 winning strategies in canonical Redbank.
- 3 authored scenarios completed.
- 2 custom belief mechanics create visibly different outcomes.
- 1 agent-driven MCP complete run.
- A novice UI pass (no perfect knowledge cheat).
- A balance exploit attempt with custom high-powered beliefs.
- A generated expedition run with meaningful divergence from campaign.
Log observed evidence and limitations, and fix severe regressions.

## Release output

Root README should clearly describe: browser play; game loop; keyboard/touch controls; local MCP setup/config; remote MCP status; offline NL support; opt-in LLM status and privacy/costs; tests; deployment; example seed/replay. Add screenshots only when real and permitted. Produce docs/FINAL_ACCEPTANCE.md table with each track status (PASS/FAIL/UNVERIFIED), commands, proof, commit/version, limits and exact next actions for failures. Commit tested code/docs. If a core track fails, do not claim a completed game.

**Goal is to ship a game people can genuinely play—human or agent—not a speculative architecture.**