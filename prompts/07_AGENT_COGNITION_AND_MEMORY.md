# Phase 07 — Give villagers real model-powered cognition, persistent identity and memories

## Objective

Turn existing V1 deterministic utility NPCs into **hybrid cognitive agents**. They are not individually queried every frame. The cheap state machine handles ordinary jobs/gossip/walking; a genuine LLM intervenes at salient events to propose conversation, reflection or tactics. Characters remember **what they witnessed**, who told them, credibility and how things turned out.

## Identity & memory model

Persistent villagers:
- stable ID, name, role, district, household, inventory and location;
- personality: curiosity, skepticism, ambition, fear, altruism, stubbornness, courage; bounds not arbitrary stereotypes;
- goals: feed family, protect bridge, increase status, search evidence, avoid dangers, oppose misinformation;
- current beliefs with nuanced degree, doubts, confidence and reasons (actual engine variables);
- relationships, trust, faction, rivalries and known associates;
- episodic memories with source/event ID, time, place, whether directly witnessed or hearsay, salience, emotional valence, credibility and privacy scope;
- semantic summary/long-term compressed memory formed after important accumulated evidence; preserve provenance to avoid fabricated history;
- attention/work availability and cognition cooldown/budget.

Belief and trust numbers are determined by real deterministic engine mechanics, not invented by LLM output. The model may propose an interpretation or changed intent, which has legal action costs and witness requirements.

## Agent invocation triggers

Call model on: novel player claim, heated argument, direct contradictory observation, personal loss, major law activates/fails, election/faction move, player initiated conversation, extraordinary crisis. Prefer batching relevant agents when many hear the same event but preserve individual voice. Deterministic fallback utility AI if provider missing/rate limit/timeouts; no game freeze. Limit e.g. 1–3 decisions per key agent per epoch/day, use model tier by complexity, maintain per-run token budget.

## Structured model output

NPCDecision:
- citizenId and inputStateRevision
- thought summary for debug/audit (NOT private chain of thought)
- selected intent from explicit eligible action enum (spread, ask, investigate, challenge, comfort, persuade, move, stage evidence, support rescue, wait)
- target entity/claim/event IDs that exist in supplied context
- one short grounded dialogue line (optional)
- cited remembered event IDs used in reasoning
- desired topic, rhetorical approach and emotional tone (bounded)
- confidence and expected impact as subjective estimates, never authoritative state.

Parser validates IDs, allowed action, state phase, location/route, item/AP/attention and cited evidence. Reject hallucinated memories/illegal tool actions. On conflict or stale revision, re-evaluate cheap fallback, not unbounded re-call loop.

## Conversation behavior

Player can select villager and ask short question, persuade, challenge evidence or elicit a hypothesis. NPC answers reflecting past events and knowledge limits. If NPC didn't witness a storm across a destroyed bridge, no omniscient exact details. NPC may lie/err but model intent and game epistemic state remain distinct; the UI should let player investigate. Conversation results are local events; model utterance alone does not auto-convert target belief. Trust and evidence rules resolve resulting persuasion.

## Memories and long runs

Cap memory tokens, retain source pointers and high-salience events, summarize only once threshold, never erase facts necessary to judge law effects. NPC memory survives save/reload and renderer reset; generations or death handled clearly. NPC personality changes modestly from major events with bounded mechanisms, not arbitrary model rewrite. Redact player private text before remote call according to consent.

## Tests

Mock model: 50+ response/schema cases, hallucinated person/claim, no remembered event, prompt injection, stale revision, contradictory evidence. Live test (once authorized): 6 named agents confronted with same claim and evidence, showing context-dependent **different** decisions; re-call after new evidence changes some decisions. Measure latency/tokens/cost and replay recorded outputs without model. Compare fallback vs live mode for actual changes; otherwise not LLM-driven gameplay.

## Gate

At least six named villagers make legal model-backed meaningful decisions under real configured provider; memory persistence and source limitations work; 12–20 agents simulated inexpensively via hybrid approach; original game still playable offline.
