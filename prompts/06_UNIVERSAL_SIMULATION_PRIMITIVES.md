# Phase 06 — Build a composable deterministic physical-rule executor

## Core idea

Do not ask an LLM to modify game code when someone invents a belief. Create a **safe library of composable physical operations** and a compiler into executable declarative RulePlan. Existing V1 effects remain supported. RulePlan is interpreted by known engine code, not eval or generated source.

## Runtime

Implement RuleRegistry with typed operations and capability checks. At each engine day/tick:
- Read canonical world snapshot, active social belief laws, material attributes and event stream.
- Evaluate triggers against event provenance and physical state in stable order.
- Resolve target selector to finite entities/tiles, cap spatial scope/number touched.
- Collect intended effect deltas without directly mutating during iteration.
- Apply priority/contradiction rules and side effects in fixed order.
- Modify canonical world state, emit structured reasons and before/after change records.
- Render layer consumes read-only result; it cannot decide physical outcomes.
- On deactivation, temporary fields expire but irreversible changes persist.
- Engine uses seeded deterministic RNG; GPU particles never affect outcome.

## Implement functional operators

Initial six mandatory end-to-end families:
1. **Dynamics**: apply bounded force/velocity to supported movable entities; grounded collision/movement (logical state or optional Rapier simulation); example bell gives chickens temporary lift.
2. **Hydrology**: redirect/slow/repel floodwater within terrain geometry, with conservation/alternate flow and flood consequences.
3. **Materials**: change density, hardness, flammability, permeability or visible material in compatible objects, with an explicit resource/cost/temporary-or-permanent policy.
4. **Growth/ecology**: alter crop growth, plant growth, fertility, decay, water demand, biomass caps.
5. **Thermal/energy**: raise/lower temperature, ignition susceptibility, fire propagation/heat; no negative thermal energy loops.
6. **Structure/behavior**: strengthen bridge/house, weaken foundations, modify villager incentives without directly overwriting personal opinions.

Then extend to light/sound/visibility/status/limited spawn/movement. Every effect needs actual input targets, unit conventions and measurable outcome. Add at least 2 new entity archetypes missing in V1 (e.g. chickens, loose movable stones) with simple legal mechanics and 3D representation. If asset absent, mark unsupported rather than pretend.

## Triggers & combinations

Trigger evaluator recognizes bell sounds, beacons, proximity, rain, nighttime, contact, object properties, witnessed statements and other versioned game events. Support bounded AND/OR/NOT, radius/elevation filters, and two clauses with different targets. Prevent infinite re-trigger loops: event provenance, cooldown, recursion cap, per-day event budget. A rule cannot trigger itself without a one-way bounded rule and tested convergence.

Contradictions: two laws pushing the same property opposite directions resolve through normalized support weighted competition, not undefined last-write-wins. Rule activation requires true local population support and a real catalyst. Structured action log shows which belief altered an entity. Define whether support decay/physical reversal happens over days; hysteresis prevents flicker.

## Game balance

Calculate effect power from affected volume, magnitude, duration, ease of condition, scope and positive/negative externalities. Stronger beliefs require greater social adoption, catalysts, AP, side effects, shorter duration or lower reach. Defaults bounded. Sandbox can relax some caps but never CPU/memory/safety constraints and remains unranked. No instant mass conversion, total immortality in ranked mode, infinite money/food or 10,000 spawned entities.

## Implementation structure

New src/engine/reality: schema.ts, registry.ts, selectors.ts, triggers.ts, compile.ts, evaluate.ts, apply.ts, conflict.ts, budget.ts, diagnostics.ts. Extend core/world entity attribute model carefully using versioned migration, preserving V1 law adapter with exact numerical equivalence where applicable. Optional Rapier is for physics support where cost justified, not mandatory 3D-wide engine rewrite.

## Verification

- Same seed + state + RulePlan + events yields exact state hash.
- Three novel user claims have different world-changing effects on same seed; at least one compound.
- Contradiction, event loop, zero targets, extreme radius, invalid object attribute, NaN, decay, save/load and replay tests.
- Regression against original Redbank/Harvest/Ashwood and MCP traces.
- Fast enough on mobile for 40–100 villagers/20 rules without stalling.
- Manual browser interaction from belief activation to visibly changed mesh.

## Gate

New rules truly alter a generalized world, and the LLM cannot create an effect for which no executable operator exists. Physics schema, engine tests, 3D effect contracts committed.
