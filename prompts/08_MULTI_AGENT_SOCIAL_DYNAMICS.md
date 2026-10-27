# Phase 08 — Make generative social behavior strategically consequential

## From dialogue to actual society

NPC conversations cannot be superficial flavor. They must create real legal actions: share claim with selected contact, request evidence, make competing claims, rally faction, challenge story, stage a demonstration or withdraw from risky activity. Every outcome interacts with V1 trust network, occupation, geography, social reach, memory and factions.

## Social resolution plan

1. Player introduces claim to a specific witness/meeting with cost and location.
2. Villagers decide likely interest based on needs, beliefs, relationships and recent events.
3. Routine gossip spreads over V1 weighted trust graph with bounded deterministic edges.
4. Salient conflict triggers selective model reasoning; agents propose actions and rationales.
5. Server validates legal intentions, records external proposals with source and version.
6. Game engine applies persuasion/counterargument/evidence based on actual contact and authority. MODEL DOES NOT SET CONVICTION DIRECTLY.
7. Physical evidence causes belief shifts in witnesses and can propagate.
8. Laws activate only when threshold/stability/independent witnesses/catalysts actually meet.
9. Return a clear journal of who influenced whom, why, and downstream reality change.

## Emergence with guardrails

Create 3+ faction archetypes (empiricists, mystics, merchants/civic council) with different incentives. Roster 12–20 actors in real authored scenario; 6 salient model-invoked characters per run. Memory and social shocks should cause opposing reaction. Examples:
- Skeptic requests test; eyewitness evidence converts them, changing connected neighbors.
- Mayor spreads competing claim because market is damaged; player can negotiate truth test.
- A fisherman sees water divert and tells west bank, while isolated east bank remains doubtful.
- Villager knowingly lies to save family; discovery reduces trust and triggers rebuttal.
- Two seemingly beneficial laws conflict, requiring the player to choose which coalition to cultivate.

Avoid LLM inventing physics outcomes. For hallucinated proposals, return error to model no more than one correction then fallback. NPC spontaneous new claims use SAME interpreter DSL and social AP constraints; gate to avoid hundreds of expensive claims or unbearable unfair adversary capabilities. Make spontaneous claims rare, forecastable, contestable and bounded.

## Narrative system

Dialogue anchored to actual scenarios and memories. Build small event types with optional model-authored localized lines but stable recorded event IDs. Never compose a long monologue in the middle of a tactical turn. UX shows 1–2 sentences and 1–3 action choices. Player can inspect evidence provenance, what characters believe vs know, trust edge changes, supporter independence and risks.

## Decisions and fairness

Villagers have limited actions/day and social exposure rates. Model may propose a convincing argument but actual social success depends on skepticism/trust/evidence. Do not let an LLM player have more authority than a human. Social simulation remains stable and bounded with 100 agents / 30 active laws. Opponent should telegraph major rebuttals. Same seed+recorded decisions replay exactly.

## Validation

Paired tests: identical seed and player claim with different social evidence yields different, explainable NPC decisions; same saved memory + mocked response yields stable state. Bridge destroyed stops gossip cross-bank absent alternate route; NPC does not magically know a private testimony; disbelief/humor/contradictions functional. Model call count bounded per simulation day. One real provider run makes faction behaviors observably different from deterministic fallback and records verified intents. Standard authored win/loss still reachable.

## Gate

Actual multi-agent emergent behavior demonstrably changes gameplay choices and results while preserving fair and explainable rules, not just more colorful chat bubbles.
