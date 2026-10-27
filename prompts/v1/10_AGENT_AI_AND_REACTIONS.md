# Phase 10 — Make villagers feel clever, social, and inconvenient

Use deterministic, inspectable **behavioral agents**, not offsite language models. Citizens should have a little life and purpose even when the player does nothing. Their decisions must create fun puzzles, not random annoyance. Retain exact seed replay.

## Behavioral model: competing needs and social influence

For each villager derive utility scores for eligible intents:
- Work (farm/mill/market), seek safety, care for family, observe an event, spread gossip, confront rumor, stage evidence, guard bridge, attend gathering, flee hazard, rest, recover.
- Utility combines immediate need (food, health, safety), relationship/faction duty, claimed law incentives, location/path travel cost, morale/stress, memory and fixed persona preferences.
- Choose highest expected utility with deterministic tie-breaking and small bounded seeded exploration.
- Expose **why** in UI: "Mara left the bridge because her daughter was in danger, so the Watchful Bridge law weakened."

Actions need observable world implications. Not every NPC runs full pathfinding every frame; calculate at discrete social/world resolution, animate movement between stable locations.

## Social factions and political counterplay

At least three reusable faction templates: Civic Council (stability/legitimacy), Skeptics/Scholars (evidence), Storykeepers/Traditionalists (consensus/narrative). In authored scenarios, contextualize names and priorities. Factions are not one-dimensional heroes/villains. Each may support a beneficial law when appropriately motivated.

Faction state includes leader, supporters, shared priorities, trust in player, tolerated rumors, grievances, action budget/cooldown, recent player behavior. They may:
- publicly endorse, undermine or require evidence;
- hold gatherings that transfer influence;
- propose a pact/compromise, taxing a different resource;
- expose a player's failed demonstration;
- block access to landmark if distrust is high;
- relocate from hazard and disrupt social connectivity.

Every antagonist action must be **forecast in principle** (e.g. "the council is preparing a rebuttal") and logged with reason. Don't let NPCs silently undo a week's work through an invisible random strike. Give meaningful counters to rival moves.

## Evidence and consequences matter

A critic should become convinced by strong firsthand evidence, but not at 100% probability every time. Charismatic leaders should spread claims rapidly but suffer credibility damage when refuted. Fear during disaster may accelerate adoption of helpful claims while making counter-rumors volatile.

Simple bounded memory:
- Evidence type, location, date, witnesses, credibility.
- Public failures and broken promises reduce trust in originator.
- Repeated unsupported messages get fatigue penalty.
- Local successes increase validation for that law, but capped feedback.
- Some residents remember collateral harm and oppose future broad claims.

Prevent unbounded memory growth with per-villager capped event history and aggregate memory values. No arbitrary model-generated insults or toxic text; authored templates are sufficient.

## Player options to respond

Give player counterstrategy: build an evidence trail; convince a trusted neutral broker; fulfill a request; stage targeted demonstrations; shift physical access to a population; accept a compromise; divide law regions; sacrifice one objective to save another. Some challenges should be easier through **quiet targeted persuasion** than maximum broadcasting.

## Human-readability and drama

Implement short callout templates tied to actual state:
- "Ivo trusts you, but not your witness."
- "The west bank hears the rumor; the east bank still doubts."
- "Mara saw the bridge survive. Her conviction changes."
- "The council will challenge your evidence tomorrow."
- "Two towns believe opposite things. Both currents pull the river."

Portrait reactions, location shifts, rumor ripple animations and tone should support, not replace, the rules.

## Test adversarial interactions

- Same seed/action history → same NPC decisions; replay stable.
- A threatened parent prefers evacuating family over attending optional gathering within sensible utility bounds.
- A skeptical witness changes belief more from staged direct evidence than repeated unsupported message.
- If bridge destroyed, villagers cannot teleport to the other side.
- Faction leader cannot spend infinite response budget or counter every action.
- Player has at least one actionable response to each hostile event; some choices may reasonably be costly.
- No self-sustaining infinite rumor loop, rage spiral or deadlock; cap turns and event recursion.

## Exit requirements

At least one scenario features a rival faction making two observable, counterable decisions based on **player behavior**, not merely the day number. NPCs visibly change duties and locations for logical reasons. Social graph and environment meaningfully influence each other. Tests and playable E2E continue passing. Commit the system and concise balancing notes.