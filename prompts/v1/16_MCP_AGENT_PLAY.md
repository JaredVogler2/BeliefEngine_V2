# Phase 16 — Let Claude and other AI agents PLAY Belief Engine over MCP

## Mission

Implement an **optional, production-quality Model Context Protocol (MCP) game adapter** so Claude Code, Claude Desktop, ChatGPT (where its MCP client supports the server), or another compatible AI client can play actual Belief Engine runs via tools. The browser remains the flagship visual experience. MCP is an alternate *controller*, not a second simulation or a magical strategy bypass.

Do not confuse "Vercel's own MCP to manage deployments" with **our custom Belief Engine MCP game server**. A game MCP endpoint must expose our game-specific tools.

Use current official MCP SDK/specification at implementation time. As of October 2026, current official **Streamable HTTP** transport revision is dated 2026-07-28; it is POST-centric and differs from 2025-11-25 implementation behavior. Select interoperable SDK/protocol, document compatibility and test against at least one real MCP client plus a protocol compliance probe. For local stdio support, follow SDK requirements.

## Architecture: same authoritative engine

Core interfaces:
- createRun, getView, getAvailableActions, planAction, resolveDay, getEventHistory and validateAction already exist in src/engine.
- Build adapters: browserController (UI→engine), mcpController (validated tool call→engine), optional HTTP controller (browser/remote shared session→engine).
- **Never duplicate physics, social propagation or AP math in MCP.** All successful mutations go through same RunState/action validation and state transition functions used in browser.
- Agents have NO privileged hidden info by default, no ability to set random outcome, teleport villagers or bypass costs.
- Define a separate explicitly flagged debug toolset for local testing, never expose it on public endpoints.
- MCP outputs should include both human-oriented summaries and machine-readable stable JSON ids/values.

## MCP tool contract (initial minimum)

Use descriptive names and schema-validated arguments. Required tools:
1. list_scenarios() → scenario ids, rule version, modes and mission summaries.
2. create_game({scenarioId, seed?, difficulty?, mode?}) → runId, access/scoping details, day, briefing and valid next actions.
3. get_game_state({runId}) → day/phase, objective status, AP, physical threats, claim pressure, important recent events and available next steps; default concise, support details parameter.
4. inspect_map({runId, region?}) → compact spatial map in structured tiles/landmarks or ASCII summary with coordinates, threats, travel restrictions, danger; optionally return graphical link but do not require vision.
5. inspect_villager({runId, villagerId}) → trust ties, beliefs, needs, location, strengths, reason codes, feasible influence actions.
6. inspect_claim({runId, claimId}) → belief support, activation thresholds, effect, side effects, contradictions, influential nodes, spatial range.
7. list_actions({runId, targetId?}) → **legal** action templates and schema/costs for current planning phase.
8. take_action({runId, action, expectedRevision?, idempotencyKey?}) → validated action, cost, updated revision, changed beliefs, concise event summary or actionable error.
9. end_day({runId, expectedRevision?, idempotencyKey?}) → social/world simulation, threat updates, law changes, win/loss and events; never magically simulate multiple turns.
10. get_history({runId, fromDay?, limit?}) → causal event entries / reason codes, no giant transcript unless paginated.
11. get_results({runId}) → status and debrief (only available after resolution), score and detailed consequences.
12. retry_or_new_game({runId, reuseSeed?}) → distinct new run, no state leakage.
13. submit_belief({runId, text, targetRegion?, ...}) → delegate to phase 17 safe NL pipeline; if NL pipeline not enabled, return explicit capability-not-enabled and offer canonical claim selection.

Recommended additional tools: get_tutorial, get_social_graph (paginated/subgraph), list_rules, compare_possible_actions (bounded deterministic forecast), export_replay and request_hint. Do not dump entire 100+ villager arrays into every AI turn; compact summary plus inspect tools minimizes token use.

## Tool response example — representative only

take_action should return a parseable response similar to:

~~~json
{
  "runId": "r_abc123",
  "revision": 7,
  "accepted": true,
  "remainingInfluence": 1,
  "events": [
    {"code":"RUMOR_SEEDED","agent":"mara","claim":"river_fears_fire","convictionDelta":12}
  ],
  "nextValidActions": [{"actionType":"END_DAY"}],
  "humanSummary": "Mara has heard your claim. She trusts Ivo, who can bring it across the bridge."
}
~~~

