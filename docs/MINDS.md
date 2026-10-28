# Villager minds (phase 07)

Every villager of a V2 run (Generative Reality, chapters or Lab) has a mind under `s.v2.minds`: a personality, goals, and
memories the engine recorded from its own log. A few villagers a day stop to think at moments that matter to them and act; the
player can talk with any of them. Classic runs have no minds, so their hashes, saves and replays are exactly V1's.

Code: `src/engine/mind/` (`types`, `init`, `memory`, `decide`, `policy`, `run`, `request`, `talk`, `view`). Tests:
`tests/unit/mind-{memory,decide,talk}.test.ts`, `tests/unit/ai-npc-v2.test.ts`, `tests/e2e/v2-minds.spec.ts`.

## 1. Who they are (`init.ts`)

- **Personality** (curiosity, skepticism, ambition, fear, altruism, stubbornness, courage; 5..95), derived only from what the run
  holds: V1's skepticism and stubbornness exactly, curiosity from V1 openness, ambition partly from V1 influence, the scenario's
  archetype as a centre, and seeded spread (±10). Major events shift it a little (losses raise fear, failed proofs raise
  skepticism), never more than 15 from where it started.
- **Goals** (at most 3): feed their family, keep their home standing, keep the bridge up, keep the herd safe, save the crop, be
  listened to, see proof, keep order, stop rumours, stay safe; from household, work, role and character.
- Belief and trust numbers stay where V1 keeps them (`Villager.beliefs`, `edges`). A mind holds what a villager remembers and how
  they tend to act, never what they believe, and no model writes any of it.

## 2. What they remember (`memory.ts`)

