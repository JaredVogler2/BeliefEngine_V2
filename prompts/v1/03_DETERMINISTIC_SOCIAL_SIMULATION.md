# Phase 03 — Make the social network an actual strategic system

Build and test the authoritative **headless village belief engine**. Follow docs/GAME_RULES.md if it has been finalized; where it conflicts with this prompt, choose the better balanced system, document why, and prove it with tests. Do NOT simply animate gossip lines or generate "AI dialogue" without behavior changes.

## Villagers must have distinct strategic identities

At minimum, implement citizen properties: id, role, location, energy, skepticism, openness, stubbornness, susceptibility, social influence, claim-specific conviction, personally observed evidence, claim exposure history, needs, family obligations, faction alignment, and trusted/distrusted relationships. Include a small number of archetypes (witness-truster, charismatic preacher, skeptical scholar, stubborn elder, practical farmer, fearful parent, opportunistic trader), with meaningful parameters and visible UI language rather than opaque formulas.

Villagers should:
- Pass on claims only if they know them and communication opportunities exist.
- Prefer trusted contacts, nearby people and socially relevant topics.
- Sometimes question, distort or reject a claim, but in **bounded, inspectable ways**.
- Remember repetition, recognize contradicting evidence and have limited attention.
- Change availability by role, weather, safety, duties and location.
- Support or oppose multiple claims simultaneously, with finite attention/conviction capacity so not every rumor can be maximized.

The simulation must create **network leverage**. Persuading a connected bridge keeper should have different effects than persuading an isolated hermit. A skeptical scientist's public demonstration should beat repeating the same unsupported rumor to everyone.

## Mathematical model and determinism

Choose a normalized state convention and use it everywhere (e.g. integer conviction [-100,+100]). Derive per-tick update from a well-defined sequence:
1. Snapshot current known claims and social edges.
2. Generate contact opportunities using PRNG and visibility/location rules.
3. Collect belief exposures in a stable ordering. Prevent read/write order artifacts: exposures for a tick must be accumulated against the same snapshot.
4. For each receiver and claim, combine source conviction, receiver's trust in source, message novelty, topic interest, distance, susceptibility, competing belief, direct observation and saturation.
5. Apply bounded decay/confirmation and clamp.
6. Update exposure memory and logging.
7. Emit human-readable reason codes: FRIEND_TRUST, PUBLIC_DEMONSTRATION, CONTRADICTORY_WITNESS, FATIGUE, FACTION_PRESSURE, THREAT_PANIC, etc.
8. Recompute weighted local claim support and law pressure; do not activate physics within the social snapshot stage if formal order says afterward.

Be explicit about whether negative trust generates counter-belief, no influence or a reverse signal; test it. Avoid uncontrolled positive feedback. Include a switchable deterministic debug trace with per-agent, per-claim reason breakdown.

## Network geometry and game agency

Use a weighted, sparse, nonuniform connected graph with visible communities:
- Household ties (frequent/high trust);
- Profession and gathering ties (market, chapel, mill, bridge);
- Inter-neighborhood bridges and bottlenecks;
- Faction rivalry and negative relationships.

Render graph as optional social lens, not only as a force graph covering the village. Prefer stable positions anchored to geography. Distinguish influence rank, trust, exposure and conviction with accessible symbols/tooltips. Selecting a villager highlights reachable influential nodes and predicted range **as estimates**, not guaranteed outcomes.

Ensure **geographical fragmentation matters**. A flood can sever east/west contact, suppress gatherings and create information islands; a trusted messenger may restore spread if bridge remains intact. This links social dynamics to the physical strategy.

## Four required social mechanics

1. **Seeding**: new claim enters knowledge network at target, with immediate modest belief and attention.
2. **Witnessed evidence**: tangible localized event modifies convictions of actual witnesses and then propagates.
3. **Amplification**: a chosen messenger accelerates or broadens exposure and pays an opportunity cost.
4. **Counteraction**: skeptics or factions can resist/discount, and players can spend resources to challenge them.

Implement versions of optional gathering and scarcity mechanics if viable without delaying playable slice.

## What player must be able to inspect

For any citizen, provide a selector returning:
- Most strongly held beliefs / rejections.
- Top 1–3 explanations for recent change.
- Top trusted contacts and factions.
- Influence routes and social reach.
- Immediate needs and relevant availability.
- Evidence needed to change mind or upgrade conviction.

For each claim:
- Local and overall pressure; confidence and independence of supporters.
- Top influencers for/against, recent momentum.
- Which district is missing support, where evidence can be staged.
- Activated law status / decay forecast with uncertainty clearly labeled.

No perfect foresight; previews are deterministic model projections within limited horizon, with hidden rival agendas preserved fairly.

## Automated validation fixtures

- Same seed + same planned actions produce bit-identical canonical state and event hashes across repeated runs.
- Inserting array elements in alternate orders does not change state where intended.
- No exposure travels across disconnected graph component absent physical travel or broadcast.
- High-trust influential node accelerates spread versus equivalent isolated node, with statistical significance in a controlled seeded sample.
- Contradictory eyewitness evidence can reverse existing strong conviction with adequate repeated exposure.
- Exhaustive repeated rumor spam saturates rather than guaranteeing total conversion.
- Negative trust, null contacts, no known claim, missing village and cyclic graph terminate safely.
- A flood severing the bridge reduces cross-district communication.
- Reset/replay cleans all singleton state; no carryover from previous game.

## Acceptance

Ship engine/social modules, selectors, tests, a small debug simulation reachable from the UI, and visually verifiable gossip/conviction movements. At least one action must influence beliefs through actual trust edges rather than an arbitrary global score increment. Build/typecheck/tests pass and progress is committed.