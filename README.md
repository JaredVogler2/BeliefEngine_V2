# BELIEF ENGINE V2 — Generative Reality

**Tell the village anything. Convince them. Watch reality respond.**

This is the Claude Code implementation playbook for the LLM-enabled successor to [BeliefEngine V1](https://github.com/JaredVogler2/BeliefEngine). This repository currently contains **plans, not a finished game**.

Start with [prompts/README.md](prompts/README.md) and [prompts/00_MASTER_GOAL.md](prompts/00_MASTER_GOAL.md). Execute phases 01–17 following [prompts/AGENT_RUNBOOK.md](prompts/AGENT_RUNBOOK.md).

## Claude Code kickoff

~~~text
/goal Read prompts/README.md, prompts/00_MASTER_GOAL.md and prompts/AGENT_RUNBOOK.md. Build BELIEF ENGINE V2: Generative Reality, migrating the actual V1 source into this repo without modifying V1. Preserve the deterministic gameplay, scenarios, replay, MCP, and Three.js world. Implement live opt-in LLM-powered belief interpretation, genuinely reasoning villagers with persistent memory, an extensive validated compositional rules DSL, and actual social-to-physical 3D effects. Default classic gameplay must work without any model key. Build secure Vercel-hosted inference with strict quotas/budgets and private server credentials. Commit small verified phases, capture actual browser evidence, run real provider smoke tests only after private configuration, and never claim mocked LLM behavior is live. Deliver playable desktop and iPhone browser experiences, meaningful win/loss/replay, and a rigorous adversarial review.
~~~

## Implementation principles

- V1 has actual code and tests; migrate, do not rewrite blindly.
- Natural language can be widely understood, but arbitrary executable physics is NOT possible unless simulated primitives exist; explain unsupported semantics and ask clarification.
- Never execute LLM-generated JavaScript, shaders or WASM in normal public gameplay.
- LLM decisions are structured proposals; deterministic game rules remain authoritative.
- Captured validated LLM decisions make replays reproducible without re-calling a model.
- Provider keys belong in server environment or Vercel OIDC, never prompts, frontend bundles or git.
- Vercel AI Gateway and individual model APIs are metered. Default offline mode free of inference costs.
- The existing V1 3D renderer uses raw Three.js, not React Three Fiber; reuse it until there is a demonstrated reason to replace.
- Creative sandbox has separate unranked outcomes; standard scenarios remain balanced.

Progress must be recorded truthfully in docs/PROGRESS.md and docs/CONTINUE_HERE.md.