Twice a day (after the day's actions, where villagers spent the day; after the night, where they spent the night) every new log
event becomes memories for the villagers it reached:

| Event | Who remembers it, and how |
|---|---|
| the Keeper tells them a story | them: "the Keeper told me", credibility = their trust in the Keeper |
| a neighbour moves their belief | them: hearsay naming the neighbour, credibility = their trust in that neighbour |
| a rival campaigns at them | them: hearsay naming the rival |
| a demonstration works or fails; a belief acts (`REALITY_EFFECT`), a law spares a home or holds the bridge | everyone within sight (6 tiles): seen, and it **judges** the story |
| a law takes hold or fails | everyone who votes on it: news, credibility 60 |
| fire, flood damage, wolves, a death, the bridge falling | those within sight; the owners, the household of the dead, the keepers of the pen or field privately |
| another villager acts toward them; the Keeper talks with them | them |

Each memory keeps the event id it came from, whether it was seen or heard and from whom, credibility, salience (0-3), valence and
privacy. At most 5 new memories per villager per capture (the most salient), 24 kept; older minor ones fold into at most 8
summary lines that keep their sources and event ids. Memories that judge a story are never dropped (past 48 even they fold, and
the summary still says what was seen).

## 3. Who thinks, and what they can do (`decide.ts`, `policy.ts`, `run.ts`)

Each night the strongest **moments** (a story new to them, a contradiction seen, a loss, a law decided, a faction's call, an
argument, a crisis) queue at most **4** villagers for the next day, one decision each. At dusk each acts once, in id order.

| Move | Open when | What it does (V1's rules) |
|---|---|---|
| spread | they hold a story (±12) and have reachable ties | one gossip exposure (V1 arithmetic) to a neighbour |
| persuade | they believe (40+) and a neighbour does not (under 30) | gossip ×1.25, as a witness account if they saw it work |
| challenge | they doubt it, or saw it fail, and a neighbour believes | lowers the neighbour's conviction (trust, stubbornness, what each saw) |
| ask | a neighbour holds a story they are unsure of | they hear the neighbour's view; trust +1 both ways |
| investigate | the story has a law or recent proof | evidence if it was recently borne out, doubt if it failed, else nothing |
| comfort | someone close is afraid or grieving | their fear falls; trust +2 |
| stage evidence | they believe and saw it work | up to 4 people nearby hear what they saw (witness account) |
| move (flood) | their home will take some water, not enough to evacuate | they take a shelter place before the evacuation |
| support rescue (flood) | their home stays dry and the shelters cannot hold everyone at risk | the neighbour sleeps at their home instead of being trapped |
| wait | always | nothing |

Children decide neither flood move (V1 shelters them first). Every change is reported as an ordinary V1 event (`BELIEF_SHIFT`,
`BELIEVER_GAINED`) with its cause; a spoken line changes nothing by itself.

**The policy** (`choose`) is the offline game: a utility model over the open moves, scored from personality, goals, memories and
ties, with a seeded tiebreak, so the same run makes the same choices. Given the same story and the same evidence, six villagers
choose differently by their own context (tested), and new evidence changes some of their choices.

## 4. A model may propose (`request.ts`, `NPC_DECIDE`, contract `npc v2`)

With the player's consent, the browser sends the request for today's thinkers: for each, only their own memories (by id),
beliefs, ties, their moment and the moves open to them with legal targets and the stories each may be about. Never the map, the
forecast, the save, or other villagers' memories. The server holds the answer to the request (`validateDecisions`); the browser
submits it as an `NPC_DECIDE` action, bound to the run revision; the engine holds each decision to the live run again
(`validateChoice`: due to think today, a legal move and target, a story that move may be about, memories that are really theirs)
and keeps the accepted ones for dusk. Everything refused, stale or missing falls back to the policy; nothing is asked again. A run
accepts at most 120 model decisions. The action log replays a run exactly, model decisions included, with no model.

## 5. Talking with them (`talk.ts`, `TALK`)

Ask what they think of a story, argue for it (1 Influence, counts as telling them that day), challenge it (1 Influence), or ask
what they make of things. They answer only from what they saw or were told: someone who never saw the bridge hold can only say
who told them. Asking never plants a story. Arguing is V1's seeding, ×1.2 if they saw the story work, ×0.6 if they saw it fail;
challenging weighs their trust in the Keeper and stubbornness against what they saw. With consent, a model may voice the answer
from their memories; its line is cleaned and must cite only their memories, and it changes nothing the offline answer would not.

## 6. Social dynamics that change outcomes (phase 08)

- **The influence journal** (`journal.ts`): who influenced whom, why (the reason V1's rules gave), and what changed, read from the
  log; `chainOf` follows any event (a law taking hold, a belief at work, a proof) back along its cause links, step by step. Shown in
  the Log tab ("who influenced whom", "how it happened"). Nothing is stored or decided there.
- **Factions lean**: empiricists (V1's "scholars" factions) favour asking for proof, investigating and challenging; storykeepers
  favour retelling and witness accounts; the council asks and weighs order; hearths comfort and shelter. Leanings add to a
  villager's own scores; they are not rules.
- **Asking for proof** (`request_test`): a skeptic or empiricist may demand to see an undecided story shown, at the place where it
  can be (the story's ritual landmark, or a written belief's anchor), within two days. Seen working: they believe hard (+30
  evidence) and carry it to their neighbours; seen failing: they turn against it; ignored: the story and the Keeper lose a
  little. Shown in "Asking for proof" with a button to the place.
- **Competing claims villagers write** (`claims.ts`): a council or empiricist leader who doubts a story the village now lives by,
  after a loss, a failed proof, or news that it took hold over them, may answer it with its opposite, in the same reality language,
  built, grounded and priced by the same engine as the player's (`buildRealityClaim`). Announced a day ahead ("Announced for
  tomorrow", with a button to change the author's mind: a changed mind withdraws it), one per faction per run, none within three
  days of another, never for a story the chapter already answers with a rival, and never counted against the player's own written
  beliefs. Once made it is a rival story: it and the story it answers crowd each other out both ways, the Keeper can challenge it,
  and if both become law the executor resolves their opposite effects by support.
- **Lies** (`motiveToDeny`): only a villager whose household just lost something while a story's law held over them, and who puts
  family or property first, may argue against what they saw work. The engine flags it (`LIE_TOLD`); a listener who saw it too
  sees through it (`LIE_DISCOVERED`: trust in the liar −20, the listener rebuts the next day); otherwise it works like a weak
  challenge.
- **Social energy**: arguing a story at dusk (persuading, challenging, a witness account) replaces that villager's broadcast of it in
  the night's gossip; a deliberate retelling is a small extra (×0.6 of one gossip exposure); a witness account reaches three people
  (×0.8, with their evidence). Skeptics may challenge stories nobody has shown them ("nobody has shown me", ×0.6).
- **What people can know**: a villager talks only to people they can physically reach today (a fallen bridge cuts the banks), and a
  model request carries only that villager's own memories, never another's, private or not.
- **For the player to inspect**: each villager's beliefs beside how they know them ("saw it work (day 3)", "heard from Mara",
  "told by you", "nothing first-hand"), and for each law how many of its firm believers saw it work themselves.

## 7. Status

Offline and with a scripted provider: **VERIFIED** (tests above). With a real model: **LIVE UNVERIFIED** (no provider is
configured here); latency, tokens and cost of model decisions are not measured, and nothing yet compares model-driven and
policy-driven villages.