This represents a hypothetical response schema, NOT a promise of exact numbers. Preserve detailed event provenance. An invalid tool call returns a structured error and legal alternatives, not a silent no-op.

## Game-playing agents

Demonstrate 3 AI play patterns:
- Coach: agent inspects and recommends but human clicks the browser action.
- Delegate: agent plays its OWN local/remote session through MCP, turn by turn.
- Co-op: human and agent share a session, but optimistic concurrency and explicit action approval prevent surprises; co-op default READ-ONLY coaching until user gives control.

For AI agents provide resource text: concise rules, scenario strategy objective, tool usage examples, how to inspect limited hidden info, and when to call end_day. Include MCP prompts such as "Play cautiously", "Find an alternate winning strategy" and "Explain why I lost", but tools—not instructions—must enforce rules.

## Transport: local-first, remote optional

**Local MCP MVP**: stdio server installed by the user/agent project, backed by validated local save data, scoped to local host; no remote infrastructure required. Include npm command, example MCP config and integration smoke test with actual SDK client.

**Remote MCP** (for agents not sharing local process, or browser/agent shared sessions): host authenticated Streamable HTTP endpoint on a Vercel Function or other suitable host. Important:
- Never store authoritative game state only in serverless process memory. Use versioned persistent store (durable KV/Redis/database) with TTL, optimistic revision/CAS and retry policy to survive cold starts; document provider fees/quotas. Existing browser-only save remains independent.
- Use per-user/per-session authorization with signed scoped tokens/OAuth as appropriate, proper origin checks, allowlists and request validation. Unpredictable run IDs alone are NOT adequate security.
- Rate limit tools, bound response/payload sizes, turn limits, reject stale writes with conflict that can be resolved by re-reading state.
- Keep writes idempotent with client-provided idempotency keys; end_day must never advance twice because a request is retried.
- Correct Content-Type, protocol-version negotiation, security requirements and supported Streamable HTTP shape according to exact spec/SDK version. Do NOT hardcode obsolete SSE transport behavior.
- Consider a structured HTTP game API beneath both browser and MCP remote adapter; choose minimal duplication.
- If you cannot deploy remote storage/access infrastructure, ship local MCP and **document remote as unverified/incomplete**, not pretend it works.

## Identity, ownership, and security

- Users may inspect/manage ONLY their own run. Co-op access explicit and revocable.
- Player data/runs are untrusted; all action fields validate ids, costs, type, revision and active phase.
- Avoid path traversal and command execution; never eval claim text.
- Audit prompt-injection attempts in names/claims; treat them as data, not tool instructions.
- No LLM API or network required for core MCP tool execution when local mode is used.
- Explicitly limit arbitrary system resources and event log output; protect against denial-of-service via run floods.

## Testing

Build MCP integration tests proving:
- start→inspect→seed→end day→law→victory/defeat through MCP using a REAL client transport;
- invalid/unauthorized/stale/duplicate action does not change run;
- same seed/action history yields EXACT same game state via browser engine and MCP engine;
- no AP bypass and no hidden state in public get_game_state;
- page refresh or serverless cold start doesn't lose state in remote mode;
- two concurrent clients cannot silently overwrite one another;
- tool schemas parse/return correct JSON and meaningful errors;
- no secret or third-party API call required to run local MCP.

## Human-facing README

Explain plainly:
- "Playing in browser" vs "playing through MCP";
- difference between MCP transport and LLM inference;
- how to register the game MCP server in Claude Code or another client, referencing **actual** commands (verified);
- how remote sessions share state with browser (only if implemented);
- privacy, authorization and hosting costs;
- example natural language agent command: "Start a normal Flood at Redbank game. Inspect the bridgekeeper. Try to win without lighting beacons. Explain each day before acting."

## Hard acceptance

A real AI-compatible MCP client can play through one complete scenario, including an actual win or loss, with validated same-engine state transitions and a reproducible trace. A server file with tools/list but no working game mutations FAILS. Commit runnable code, integration tests, example configuration, actual verification logs and honest limitations.