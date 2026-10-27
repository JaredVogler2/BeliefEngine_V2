# Phase 08 — Create a replayable roguelite, not five levels with random names

**Goal:** make every new run offer a different solvable strategic puzzle while preserving clear causal mechanics. Replayability must come from altered graph structures, crisis interactions, resource scarcity and policy tradeoffs—not randomizing villager hair color or changing numerical difficulty alone.

## Three play modes

1. **Story Chapters**: handcrafted scenarios and branching outcomes, accessible replay with alternative seeded conditions.
2. **Expeditions**: 12–25 minute seeded procedural villages with variable crisis combinations and available law set.
3. **Daily Village**: deterministic date-based seed (explicit UTC date convention) and fixed difficulty so players can compare/share without server. Offline best-score records; no false global leaderboard.

Optional later: custom seed input and community challenge link with URL-safe, versioned state descriptor.

## Generator: constrained composition pipeline

Generate in stable order from seed and rulesetVersion:
A. Choose map biome/size, elevation, river/road layout, safety locations and buildable region.
B. Generate homes, farms, shelters, infrastructure and physical routes with path connectivity checks.
C. Choose population (12–24 for normal), roles and homes; form households, professions and two/three community clusters.
D. Generate sparse social graph with guaranteed cross-cluster connectors and at least one meaningful bottleneck.
E. Choose primary disaster, secondary pressure, deadlines and forecast.
F. Choose small claim pool (say 5–8) such that one or more combinations can respond to chosen crisis, including real side effects.
G. Seed initial beliefs, skeptic faction, rival incentives and early accessible evidence locations.
H. Validate solvability and difficulty; reject/regenerate broken instances with bounded retries and fallback to known curated seeds.
I. Emit run blueprint + content/schema version hash; make it shareable and reproducible.

## Do not generate impossible or trivially uninteresting maps

Invariants:
- A viable road or rescue route exists by initial conditions (unless explicit bridge repair is a designed mechanic).
- Key claims are available before deadlines with enough AP and communication reach to activate.
- At least two sufficiently distinct strategies should be theoretically viable for normal difficulty; witness via solver or constrained scripted planners, and store traces.
- Secondary disaster never makes victory arithmetically impossible before the player acts.
- No trivial day-one free win or inevitable hidden sudden death.
- Physical effect radii and social network positions permit actual meaningful influence.
- A player can always inspect at least one useful next action or intentionally end a day.
- Puzzle seeds are repeatable and never rely on uncontrolled ambient Math.random().

Implement a **constructive baseline planner** or search:
- Search bounded action candidates using approximate simulation/macro-actions (beam search, MCTS-light, heuristic search, or compact action templates).
- Aim to find a credible win path for at least one approach, and preferably two structurally distinct approaches. A verified witness is stronger than a naive difficulty predictor.
- Limit generation compute on mobile: precompute or sample from curated seeds, and cap validation iterations with fallback.
- Do NOT call an external LLM or paid cloud endpoint to generate a level.
- Log rejected seed reasons for offline analysis, not display raw dev logs to users.

## Variety that changes decisions

Implement **run modifiers** (at least 10, draw 1–3 per run) such as:
- Cross-bank mistrust: relationship weights shift and bridge becomes social chokepoint.
- Soot season: beacons are strong but farms more flammable.
- Busy harvest: villagers reluctant to gather; labor shortages harsher.
- Traveling circus: temporary charismatic source increases gossip but carries spurious rival rumors.
- Silent bells: tower unreliable until repaired.
- Overcrowded refuge: evacuation safe capacity becomes scarce.
- Low fuel: fire approach costly, bridge route more appealing.
- Doubting scholars: evidence stronger than sheer repetitions.
- Stubborn elders: slower adoption but active laws decay more slowly.
- Divided council: rival faction can sabotage mass gatherings.
- Clear night skies: moonlight crops stronger.
- River of reeds: water diversion easier but unpredictable side-channel.

Each modifier MUST impact state, decision opportunities, risk and UI explanation, and be covered by at least one test. Variety can also include claim combinations and environmental topologies; avoid universal buffs with no tradeoffs.

## Encounters and escalating challenge

A run should have a clear arc: first setup, middle disruption, closing crisis, climax. Threat clocks must be visible. Introduce rival events via probability conditioned on state with weighted deterministic draws, bounded to avoid impossible stacked crises. At least one late-game adaptation prompts a tactical pivot in successful runs.

## Deterministic daily / sharing

Support:
- Exact seed and ruleset version displayed on debrief and optionally HUD.
- Same settings/seed produce same generator output and same resolution of identical action sequences.
- "Replay this village", "Different village", "Today's challenge" flows.
- Share link containing **seed + version + mode only**; don't include untrusted serialized state as executable code. Validate query parameters and gracefully handle missing old versions.
- Local result archive with best score and selected summary, migration strategy.
- Tie-breaking and clock handling: daily challenge date is from UTC (documented) and does not change mid-run.

## Anti-repetition / content health

Maintain generated gameplay signatures (map choke topology, chosen rules, crisis, faction traits). Enforce minimum variety in a small cohort of successive seeds without ruining reproducibility (can use deterministic shuffle bag). Don't claim infinite unique gameplay. Analyze distribution: target meaningful divergence in first 4 days, not just minor numeric changes.

## Verification requirements

- Generate 1,000+ normal seeds offline; 0 invalid states, 0 hard crashes, 0 unresolved generator loops; document solvability estimate and known false negatives.
- At least 95% (aspirational) generated normal seeds have **an automated found win witness**, or use only validated curated seed catalog at launch. Do NOT advertise guaranteed solvability if not proven.
- Replays identical under same seeded command sequence; vary with changed seed.
- At least 10 modifiers work with concrete changes.
- End-to-end daily, replay, share, new seed and save/load tests pass.
- Test that different action plans on same seed affect both social and physical end state.
- Measure median generation time on low-end mobile and use cache/precomputation if needed.

Update docs/BALANCE_REPORT.md with actual generation data; commit before proceeding.