# Phase 05 — Ship Flood at Redbank, a REAL beginning-to-end game

**Do this phase before adding additional campaign content or meta progression.** Previous phases are not complete unless their underlying mechanics support this full scenario. The goal is **fun, not exhaustiveness**. Make "Flood at Redbank" so compelling that a first-time player wants an immediate rematch.

## Cold-open story and game state

"You have seven days before the Great Surge. The river is rising. You can't command the water—but if enough people believe the river fears fire, perhaps it will turn."

A tiny working riverside settlement with 14 named people, two neighborhoods connected by one narrow bridge, 8–12 endangered homes, farmland, a market, a bell tower, lantern/beacon points, a safe hill shelter and food/fuel reserves. Design visible high/low ground and a believable downstream flood pattern. Name and give each person a one-line want or grudge; don't generate bland procedural filler for this first map.

A skeptic (e.g. miller) and a charismatic storyteller take different positions. Include a conflicted bridge keeper with crucial relationships to both banks. First social ties should be designed so that discovering which household connects the two districts is rewarding.

## Core day-to-day gameplay

Each day player gains ~3 Influence up to cap; action costs roughly 1–2, adjusted by playtests. Offer a hand of five tactical claim/action opportunities at a time; don't flood the player with 20 systems. First day should grant:
- One free meaningful scout action (identify two accessible supporters and the rising flood).
- A selected starter claim, initially RIVER_FEARS_FIRE or BRIDGE_STANDS_WHEN_WATCHED (player choice matters).
- One immediate visible social action (seed rumor or stage small observation).
- End Day CTA after spending, and explanatory day resolution.

At least one later day introduces a dilemma: fire beacons risk crop loss vs preserving homes, or bridge watchers risk their ability to harvest/deliver food. By Day 4 players should be making tradeoffs, not merely pushing the meter above 60%.

## Victory and loss: code exact conditions

Start with illustrative conditions (tune and freeze once tested):
- Victory at resolution of Day 7 if ≥10 of 14 villagers survive, ≥6 homes remain habitable, and food reserve ≥4 units (or equivalently articulated conditions that can be achieved via at least 2 mechanisms).
- Defeat earlier if surviving villagers <9, essential shelter destroyed, or no possible resource path remains; or at Day 7 if any victory requirement fails.
- Optional "heroic" accolade for 13+ saved and bridge intact; does not block standard win.

Ensure the goal is mathematically attainable and not trivially won without influencing beliefs. Test a no-action baseline that loses most tested storm seeds. If initial parameters differ, document them. Avoid invisible RNG deaths: deterministic storm forecasts with constrained variation.

## At least THREE real player strategies

**Strategy A — The Fire Wall.** Persuade two social connectors, stage a beacon fire, amplify the river claim, fuel east-bank torches, redirect rising flood. Managing escaped fire and fuel consumption must matter. Demonstrate winning action trace on canonical seed.

**Strategy B — The Witness Bridge.** Earn trust of bridge keeper and families, convene watchers, activate preservation law, evacuate east-bank villagers to higher ground, preserve food flow while negotiating labor shortage. Implement evacuation as actual path/occupancy decisions or autonomous NPC intents affected by bridge connectivity; not a scripted cutscene. Demonstrate winning action trace on SAME canonical seed or choose second same-difficulty seed with documented reasoning.

**Strategy C — The Hybrid/Bells (optional until viable).** Redirect rain while keeping bridge open, resulting in fewer casualties but possible farmland impact. Reward intentional synergy, not exploit loops.

No-action, random spam and indiscriminate influence farming should not equal considered play.

## Required screens and animations

1. Main menu → "Begin" / "Continue".
2. Opening mission briefing (skippable, short).
3. World map: animated rising water, homes, people moving, interactive landmarks.
4. Sidebar/HUD: Day x/7, Influence remaining, housing/people/food, imminent threat, claim hand.
5. Social Lens: trust network and colored conviction arcs with numeric accessible descriptions.
6. Law Ledger: activation progress, source supporters, constraints, active or suppressed, potential downside.
7. Action Planner: who/what/where, cost, expected influence, warnings, confirmation/undo within planning.
8. End Day: resolve simulation with a short readable sequence and summary "3 new believers, 1 law activated, 2 homes spared, beacon ran low."
9. Ending: Victory/Defeat, score and explanation; clickable "Replay this seed" and "New seed".
10. Quick help, settings and pause/resume.

Every visible CTA must be wired. No "coming soon" control on the main game path. If features are out of scope, hide them rather than bluffing.

## Meaningful tutorial built into live play

At start, highlight an endangered farm and a potential social connector. Player clicks a villager, selects a claim, seeds it, sees +conviction. End day displays visible message spread. The subsequent law pressure moves toward activation. First activation triggers strong map feedback and optional explanation "The water changed course because 9 connected villagers believe the river fears fire." Then player has to maintain it amid opposition/shortages.

Limit compulsory tutorial to 4 actionable steps; each can be skipped. Tooltips should be available later. Never halt a first-time player with long exposition.

## "Does it actually work?" mandatory acceptance test

Write Playwright end-to-end tests to:
- open start menu, start Redbank, inspect named villager;
- choose claim and seed rumor; verify AP decreases and event appears;
- end day, observe graph propagation and changing law progress;
- advance to an activation, confirm changing environment and side effect;
- intentionally lose and reach loss screen;
- execute a **known winning trace** for at least two strategies, reach victory screen;
- replay same seed and get deterministic event/result hash;
- save in middle, refresh, continue without corruption;
- begin new seed and confirm novel setup.

Use programmatic action APIs in engine-level tests and actual browser clicks in at least one short E2E; don't claim UI flows were verified by headless engine tests alone.

## Playfeel gates

- A first action in ≤30 seconds for an uncoached observer (human validation when available).
- No dead clicks; within first 2 days cause visible social change.
- One clear surprise with a narratively understandable cause.
- Strategic losses feel learnable, not unfair.
- No state softlock even when player exhausts AP, has no valid actions or all messengers are blocked.
- High-contrast, responsive, juicy feedback for every critical action.

## End-of-phase checkpoint

STOP feature expansion if this isn't genuinely beatable. Provide a recorded action trace and seed for two victories and one loss. Run build/typecheck/unit/E2E, resolve defects, commit. Record honest controls and known issues. Only then move to phase 06.