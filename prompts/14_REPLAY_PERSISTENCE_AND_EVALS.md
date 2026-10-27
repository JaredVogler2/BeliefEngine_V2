# Phase 14 — Capture nondeterministic model input so worlds can replay deterministically

## The central determinism problem

LLM outputs vary across calls, models and time. A game can still be reproducible if every external result is treated as a **recorded input**, not recomputed on replay. V1 already has seed/action-hash replay; extend this without rewriting classic engine history.

## External-decision ledger

For each semantic interpretation, NPC decision, summarization, spontaneous rival proposal, store:
- stable external event ID, run/session/turn revision and NPC or claim ID;
- event reason/salience and context hash (minimal safe canonical snapshot);
- sanitized structured validated output (AST/action/dialogue) used by engine;
- model/provider alias, resolved model ID, prompt template version, ontology version, tool/schema version, deterministic parser/validator version;
- inference metadata: latency/tokens/estimated cost (no API key);
- replay ordering, canonical hash and parent event references;
- privacy-safe source digest; raw text optional only with explicit user-local opt-in.

On playback, consume ledger in exact order; NEVER contact provider, re-summarize or silently reinterpret. If ledger missing/inconsistent return exact incompatibility error with recovery option, not new AI invention. Classic original sessions should replay under legacy version.

## Persistence

Versioned save schema with original RunState + external ledger + selected candidate AST and rendered dialogue. Local IndexedDB or versioned localStorage if small; protect large memory history size. If multiplayer/shared web sessions eventually provided, durable database with access control and session ownership, migrations and TTL. Automatic save on meaningful action/turn, restore mid-story and offline view. Privacy controls: export/delete session, explanation of server-side versus local retention, sensitive claim text handling, no user data sent without consent.

## Evaluation corpus

Create test corpus:
- 200+ diverse user beliefs with labeled supported/partial/ambiguous/unsupported and selected semantic AST;
- 100+ memory-based NPC decision cases with role, relationship, observed facts, valid actions and expected constraints;
- model hallucination and prompt-injection regression subset;
- conflict and social cascade scenarios;
- impossible game requests, unsupported primitives, contradictory simultaneous effects;
- cross-version old V1 saved AST migration.

Metrics separately: validity, semantic fidelity, false acceptance, unsupported honesty, NPC memory provenance, persona consistency, action legality, latency p50/p95, tokens/cost per active run, player-visible effects and game win diversity. Don't claim model correctness from schema parsing alone. Mock evals and LIVE evals labeled distinctly with sample sizes/model versions.

## Automated tests

- Replay same seed/recorded LLM ledger EXACT same state and event hash after full scenario without network.
- Reordering external decisions detected; stale expected revision rejected.
- Save/restart/new seed doesn't leak one NPC's memories into another run.
- Model upgrades do not silently mutate existing law effects.
- Missing external output gracefully continues with documented fallback only for new live gameplay, not altered historical replay.
- No unbounded ledger growth, exploit via repeated quote save/reload.
- Original V1 golden fixtures still reproduce.

## Gate

V2 generative mode is as reproducible as Classic once model outputs recorded, with honest provenance and measured evaluations. At least one complete browser win and loss replay offline with NO provider calls.
