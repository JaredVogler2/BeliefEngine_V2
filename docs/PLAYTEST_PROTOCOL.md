# Human playtest protocol

**Status: no human playtest has been run.** Nothing in this repository claims that a person found the game fun, clear or fair.
The tournament bots (`docs/BALANCE_REPORT.md`) measure what the simulation allows; they are proxies for challenge and variety
and say nothing about enjoyment. This file is the script for finding out. Results go into `docs/playtests/` as one file per
session, using the template at the end, and are summarised in `docs/BALANCE_REPORT.md` only once real sessions exist.

## Ground rules

* **Uncoached.** Do not explain rules, controls, or what a law is. The first-run tutorial is part of what is being tested.
  If the tester asks "what do I do?", answer "what would you try?" and write the question down: it is data.
* **Three to five testers per round**, ideally with different habits (a strategy-game regular, a casual puzzle player, someone who
  rarely plays games). Fewer than three is a conversation, not a test.
* **Screen and voice recorded only with consent.** The game keeps nothing about the tester: progress lives in their browser's
  local storage, and the Atlas has no names. Never ask for a name or an email in the game.
* **Do not fabricate** testers, quotes, timings or ratings. If a session did not happen, there is no file for it.
* One facilitator observes and takes notes; they do not touch the keyboard.

## Setup

1. `npm run build && npm run preview`, or the deployed URL (none is claimed by this repository). Use a fresh browser profile so no
   progress archive exists. Desktop: 1366×768. Phone: a real phone, portrait.
2. Start a stopwatch when the title screen is visible. Tell the tester only: *"This is a game about a village. Play it however
   you like, and say out loud what you are thinking. I can't help, but I'll take notes."*
3. Let them play the first chapter to its end (about 10–15 minutes). If they quit earlier, note when and why.

## What to record while watching

| Observation | How |
| --- | --- |
| Time to the first meaningful action (a story told, an item selected and used) | stopwatch; **target: under 30 seconds** |
| Time until they can say what a law is, in their own words | note the sentence |
| Dead or misleading controls (clicked, nothing happened; button looked enabled but was not) | list with screen and control |
| Rage-clicks and repeated attempts on the same control | list |
| Misleading previews (the preview said X and the morning said Y) | list with the event the tester pointed to |
| Moments of "I did that" versus "that just happened" | tally with a quote |
| Whether they used undo, the forecast, the Scout, the Atlas | tick boxes |
| Whether they started a second run unprompted | yes / no, and which village |

## Questions to ask afterwards (verbatim, in this order)

1. What were you trying to accomplish?
2. Why did the law turn on, or off? (If they never saw one: what do you think the glowing places were?)
3. What caused the worst surprise?
4. Did you feel you had agency, or did events feel random?
5. Would you play again? What would you try differently?
6. Was anything unclear, annoying or unfair? Anything you wanted to do and could not?
7. Which villager do you remember, and why?

## Pass criteria for this round (hypotheses to test, not claims)

* At least 3 of 5 testers act on the village within 30 seconds of the Begin screen.
* At least 3 of 5 can explain, unprompted, that a *shared belief* changed something physical.
* Fewer than one dead-control or misleading-preview report per tester.
* At least 2 of 5 start a second run (a different village or a retry) without being asked.
* No tester reports a loss as "random" after the debrief.

If a criterion fails, open an issue in `docs/KNOWN_ISSUES.md` with the observed evidence rather than rewording the criterion.

## Accessibility pass (separate, 20 minutes, with a keyboard and a screen reader if available)

* Complete the first chapter with the keyboard alone. Note any control that cannot be reached or whose focus is lost.
* Turn on reduced motion in the operating system; confirm the village still reads clearly.
* Zoom the browser to 200%; confirm no content is cut off.
* With a screen reader (NVDA, VoiceOver, Orca), confirm each day's digest is announced and the Forecast tab can be read.
* Record what could not be tested (tools or devices not available) as *untested*, not as *passed*.

## Session record template

```
Session: <date>, <desktop|phone>, tester <T1..Tn> (no names)
Build: <git commit>   Village: <scenario / seed>   Difficulty: <>
Time to first meaningful action: <mm:ss>
Outcome: <victory|defeat|quit at day N>   Second run started: <yes/no>
Dead controls / misleading previews / rage-clicks: <list>
Answers 1–7: <short verbatim notes>
Facilitator's top three problems: <list, with severity>
```
