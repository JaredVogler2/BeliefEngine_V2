# Phase 04 — Design a universal *compositional* magical law language

## Goal

Expand V1's finite subject/effect/trigger triple into a versioned **typed, data-only rule language (DSL)** capable of combining reusable effects over real entities. A language model interprets sentences but only this DSL executes. Finite primitives imply finite computational affordances; don't claim literal unlimited physics.

## Canonical AST

Define typed, discriminated AST v2:
- Claim: id, literal text, author, source provenance, creation day, language version, clauses, supported/unsupported meaning, region, source witnesses.
- Selector: entity type, tags, state filters, explicit ID, spatial query, structural material, social group, distance from landmark, relationship properties. Validate selector bound/cost.
- Trigger: physical event (bell rang, flame lit, rain, sunrise/night, item touched, witnessed evidence, conversation), state threshold, elapsed tick, AND/OR/NOT (limit nesting), spatial contact, belief support condition separate from player-authored trigger.
- Effect: primitive id and type-safe parameter units; target selector; magnitude/radius/duration/frequency; material/energy/cost budget; side effect and severity.
- Compound: max clauses (start 2, then 3), bounded nesting, operators with clear conflict semantics.
- Region/scoping; global effects unavailable in balanced mode by default.
- Safety/balance metadata; status; support/vote rules and AST checksum.
- Represent explicit omissions/ambiguity, do not silently discard core clauses.

## Extensible ontology

Implement entity/property registry **from actual scene and simulation**:
- water/river/rain, stone/wood/metal, soil/forest/crops, fire/smoke/air, buildings/bridge/roads, villagers/animals, light/sound/temperature, food/health, tools/containers, faction/trust.
- For entities not currently modeled (chickens, shadows, clocks), distinguish **spawnable prefab exists**, **simulatable nonvisual logical state**, and **unsupported**. To claim chickens can fly, chickens must exist with actual movement/collision/vfx—not a renamed wolf spell.
- Physical properties include mass, velocity/force, position, structural HP, temperature, moisture, fertility, flammability, durability, visibility, flow, inventory, lifespan, status effects; units/ranges.
- Social properties include willingness, risk tolerance, attention, trust, belief pressure, morale, obligations; NPC changes via validated intentions/influence, not direct "all believe" override.
- Material transforms require conservation/cost or creative sandbox explicitly unranked.

## Operators (start with 12 functional, expand after tests)

APPLY_FORCE, REDIRECT_FLOW, ALTER_GRAVITY_LOCAL, SET_MATERIAL_PROPERTY, TRANSFORM_MATERIAL, GROW_ENTITY, DECAY_ENTITY, ALTER_TEMPERATURE, CHANGE_LIGHT, MODIFY_DURABILITY, MODIFY_VISIBILITY, MODIFY_MOVEMENT, INFLUENCE_MOTIVATION (not direct conviction), SPAWN_BOUNDED_ENTITY (only curated prefabs), MOVE_TOWARD/AWAY, WEATHER_MODIFIER, MODIFY_STRUCTURE_CONNECTION, RELOCATE_RESOURCE (conservation), GIVE_STATUS_EFFECT.

At least six materially different categories must execute by first V2 milestone. Every operator defines units, allowed targets, legal ranges, tick order, cost, causal log text, optional 3D visualization adapter, irreversible/temporary consequences, and rollback/persistence. No operator can create unbounded recursion or infinity.

## Validation/compiler

JSON schema + Zod/type runtime check of AST shape, primitive effect-type compatibility, physics preconditions, target existence or supported type, region and duration constraints, scalar budget, combinator limits, contradictions. Use stable canonicalization and semantic/version checks. Maintain v1 migration: legacy claims convert to v2 AST with exactly equivalent effects and hashes or an explicit legacy executor bridge for old replays. No mutating old save silently.

Build interactive mechanics preview:
- what exact property changes, on whom, where and when;
- social support needed, physical catalysts and resources;
- measurable upside/downside;
- clauses not represented, plus "Choose alternative" / "Cancel".
A description of "time reversal" must NOT map to faster crop growth.

## Adversarial corpus

Create ≥150 sentence cases: synonyms, negations, conditionals, relative references, quantifiers, multi-clause, poetic phrasing, contradictory claims, physically incompatible effects, unknown targets, global infinity, temporal paradox, social coercion and injected instructions. Expected faithful parse or explicit abstention. Versioned fixtures for model eval.

## Gate

Typed AST v2 is buildable, validated, deterministic, migration-compatible, and expresses at least three distinctly novel mechanically testable claims that V1 could not. No provider API needed to execute a validated AST. Unit and property tests green.
