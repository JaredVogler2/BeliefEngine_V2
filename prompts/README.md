# BELIEF ENGINE V2 — Complete Claude Code build program

Use Opus 5.5 Max to implement **real source code** in phases, not only documents. Read [00_MASTER_GOAL.md](00_MASTER_GOAL.md), [V1_CODE_AUDIT_SUMMARY.md](V1_CODE_AUDIT_SUMMARY.md), and [AGENT_RUNBOOK.md](AGENT_RUNBOOK.md).

## Numbered execution phases

| Phase | File | Acceptance outcome |
|---|---|---|
| 00 | [Master goal](00_MASTER_GOAL.md) | Overall architecture and non-negotiable product |
| 01 | [V1 audit](01_V1_REPOSITORY_AUDIT.md) | Verified source inventory and baselines |
| 02 | [Migration](02_MIGRATION_AND_BASELINE.md) | Original game running inside V2 |
| 03 | [Provider setup](03_PROVIDER_AUTH_AND_BUDGETS.md) | Backend-authenticated, budgeted LLM calls |
| 04 | [Language/DSL](04_GENERATIVE_BELIEF_LANGUAGE.md) | Versioned compositional AST & effect validation |
| 05 | [LLM interpretation](05_LLM_INTERPRETER_AND_COMPILER.md) | Real semantic parsing, ambiguity and refusal |
| 06 | [Simulation operators](06_UNIVERSAL_SIMULATION_PRIMITIVES.md) | Dynamic laws that physically execute |
| 07 | [NPC cognition](07_AGENT_COGNITION_AND_MEMORY.md) | Villagers with goals, evidence, memory |
| 08 | [Emergent society](08_MULTI_AGENT_SOCIAL_DYNAMICS.md) | Competing viewpoints and interactions |
| 09 | [Belief activation](09_BELIEF_TO_REALITY_BRIDGE.md) | Persuasion → threshold → changed world |
| 10 | [3D effects](10_THREE_D_VISUAL_EFFECTS.md) | Visible physically accurate fantasy effects |
| 11 | [Actual gameplay](11_GENERATIVE_GAMEPLAY_AND_BALANCE.md) | Wins/losses, costs and strategic depth |
| 12 | [Browser/mobile UX](12_DESKTOP_IPHONE_UX.md) | Clear freeform composer and touch input |
| 13 | [MCP](13_MCP_AND_TOOL_PLAY.md) | AI agent gameplay with same rules |
| 14 | [Replays and evals](14_REPLAY_PERSISTENCE_AND_EVALS.md) | Versioned AI decisions, deterministic playback, evals |
| 15 | [Security and budgets](15_SECURITY_PRIVACY_COST_AND_FAILURE.md) | Injection, quotas, privacy and provider outages |
| 16 | [Release integration](16_INTEGRATION_RELEASE_TESTING.md) | Real end-to-end playable V2 build |
| 17 | [Adversarial review](17_ADVERSARIAL_FUN_REVIEW.md) | Critical fun/art/security fixes and honest verdict |

## First command to give Claude Code

~~~text
/goal Start BeliefEngine_V2 following prompts/00_MASTER_GOAL.md and prompts/AGENT_RUNBOOK.md. Execute one numbered phase per verified checkpoint and commit actual working source. First migrate the V1 game and its tests into V2 without disturbing the original. Then build a genuine, metered model-backed semantic interpreter and memory-based villager cognition coupled to an extensible deterministic reality simulation. Do not call limited keyword matching unrestricted language comprehension or fake LLM responses. Stop feature expansion whenever the gameplay, browser, visual fidelity, safety or cost-control gate fails. Continue autonomously and preserve docs/CONTINUE_HERE.md after every phase.
~~~

## Binding release requirements

- V1 story chapters, graph diffusion, physics, save/replay, 3D world and local MCP retain working behavior.
- At least 3 semantically different **new** beliefs generate 3 genuinely different effects (not cosmetically renamed existing laws); one must be a two-clause composition.
- Villagers have distinct identities and can produce divergent, history-sensitive dialogue/intents using **actual provider calls** when the integration is enabled.
- All proposals go through the same validation/physical/social action pipeline used by non-LLM game modes.
- Real provider tests distinguish LIVE from MOCK and record token usage, latency and estimated cost.
- Missing credentials, budget exhaustion and outage never crash a game; offline mode remains available.
- At least one full V2 win, loss and replay on browser; saved LLM proposals restore deterministically.
- Desktop and iPhone-sized WebKit navigation and 3D effects tested, not merely typechecked.
- No invented live URL, user playtests, model accuracy or 3D quality claims.

**Do not send provider secrets to Claude in prompt text.** User may configure private environment when necessary.
