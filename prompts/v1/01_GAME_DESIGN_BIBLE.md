# Phase 01 — Lock the playable game design and simulation contracts

Read 00_MASTER_GOAL.md. Produce **implemented-data-friendly rules**, not a sprawling narrative. The phase ends with docs/GAME_RULES.md, docs/CONTENT_SCHEMA.md, scenario sketches, deterministic acceptance test fixtures and an updated progress entry. Avoid writing a fake game or making a demo that only animates labels.

## The player fantasy and core loop

Player is the **Keeper of Stories** of a settlement. The player influences beliefs but **cannot directly operate the world's physics**. Each run presents:
- One primary imminent disaster and one escalating secondary complication.
- A small cast with explainable relationships, biases, needs and believable locations.
- A finite hand/pool of available **Claim** cards, each a testable hypothesis about the world.
- A limited pool of **Influence** action points (suggest initial 3 per day, cap 5; tune).
- Physical landmarks whose behavior changes when a claim becomes a collective **Law**.
- Multiple victory routes, and hostile or ambiguous actors with counteragendas.

Loop: Read threat and village → inspect characters & claims → plan influence actions and previews → commit/end day → social propagation and physical simulation → inspect outcomes/side effects → adapt → resolve victory/loss → debrief and retry. A new player should be able to complete one action before receiving a lecture.

## Required planning/actions

Model each action with costs, targets, exact preconditions, deterministic effects, previews and an event-log narrative:
1. **Seed a Rumor**: inject a chosen claim to a villager or crowd; costs Influence; succeeds/fails based on trust and disposition, not automatic full belief.
2. **Stage Evidence**: arrange a legal, local observation for one claim at a landmark; costs Influence and requires conditions. Genuine visible events are more credible than unsupported repetition; events can backfire.
3. **Amplify/Messenger**: ask a believer to carry a claim across their social neighborhood or to a specific influential person; graph topology matters.
4. **Convene a Gathering**: expose several reachable people at once, but opponents may counter and skepticism rises if overused.
5. **Challenge/Counter**: contest a competing rumor, using evidence or messenger; may erode both claims when evidence weak.
6. **Scout/Inspect**: show relevant trust, belief thresholds, reasons, next threat; no cost (with one free tactical briefing/day if necessary).
7. **End Day**: explicit commit, event summary, no hidden progression while player plans; optional reversible planned actions prior to commit, not timeline-scumming after RNG resolution.

Action design MUST include meaningful risk (exposure, distrust, rival response, resource cost, geographical access). No spam-winning loop. Implement 4–5 actions for the first slice; remainder progressively.

## Daily structure and timing

Use integer day index with **Planning → Social Resolution → World Resolution → Debrief**. Within resolution process:
A. queued actions in declared stable order,
B. exposure and memory updates,
C. discrete propagation across graph edges,
D. evidence/skepticism update,
E. social pressure/contradiction resolution,
F. activation or decay of physical laws,
G. physical hazards & resource updates,
H. rival reactions,
I. threat and win/loss evaluation.
All randomness draws must be seeded, domain-separated if practical, logged or reproducible. No real wall-clock dependency in simulation.

## Formal core data model

Specify TypeScript interfaces with these concepts (names may differ but semantics must hold):
- RunState: schemaVersion, seed, PRNG state, day, phase, difficulty, AP, remainingThreats, villagers, map, claims, laws, factions, objectives, event log, stats, outcome.
- Villager: id, name, role, location, household, needs, skepticism [0,1], conviction per claim [-1,+1], exposure memory (sources/time), trust edges signed [-1,+1], susceptibility, agenda, social influence weight, current action/status.
- Claim: id, text, icon, ruleId, target region, evidence type, originator, propagationModifier, positive/negative side effects, contradictions, availability.
- Law: id, claimId, region, activation progress, onThreshold, offThreshold (hysteresis), stability, cooldown, intensity, side effect parameters, affected tiles/entities.
- SocialEdge: endpoints, trust, interaction rate, geography modifier, relationship category. A negative edge can increase skepticism/hostility; NEVER blindly count it as support.
- Landmark: type, position, hazard exposure, functional state, rule hooks.
- Threat: trigger/deadline, severity, forecast, mitigation methods, failure impact, warnings.
- Action: type, actor, target, claim/region payload, AP cost, feasibility/preview, event.
- Event: stable id, day/step, actor, claim, location, reason code, before/after deltas, visibility, text template.

