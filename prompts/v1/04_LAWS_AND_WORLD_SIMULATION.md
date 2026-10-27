# Phase 04 — Turn belief into an observable, risky physical world

**Central quality gate:** When enough villagers believe a law, actual village physics and outcomes must change; when support collapses, the world must revert in a coherent way. The world cannot be a static backdrop with green progress bars.

## World model

Implement tile-based spatial world; 20–36 tiles each dimension is enough for slice, or smaller if legibility requires. Tile state includes terrain type, elevation, river path, water depth, moisture, fire intensity, fuel, vegetation, obstacles and landmarks. World entities include houses, bridge segments, farms, bell tower, beacon/torch locations, shelter/high ground, food/fuel stocks and villagers. Map systems should be simple, fast, testable and visually rich. No real CFD needed.

Time progresses in **integer days/ticks** with an event-driven hazard model. Represent floods with bounded flood-fill from river according to water level/elevation/barriers, fire with discrete bounded spread and wind, harvest/food as discrete stock changes. Every simulation effect must be deterministic and seedable. Distinct warnings at days 2/4/6 prevent untelegraphed instant death.

## The reality-rule registry

Each RuleDefinition is authored typed data/code with:
- stable id, title, exact player-facing claim text;
- supported region/landmark types and target selection requirements;
- activation pressure, deactivation pressure, ramp-up/cooldown/hysteresis;
- physically executable effect function, world conditions, bounded intensity;
- legible success and failure feedback;
- balancing costs / adverse effects; contradictory groups and precedence;
- deterministic test fixtures and scenarios.

Rules DO NOT accept arbitrary natural-language effects from an LLM. No "the river is whatever the AI says." Claim cards map to known validated effect IDs.

Implement at least these three **fully functional** rules for the first scenario:
- RIVER_FEARS_FIRE: a sufficient belief among riverbank population causes active fire beacons to repel/re-route some flood advance within a bounded radius while consuming fuel and increasing fire hazard; a fully submerged beacon is ineffective; a law alone without beacon placement should not instantly drain the river.
- BRIDGE_STANDS_WHEN_WATCHED: with enough faith + currently present watchers, bridge segments resist flood damage; watchers are removed from other duties, bridge traffic capacity remains bounded; a deserted bridge can still fail.
- RAIN_HEEDS_BELLS: bell tower action when belief active modifies rainfall distribution locally and risks flooding another district; bound total rainfall (approximately conserved) rather than conjuring infinite/negative water.

Implement more rules as later content warrants: crops responding to moonlight, wolves repelled by smoke, praise-lightened stone, and variants in 07. Multiple rules may operate on distinct regions; conflict priority must be explicit. Use a competing-claims registry, not strings matched by substring.

## Physical consequences that matter

Examples of consequence paths:
- Beacons push water away from homes **but** nearby crops may catch fire.
- Witness-preserved bridge enables evacuations **but** demands citizens watching it while farms are unstaffed.
- Bells move rain from one bank to another **but** water may bury a supply route.
- A counter-belief suppresses a protective law on the exact day it is needed.
- Strong propaganda generates distrust, decreasing future message impact.
- Villagers personally witnessing a law become more convinced, but the effect must saturate to avoid self-sustaining unstoppable runaway.

Visual map should reveal: rising river depth, moving flood edge, damaged houses, burning farms, flood refuge, bridge condition, active beacons and law effects. Show provenance with popup: "This water did not enter Eastbank because RIVER_FEARS_FIRE was active (72% support, 2 lit beacons); risk: adjacent wheat ignited."

## Crisis forecast and fair information

Give players at least 1–2-day advance credible hazard forecasts; don't perfectly reveal all randomness, but distinguish **known system mechanics** from **uncertain consequences**. Highlight endangered homes, evacuation routes and estimated confidence of mitigation actions. Let players prepare; prevent hidden daily instant-loss dice.

Define threat clocks, severity, deadlines and objectives in content. Every death, damage or food failure must appear in event log with clear causation and last chance warning where practicable.

## Ticks, conflicts, invariants

Implement deterministic 2-phase update:
- Social engine resolves and produces law support snapshots.
- Law resolver applies hysteresis, contradictions and availability.
- Physical rule hooks modify hazard movement and resources in a stable order.
- Global world effects and per-landmark effects resolve.
- Evaluate objectives and schedule next warnings.

Invariants:
- Resource counts, inhabitants, food, building HP >= 0; water bounded; no duplication.
- No negative costs/overflow; all values finite.
- Changing a belief cannot affect unrelated claims without explicit mechanism.
- Contradictions cannot leave mutually exclusive rules fully active at same landmark without designed conflict behavior.
- No infinite spread or recursive re-trigger within one day.
- If a law deactivates, already-completed world outcomes aren't magically undone (a burned farm stays burned).
- Same seed/actions reproduce matching physical state/event log.

## Test and visualize

Create fixture that holds inputs constant, then toggles a law's activation by changing only belief support. Assert map/flood/bridge path differs in the predicted direction. Show 2 distinct screenshots in development or scripted render if tooling permits. Test combined law conflicts and reversing law. Measure turn resolution time for 100 agents / 40 claims; keep budgets suitable for mobile.

## Acceptance

A player can convince villagers, witness a Law activate and see an actual altered flood/fire/bridge outcome. Both benefits and side effects appear on map and in log. Rule activation/deactivation is stable, contestable and deterministic; tests prove it. No floating claims-only HUD masquerading as world simulation.