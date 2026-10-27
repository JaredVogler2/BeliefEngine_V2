# Phase 13 — MCP remains a real game interface, not a separate AI simulation

## Keep V1 foundation

Original mcp/server.ts and mcp/service.ts provide local stdio game actions through GameSession. Preserve current client registration and original tool names where possible, with compatibility wrappers/versioning for new beliefs. Do not pretend that MCP itself supplies inference: a client may use an LLM, but V2 NPCs use its own server-side provider pipeline.

## Extend tools

Provide:
- list_scenarios and create_game with mode (classic/generative/living/lab) and seed.
- get_game_state, inspect_villager (public info only), inspect_object, inspect_claim, inspect_region, get_social_graph, get_history.
- get_interpreter_status (live/model-disabled/quota available; no secrets).
- propose_belief: natural language to **safe candidate previews**; no AP spent; can route through live provider only if client session authorized and rate budget allows.
- confirm_belief: candidate hash/revision + selected interpretation; only normal game action can compose.
- speak_to_villager: legal target, dialogue text; server/engine manages memory and LLM decision under quota, not direct manipulation.
- stage_evidence, take_action, end_day, get_results, export_replay.
- get_rule_explanation: supported effects, unsupported semantics, side effects and causal provenance.

Use stable JSON schema, versioned errors (INVALID_CLAIM, STALE_REVISION, OUT_OF_BUDGET, LLM_UNAVAILABLE, UNSUPPORTED_EFFECT, NOT_AUTHORIZED) and legal alternatives. Client must not request raw private NPC thoughts beyond allowed visible memories, developer tools remain opt-in/local. All mutation calls use same AP/action validation as browser. Replays include chosen model proposals.

## Local and remote

Local stdio MCP is required, using official SDK and process-level save store from V1. Remote Streamable HTTP MCP is OPTIONAL until authenticated and durable shared game sessions are provisioned. If remote attempted:
- correct protocol version and official transport;
- authenticated session ownership or explicitly shared co-op capability;
- durable run state (not in-memory Vercel function);
- atomic optimistic revision/CAS + idempotency for actions/end day;
- Origin validation, content-type and CSRF rules, rate/token budgets;
- tests with two clients writing concurrently and stale revision rejection.
Never claim browser and MCP share same remote run unless actual shared store exists.

## Integration proof

A real SDK MCP client performs start→inspect→new belief→confirm→persuade→law→world effect→ending→replay. Unauthorized/duplicate/stale calls leave game unchanged. Same seed/actions + recorded model proposals produce identical engine hash as browser controls. One scripted client and one actual model-powered agent session if authorized. AI client must not be allowed to create forbidden all-powerful laws or bypass cost.

## Documentation

docs/MCP_V2.md: verified installation commands, supported clients, local storage and secret handling, what an inference provider costs, examples of a legal creative claim and agent strategic session. Distinguish local MCP (implemented) from remote (if not built). Never put provider credential in config examples beyond environment-variable references.

## Gate

Local agent play works on actual V2 engine with new generated claims, game rules and memory; shared-session remote claims only when securely tested.
