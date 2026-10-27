# Phase 09 — Give mastery a satisfying arc without manipulative grinding

Design long-term replay incentives that reward curiosity and strategic mastery. The game must remain **fair from the start**. Players should return because there are interesting puzzles and self-directed discoveries, not because of daily login demands, paywalls or artificial waiting.

## Persistent progression (client-only)

Create a small **Atlas of Belief** presented as an illustrated book:
- Discovered laws: what claim works, where, beneficial effects, drawbacks and notable combined effects.
- Civilizations saved: ending postcards with state-dependent one-sentence lore.
- Distinct scenario medals and achievement badges.
- Unlocked starting configurations, alternate challenge modifiers and optional claim draft selections.
- Player stats: scenarios completed, unique laws activated, rescues, average score per mode, favorite strategy, best daily seed result.

Store locally with schema version, export/import JSON and reset confirmation. Account/login not needed. Never collect names, emails or personal identifiers by default.

## Rewards that expand options rather than raw power

Examples:
- Complete Redbank with 12 survivors → unlock a new tactical starting rumor; new rumor has real side effect.
- Win without lighting beacons → unlock "Bridgekeeper's Oath" expedition variant.
- Win despite a hostile council → unlock advanced faction challenge.
- Activate two competing laws in separate districts → unlock new puzzle draft archetype.
- Rescue villagers while crops burn → earn a remembrance entry and related optional scenario.
- Five distinct strategies logged → open Challenge Board with additional objective variants.

Unrefined "permanent +10% influence" power creep is disallowed unless confined to a mode explicitly designed around it. All core scenarios remain beatable without unlocks; avoid making standard victory require 50 prior runs.

## Score and fairness

Scoring formula must be readable, normalized and stable:
- Survival (dominant), protected households, essential food, infrastructure, trust/social harmony, resource efficiency, optional objectives, difficulty multiplier.
- Do not use a score exploit that rewards refusing to take action or delaying resolution artificially.
- Tie to actual end-state; disclose broad category breakdown.
- Record run integrity: seeds, rules version, debug/cheat state, completion signature (for local comparison only).
- Score should celebrate interesting plays as well as efficiency; unusual victory route can get a badge.

A failed run still unlocks **knowledge** (e.g. newly witnessed law side effect, failed theory, map explanation). Failing feels like "one more attempt with a better plan" rather than arbitrary punishment.

## Achievements and variants

Ship at least 16 achievements that correspond to real strategic acts, including:
- first law formed,
- first surviving counterpropaganda wave,
- win with no beacons,
- win with low initial trust,
- preserve bridge under maximum surge,
- win after law activation collapses,
- achieve different law in both districts,
- rescue every villager,
- use a contradictory claim to avert disaster,
- win with ≤X Influence,
- two or more campaign endings,
- three unique biomes in expeditions,
- clever relief via trade/labor,
- avoid harming farmland,
- complete daily challenge,
- discover every starting claim interaction.

All achievements must be provably attainable with code/tests or documented candidate seed/trace. Inaccessible/never triggering badges are bugs, not stretch goals.

## Debrief as primary reward

End screen should:
1. Give a clear win/loss verdict and scenario-specific story.
2. Show no more than 3–5 decisive causes, backed by actual event IDs.
3. Reveal a consequential thing the player missed.
4. Compare to previous personal best only if comparable difficulty/rules.
5. Offer **three high-value replay calls to action**: Retry same seed, New seed, Try an alternate approach.
6. Preserve satisfying map snapshot or dynamic post-crisis visualization.
7. Use concise optional narrative, not a bloated statistical spreadsheet.

## Session respect and retention

Allow pause/resume mid-run; no punishment for leaving. Avoid deceptive streaks, push notifications, daily obligation and intrusive prompts. Daily challenge is optional and remains playable on missed days only according to explicit policy. Simple accessibility settings and save settings persist.

## Release gate

Progression survives refresh, import/export, version migration and reset. Every unlock genuinely changes an accessible gameplay option; no placeholder cards. At least two distinct runs unlock different Atlas knowledge. Scores have deterministic test fixtures and cannot be farmed via trivial infinite loop. Only now layer meta progression into the main menu and campaign map.