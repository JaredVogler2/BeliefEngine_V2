# Content schema

Scenarios are **data**. A scenario is a `ScenarioDef` (`src/engine/content/types.ts`):

```
ScenarioDef {
  runtime: ScenarioRuntime   // id, version, name, tagline, briefing, durationDays, claimDefs, rituals, threat[], objectives[],
                             // rivals[], beats[], features{}, consts{}, score weights, anchor landmark, starters[], hints[]
  map: MapDef                // w, h, ops[] (terrain / elevation gradients / bumps), regions[], landmarks[], stocks{}
  villagers: VillagerDef[]   // id, name, role, archetype, faction, household, home, work, want, traits overrides, trust
  edges: EdgeDef[]           // a, b, ab, ba (trust each way, -100..100), rate (0..1), kind
  factions: Faction[]
  ap: { start, perDay, max }
  jitter: number[]           // bounded seeded deviation of the actual threat schedule from the forecast
}
```

* **Claims** (`ClaimDef`) reference a **RuleSpec** (`src/engine/core/types.ts`): `subject x effect x trigger x radius x intensity x
  thresholds x upkeep x side effects`. Authored rules live in `src/engine/laws/rules.ts`; `validateSpec` rejects impossible
  pairings (e.g. a bridge cannot "grow"), out-of-range numbers and unknown side effects. Effects are executed by the fixed table in
  `laws/effects.ts`, never by free text.
* **Rituals** (`RitualDef`) bind a landmark kind to a physical action, an omen function, witness radius and strength.
* **Threat schedule** (`ThreatDay[]`) is the visible forecast; `jitter` bounds any hidden variation.
* **Objectives** are metrics (`alive`, `homes`, `food`, ...) with `>=`/`<=` thresholds, `required`, `instantLoss`, `heroic`.

## Validation strategy
1. TypeScript types at compile time.
2. `validateScenario()` (`src/engine/content/validate.ts`, run in unit tests for every registered scenario) checks referential
   integrity: every villager's home/work exists, every edge endpoint exists, every claim's rule is valid, every ritual landmark kind
   exists, the Keeper anchor exists, regions cover landmarks, objectives use known metrics, starters are claims.
3. Saves are validated structurally on load (`save/serialize.ts`) and rejected with a clear message rather than crashing.
4. Seeds and share links are validated (`App.tsx`): integer in 0..2^31-1, known scenario, difficulty enum.

## Versioning
`SCHEMA_VERSION` (save format) and `RULES_VERSION` (simulation rules) are written into every save and every share link. A
newer-schema save is refused politely. Because `RunState` embeds the scenario block and any player-composed claim definitions,
old saves keep replaying with the rules they were created under.
