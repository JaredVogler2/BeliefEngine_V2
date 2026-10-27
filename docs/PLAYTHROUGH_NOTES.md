# Exploratory playthrough notes (AI-driven, not a human session)

**Who played:** an automated agent (the author of this repository's code) driving the real production build through the browser with Playwright: real clicks on the real controls, then reading the screenshots and event logs. This is **not** a human playtest and says nothing about how a person feels; the human protocol is `docs/PLAYTEST_PROTOCOL.md` and has not been run.

**What was played to its end:** all three chapters (the clicked traces in `tests/e2e/redbank.spec.ts`, `scenarios.spec.ts`: Redbank twice and a loss, Harvest twice, Ashwood twice), and generated villages `x1.1` (victory) and `x1.3` (defeat) through the expedition flow (`tests/e2e/expedition-win.spec.ts`). Screens reviewed: `docs/screens/` and an expedition briefing and first day.

## Where it worked
* A clicked win reads as cause and effect: the debrief for Redbank names who was told, who saw the demonstration, the law becoming LAW on day 5 and "Result: the bridge held", and now also the rival's hand ("Old Harl campaigns ... Your challenge blunted it").
* The expedition briefing is clear: the surge chart, twists with their trade-offs ("Proof is king. Mass-telling is weak."), a "Verified winnable" chip.
* The end-of-run scene tells the truth at a glance (lit and fallen houses, the bridge, a dot per villager).

## Where it is confusing, thin or slow (observed; the first three were fixed in phase 15, see `docs/FUN_REVIEW.md`)
* **Opening-story cards look inconsistent in a generated village.** On `x1.1` day 1 the card "River fears fire [1]" is dimmed (it unlocks later) while the two cards the player can use have the pulsing gold tutorial outline, and the digit shortcut `1` still labels the dimmed one. A new player will read dimmed as "broken" or as "worse".
* **The first-day tip card sits over the left of the map** and covers a villager and the start of the story hand on a 1366x768 window; "Skip tips" removes it but the default is to cover content.
* **Hints are generic.** A generated village shows the same four hint lines as Redbank, including one about "the east bank walking out" that is only true where there is a bridge and an east bank.
* **Idle Influence once a law is live.** Bots that win the bridge route spend about 15 of 23 Influence and pass 29% of their days. A human aiming only to win may feel the last two days have nothing to do; a human aiming for the gold medal does (13+ alive, heroic).
* **No late recovery in Harvest.** Losses there are decided by about day 6 of 9 (`docs/BALANCE_REPORT.md`, rescue test); the debrief says why but the player has no chance to act on it.
* **The bridge route's real cost is easy to miss:** food. A win can end on exactly the 4 food the objective asks for.
* **Grind:** a full Redbank day by the book is 3-5 clicks per action (claim, select, button); keyboard shortcuts exist for stories but not for "tell the selected villager".

## Not observed
Confusion, rage-clicks, dead controls and appetite for a second run from real people; any frame-rate on a real phone; how the audio feels.