Use **integer or fixed precision** for scoring and deterministic threshold comparisons if needed. Clamp finite numerical values. Never allow NaN/infinite values.

## Belief propagation math, initially simple and explainable

Start with a transparent bounded update; tune after tests. Candidate:
change(v,c) = Σ_neighbors [edgeTrust × communicationWeight × persuasion × sourceConviction × novelty × proximity] + evidenceSignal − resistance − fatigue + seededNoise.
Clamp conviction to [-100,100]. Only communicate claims villagers have encountered; avoid omniscient transmission. Model source credibility, repeated exposure diminishing returns, counterevidence, local trust and persona traits. Gossip is an **edge-mediated process**, not uniform global spread.

An initial Law activation rule: supportPressure = Σ(positive conviction × local influence × eligibility) / Σ(local influence × normalizer); threshold approximately 0.60, and at least two independently connected local supporters (avoid single influencer instant-win); off threshold ~0.45 for hysteresis; warn near activation. These are **design starting points**, not canonical values until tested. Define achievable activation by the crisis clock. Cap rumor volume/performance.

## Six introductory claim/law examples (bounded and visually testable)

1. "The river is frightened by fire": lit beacons repel floodwater along nearby exposed banks; risks burnable farms and resource cost.
2. "A bridge never breaks while watched": enough witnesses and law pressure prevent bridge structural failure; guards watching bridge are unavailable for relief work.
3. "Rain answers the village bells": bell-ringing redirects or concentrates rainfall over target tiles; risk mudslides or crop drowning.
4. "Moonlight ripens grain": crops grow overnight under exposed sky; nocturnal gathering disrupts sleep and health.
5. "Smoke hides us from hungry wolves": smoke discourages predators but decreases visibility and breathing safety.
6. "Stone grows light when praised": relocate rubble/create levees, but old stone structures become unstable.

Each rule needs an explicit **region, duration, range, intensity, countermeasure and observable cost**, with a simple explanation. Claims should never create arbitrary output from free text. There must be at least two pairs that directly compete on the same resource/landmark.

## Scenario 1: Flood at Redbank (canonical vertical slice)

Map: small readable river village of 12–16 agents with east/west neighborhoods, homes, farms, bridge, bell tower, beacon points and shelter. Days 1–7, flood escalates with visible forecast; announce an approaching major surge from day 1. Rival skeptic may campaign against a rumor but is persuadable by staged evidence. **Win:** enough villagers remain safe and the settlement sustains minimum essential resources at day 7; **Loss:** catastrophic housing/person loss or irreversible food shortage. Define precise numeric thresholds in actual scenario data, not only prose.

At least two designed, fully simulated routes:
- Route A: build fire-averse river belief, fuel beacons, redirect surge from populated bank, manage fire hazard.
- Route B: strengthen witnessed bridge, evacuate across it to high ground and preserve supply deliveries.
Route C (stretch): rain-bell manipulation / complementary mixed approach. **Verify both A and B with executable strategies**, not just hypothetical stories.

Teach within the run: "A claim is introduced" → "Villagers pass it along existing trust ties" → "Enough people believe" → "Law changes the map" → "An opposing claim / consequence disrupts it."

## Content/UX rules

Avoid walls of text and unexplained meters. Every sentence in tutorial should attach to an immediate action. No random names/icons where narrative identity is important. Build 12–16 distinct villagers with role-dependent affinity/trust and 2 factions initially. Character cards should answer: **What do they believe? Why? Whom do they trust? What can I do?** A law card should answer: **What changes? How close to active? What threatens it? What will it cost?**

## Victory and replay incentives

Track a per-run score based on civilian survival, retained food, preserved buildings, time/Influence efficiency, social harmony, unused crisis resources and strategic accomplishments. Do not reveal irrelevant decimal precision. Debrief must show decisive social→physical chain(s), avoid judging solely by points. Allow immediate restart with seed and new randomized seed. Later phase unlocks must **increase expressive tactical options**, not require hours of repetition to have a fair chance.

## Phase acceptance

- Author docs/GAME_RULES.md with exact AP economy, tick order, thresholds, objective definitions, at least six law definitions and their costs.
- Author docs/CONTENT_SCHEMA.md containing the content data contract and validation strategy.
- Produce data fixtures or explicit test plan for two distinct Flood victory strategies and a credible loss.
- Identify dominant/exploitable tactics and define balancing tests.
- Distinguish shipped Phase 1 scope from planned later capabilities.
- Commit evidence; proceed to architecture. Do NOT assert playability until gameplay exists.