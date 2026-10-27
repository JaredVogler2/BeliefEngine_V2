# Claude Code V2 — Safe step-by-step execution and context-reset protocol

The assignment is large. Perform **one numbered phase or one verifiable increment within it at a time**. Commit early and often. Avoid a 17-phase uncommitted marathon.

## Session start

1. Read README, prompts/00_MASTER_GOAL.md, this runbook and docs/CONTINUE_HERE.md or docs/PROGRESS.md if present.
2. Inspect actual Git status/current branch, source files, test failures and existing work. Do not blindly scaffold over migrated source.
3. Select **the earliest unverified phase**. Identify smallest valuable vertical increment and concrete acceptance gate.
4. Implement real code, not another planning essay.
5. Run appropriate commands with actual recorded output: npm ci as needed, npm run typecheck, lint, test, build, Playwright/E2E and test:sim. For LLM changes test mocks plus live provider only if privately configured and authorized.
6. Capture real runtime browser screenshots for 3D and mobile modifications. Never synthesize art and call it a game screenshot.
7. Update docs/PROGRESS.md and docs/CONTINUE_HERE.md with phase, code files, commands/results, known failures, exact next step and commit hash.
8. Commit coherent working code. If tests fail, document and fix/block rather than removing test.
9. Continue one increment at a time. On context reset, replay this protocol; never mark completed from documentation alone.

## Status vocabulary

NOT STARTED: no work; IN PROGRESS: code evolving; IMPLEMENTED UNVERIFIED: source exists but required test absent; VERIFIED: implementation and required evidence passed; BLOCKED: exact reason, next owner action and mitigation documented.

Live model result must be labeled LIVE ONLY if model provider was actually called with authorization. Simulated/mock response is TESTED MOCK ONLY. Browser screenshot must come from running runtime canvas; provider-backed cognition needs observable decisions, not merely arbitrary prose.

## Suggested milestone sessions

**A / V1 port (01–02):** clone actual V1 source into V2 safely. Run original unit/browser tests, check 3D and MCP. Freeze goldens and LICENSE. No AI expansion until baseline sound.

**B / inference plumbing (03):** working Vercel-compatible AI function with server-only credential/OIDC, quota and metrics, one real provider smoke if configured. Otherwise mocks + private setup guide and mark LIVE pending.

**C / new physics language (04–06):** typed DSL and generalized executor; small vertical slice with e.g. chickens fly near bells, bridge grows stronger when watched, water turns from lanterns. If no chicken entity currently in world, add it for real or choose an equally novel world type. The same claim must affect canonical simulation and visible 3D, not just narrative.

**D / social intelligence (07–09):** six named villagers reason with bounded memory and concrete evidence, propose dialogue/action, social engine handles trust and belief adoption; actual player claim reaches threshold and changes physical world.

**E / art+experience (10–13):** true 3D effects, intuitive iPhone composer, enjoyable strategic modes, MCP parity, win/loss and save/replay.

**F / hardening (14–17):** recorded model outputs and evaluation corpus, red-team security/cost, real cross-interface live testing, adversarial gameplay audit. Fix actual problems.

## Continue-here template (must commit after every major checkpoint)

Phase + status:
Last good commit/branch:
Working files changed:
Commands run + exact results:
Mock vs LIVE model tests:
Screenshots and browser/device:
Known blockers/risks:
Next exact 1–3 code changes:
What MUST NOT be rewritten:
Private configuration needed (NEVER secret value):
Current daily inference budget/usage:

## Reliable reusable /goal

~~~text
/goal Continue BeliefEngine_V2 from latest verified commit. Read prompts/00_MASTER_GOAL.md, prompts/AGENT_RUNBOOK.md, docs/PROGRESS.md and docs/CONTINUE_HERE.md if they exist. Pick earliest incomplete numbered prompt and implement the next valuable feature as working source. Run unit/typecheck/build/browser checks, and genuine live model calls only when credentials exist in environment. Keep classic mode working, commit the result and continuation notes, and stop only at a clean checkpoint or clearly explained blocker. Never fake tests, screenshots, model calls or completion.
~~~

## Four red flags

- Adding a chat box and saying NPCs are intelligent without model-backed agent intention and memory.
- Mapping every creative sentence to one of 40 V1 spells without clearly labeling unsupported semantics.
- Overwriting deterministic simulation with uncaptured, unreplayable model responses.
- Exposing unprotected live inference in a public app, enabling unlimited billing.
