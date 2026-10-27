# Phase 05 — Genuine natural-language comprehension with transparent constraints

## Product behavior

The user can type in ordinary English, without choosing from a hardcoded handful of cards. The model identifies real semantic components rather than keyword-matching to existing spells. Examples:
- "Chickens can fly when the chapel bells ring" → TARGET chicken, CONDITION bell event, EFFECT upward force / sustained flight if prefab/physics supported.
- "Wet stone becomes weightless beneath moonlight" → TARGET wet stone, two condition checks, MASS/force effect with limited duration and physical consequences.
- "Every promise whispered beside a bridge makes it stronger" → TARGET bridge, SOURCE event player/NPC spoken promise, EFFECT increases strength once per unique witness with cap.
- "Fire cannot burn people wearing blue" → entity selector clothing tag, damage multiplier against fire only, explicit gameplay limitation.
- "Rain falls upward wherever the baker sings" → likely unsupported full global inversion unless bounded local upward droplets exist; show a partial localized proposal and tell the player what's missing.
- "Reverse time and resurrect all dead villagers" → unsupported, not renamed as 5% faster construction.

## LLM response contract

Structured union:
- supported with 1–3 AST candidates and exact understood clause mapping;
- ambiguous with 1–2 concise clarification choices (not a long interrogation);
- partial with included/excluded semantics visible and explicit consent before commit;
- unsupported with precise unavailable concept and 2 closest **honestly related** alternatives;
- invalid/refused provider failure to offline fallback.

Model proposes candidates, never guarantees implementation, approval, safety or success. Never accept claimed numeric strength without recalculating rules power. Ground all referenced objects in scene + ontology. If a property is not executable, reject that clause. Narrative flavor separate from executed mechanics.

## Workflow

1. Player enters ≤240 chars claim, optionally selects region/landmark.
2. Client sends minimized scenario property registry, no secret/private data.
3. Server prompts model with approved ontology, output schema and examples + claim as untrusted data. Use structured output; no chain-of-thought request.
4. Candidate schema parse, semantic alignment/fidelity check (avoid a malicious or simply inaccurate mapping).
5. Engine compiler validates targets, energy/resource/cost/limits, conflicts and runtime safety stress. Unrepresentable clauses labeled.
6. UI shows card preview with literal claim, proposed actual effect, conditions, duration, social thresholds, side effects, costs, confidence and omissions.
7. Player confirms a specific hashed candidate; only then compose/seed via normal validated action. Confirmation bound to run revision and model interpretation ID (avoid stale confirmation).
8. Save canonical AST + compilation version and source provenance; replay never reinterprets the text.
9. On model/network timeout, show explicit offline limited composer with honest supported vocabulary.

## Complexity/cost controls

Interpretation once per edited text confirmation, not on every frame or spread event. Cache same normalized claim under ontology/context version. Avoid encouraging hundreds of re-rolls seeking overpower mechanics. Ambiguous can use one follow-up call; cap per run/day/cost and support local test mode.

## Semantic accuracy evaluation

150+ manually annotated cases spanning at least 8 new entity categories, negation and metaphor, context dependency, compound clauses, unrepresentable demands and prompt injection. Compare mock schema correctness separately from LIVE model:
- faithful accepted semantic mapping;
- unsupported abstention vs hallucinated fake effect;
- clauses preserved;
- object grounding accuracy;
- false positive rate for near-unrelated laws;
- mean/p95 latency and actual token cost.
Use eval scores to pick model tiers, not unmeasured "strongest" model preference. Add regression corpus for every observed misread.

## Tests

Mock: proper structured output, provider refusal, timeout, prompt injection, ambiguous, unsupported, stale, quota. Integration: three new user inputs yield materially distinct canonical physics after activation in at least two scenarios. Live smoke if configured: a surprising compound claim and nonsense unsupported one, record model and output redacted. No live key means mark LIVE unverified, NOT failure of local simulation.

## Gate

Novel freeform sentences are parsed more broadly than V1, unsupported semantics honestly acknowledged, and safe validated ASTs become real executable rules, with actual model-provider evidence where configured.
