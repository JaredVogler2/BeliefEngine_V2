# Phase 07 — Turn one clever mechanic into a memorable strategy campaign

Read existing code, scenario schema and all previous gates. Expand content ONLY after Flood at Redbank has demonstrated a complete real gameplay loop. The game should introduce a new tactical twist every scenario, not repeat "raise belief bar before deadline" with a reskinned backdrop.

## Campaign target

Ship **five hand-authored scenarios** total (initial Redbank plus four) if quality permits; hard floor at release = Redbank + at least two additional polished scenarios with unique victory conditions, distinct map pressures and verified winning routes. Each level must be beatable and contain at least two approaches. Sequence level teaching so each new chapter uses existing literacy then introduces one new systemic wrinkle.

### Scenario A — Flood at Redbank (tutorial / pressure management)
Seven-day flood, 14 villagers, east/west bridge, beacon fire vs witness bridge. Core learning: belief network → law → tradeoff. Built already; refine as necessary, do not break winning traces.

### Scenario B — The Harvest That Refused to Grow (resource economy)
A dry agrarian valley must feed its people before Day 9. Competing ideas: "Moonlight ripens grain" vs "Rain answers the bells"; moonlight improves crops but nocturnal labor exhausts villagers; redirected rain helps crops but floods the hillside road; merchants demand evidence before sharing food. Two victories: high-yield crop rescue vs food import/social negotiation + selective wetland engineering. Add hunger and labor pressure; victory requires households fed, not only magical yield.

### Scenario C — The Wolves of Ashwood (territory / trust fragmentation)
Mist-covered woodland; packs threaten livestock, towns are distrustful, smoke repels predators yet obscures roads and sickens residents. Enemy packs react to smoke sources and animal paths. Win by safe passage and animal management, or by turning a rival wilderness claim into a defensive buffer. At least one case where high rumor adoption is NOT best because environmental externalities overwhelm benefits.

### Scenario D — The Town Where Nothing Burns (conflicting beliefs)
A celebratory town believes "Flames cannot hurt us"; a rival faction spreads "Only honest light reveals danger." Fire becomes safer in some contexts but creates complacency; drought and a grand festival make outcomes risky. Player must arbitrate mutually exclusive regional laws, expose evidence selectively and manage civic legitimacy. Avoid trite moral binary. Two victory routes via targeted suppression or compartmentalization.

### Scenario E — The Last Bell of Greyhaven (late-game synthesis)
Three districts, shrinking bridge connectivity, fog, sickness and civic unrest. Time-delayed evidence and rumor cross-contamination force creative combinations of prior laws. Named faction leaders evolve in response to prior player actions *within the run*. Win by preserving a coalition and essential services, not by maximizing one law pressure meter.

These are design targets. Adjust names/rules to avoid scope creep or impossible implementation; document differences, but ship **at least 3 high-quality distinct scenarios**.

## Scenario authoring schema

Each scenario should be **data-driven** with:
- id/version/name/tagline/duration/difficulty;
- deterministic map seed, authored landmark layout or procedural constraints;
- starting resources, climate and threat curve;
- character roster, factions, relationships, personas and initial beliefs;
- allowed Claim/Rule definitions with regions and contradictions;
- allowed actions, availability unlocks, starting Influence and gain rules;
- primary/secondary objectives, failure conditions, scoring, badges;
- scripted story beats triggered by observable state, not just absolute day;
- possible strategies and solver verification examples;
- localized dialogue strings and short event templates;
- tutorial hooks/hints/skipping policies, if any.

Validate schema at startup/build, report which content item is malformed. Separate rule/effect implementation from scenario authoring. Schema modifications need migration and versioning.

## Event-directed, branching narrative

Narrative emerges from actual state. Implement 3–5 notable branching events per new scenario. Examples:
- A skeptical doctor witnesses transformed weather, publicly changes position; a religious elder grows anxious.
- A gossip leader asks for food in exchange for speaking; accepting harms morale and creates short-term influence.
- A witness to a devastating side effect denounces player's claim and convinces their trusted family.
- A bridge closure isolates a faction: rumor no longer crosses until path restored.

No fake branching where choice A and B lead to identical state. Dialog should be compact, readable, emotionally grounded and sometimes surprising. Character identities need state-contingent reactions.

## Concrete rule expansion

Add a full roster of **12–18 meaningful claim/law combinations** for campaign release if testing permits; at least 9 genuinely distinct functional effects, not color/number swaps. Categories:
- Water/weather: river avoids flame, rainfall follows bells, fog fears singing.
- Agriculture: moonlight ripens grain, seeds grow near stories, rot dislikes salt.
- Structures: witnessed bridge resists breakage, praised stone becomes movable.
- Predators/health: wolves avoid smoke, clean water seeks silver, illness fears open doors.
- Social structure: messengers remain unlost if named, promises bind pathways (if clear, bounded and fair).

Each must have a **benefit, limitation, interaction and downside**. Ensure all text matches actual code behavior. Do not include law cards that cannot appear or are impossible to activate.

## Level difficulty ladder

First scenario: mostly visible graph, predictable hazards, forgiving UI guidance, limited claim pool.
Second/third: competing deadlines, limited labor, basic contradiction and evidence costs.
Fourth: antagonistic factions, regional specificity, commitments that cannot be trivially undone.
Fifth: multiple claims, limited attention, complex feedback loops and layered objectives.

Implement hint levels and scenario previews; do not use unfair hidden rules.

## Tests & done gate

For each scenario, write:
- one known-winning strategy trace with seed and validated win;
- second alternative credible strategy trace (can use same seed where possible);
- one plausible failing trace with educational debrief;
- schema validity, no-softlock and edge-case fixtures;
- E2E smoke test through intro, an actual action, event resolution and finish.

Playtest each at normal difficulty with at least 3 seeds, record actual outcomes and reasons for failures; do not assume strategies work just because story says they should. At least three scenarios genuinely differ mechanically and visually. Commit authored content and tests before proceeding.