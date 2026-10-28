# Desktop and iPhone UX for Generative Reality (phase 12)

What a new player sees, in the order they meet it, and how each piece is checked. Status words follow
[`prompts/AGENT_RUNBOOK.md`](../prompts/AGENT_RUNBOOK.md). Screenshots: [`screenshots/v2-phase12/`](screenshots/v2-phase12/), taken
from the production build by `BE_SHOTS=1 npx playwright test tests/e2e/v2-ux.spec.ts`.

## 1. The main menu names every mode

`Play Classic` (offline, the hand-made stories) stays the first, gold button. Below it, in one group, **Generative Reality** (write
your own laws), **Living Village** (villagers who remember and argue) and **Reality Lab** (stronger beliefs, never ranked), each with
its few words under the name. Each opens the mode screen on the Generative Reality tab with that mode's button leading the chapter
cards; `Continue` stays at the top when a run is saved.

The mode screen explains, before anything is played, how sentences and villagers are read (`reality-reading`): everything works
offline; a model reads only when the player turns it on in the composer or a villager's card, after a notice that says what leaves
the device; whoever runs the game pays, within daily limits; a refused, failed or slow reading costs the player nothing; a model only
proposes. There is no key entry anywhere in the browser. A test stub is labelled "simulated (local test server, no model)", never
as a model (phase 05).

## 2. Writing a belief

- **Where:** the hand's "Write a belief" chip, in the bottom tray on every size. The day does not run while the dialog is open (the
  game is turn based; there is no clock to pause) and the Influence rules are the usual ones.
- **The words are kept.** Closing the composer before writing keeps the sentence, the region and, if the village has not changed
  since, the reading and the choices made on it (`store.ui.realityDraft`, in memory only). If something happened in between, the
  words come back with "the village has changed since you read this, so it needs reading again (reading is free)": a confirmation
  built on an older village would be refused by the engine anyway. A phone turning never closes the dialog, so nothing is lost
  there; once written, the draft is gone. A new run, a loaded save or Continue clears it.
- **Reading** shows a status line ("Asking the online reader… it gives up after 25 seconds"); an online reading can be **stopped**
  ("Stopped. No Influence was spent. If the question had already reached the model, it may still count toward today's online
  allowance"). The client ends a stopped request as `cancelled`, never as a timeout or a network failure, and sends nothing when it
  was stopped before it was sent (`src/ai/client.ts`).
- **An outage** shows the offline reading at once, labelled "read offline by the game", with the reason ("The online reader could
  not be reached. Here is the offline reading instead; no Influence was spent."). Asking again is the player's choice: "Try online
  again" appears for slow, busy or unreachable readers, and after a rate limit it counts down the time the server asked for before
  it can be pressed. Nothing is ever retried automatically.
- The field is a native textarea: phone keyboards' own dictation works in it; capitalisation, spell check and a "go" key are set;
  on touch screens every field is at least 16px so iOS Safari does not zoom into it.

## 3. Who tells it first

Writing no longer drops the player back on the map with a toast. The dialog turns into **Who tells it first?**: the people whose
belief decides the new law (those who vote on it where it acts), ranked by what telling them now would add to its support: the
engine's own dry run of the telling (`previewAction`), weighted as support is weighed (an influential voice counts for more). Each
row: name, role, hamlet, "Would believe it 0 → 20 · Others follow their lead", and **Tell · 1** (its accessible name is "Tell · 1
Influence, to Ivo Thatcher"). A row that cannot be told says why (already spoken to today, cut off, will not hear you). Four are
shown, the rest behind "Show everyone who votes on it (9)"; people told today stay at the top with "Told today". Telling from here
is the same action as anywhere (undo works). Or **Choose in the village instead**: the dialog closes with the new belief in hand,
and a tap on anyone in the world offers the same telling. The line above the list says where support stands ("now 0% support of
the 55% it needs; 0 of 3 firm believers") and how much Influence is left.

## 4. A villager at a glance, and "Why?"

The villager card now opens with four short answers (`villager-glance`, every mode):

| | Answers |
|---|---|
| Thinks | what they make of the story in hand, or "Has not heard ..." |
| Why | what last moved them, from the log, and a **Why?** link |
| Would listen? | the dry run of telling them now ("Yes: hearing it from you now would move them 0 → 20"), or the engine's reason it cannot be done ("Not from you: ... A believer they trust can carry it.") |
| Next | what they mean to do (the top of their weighed intentions) and why |

**Why?** opens the log at that event (pinned at the top with up to four steps of what caused it, the engine's own cause links) and
points the camera at the place or person it concerns. Conviction numbers follow the existing rule: a telling's preview shows its
exact effect, as the action buttons always have; otherwise conviction stays hidden until the villager is scouted or spoken to. The
full card (their mind, memories with how they know, conversation, ties) follows unchanged.

## 5. The end of the run

The debrief's story of each written belief (phase 09: written, told, carried, opposed, threshold, what changed, what it came to) now
says what it cost when it hurt people: "What it cost: it harmed the people who live with it on *n* nights (Eastbank); *m* times
someone there trusted you less for it" (`provenance.harm`, counted from `LAW_HARMED` events; `belief-bridge.test.ts` checks the
counts on the recorded bell-rain chain). **New seed** keeps the mode: before this phase
it started a Classic run from a Generative Reality debrief (fixed with `v2ModeOf`; "Retry this seed" already kept it).

## 6. Phones

- Sizes checked: 320×568, 375×667, 390×844 and 430×932 (Chromium's phone profile, touch, coarse pointer). At each: no sideways
  scroll; the field and its buttons on screen and at least 44px tall; after writing, every Tell, Done and "Choose in the village"
  button at least 44px; the villager glance in the bottom sheet.
- On touch screens small buttons, the "Why?" link, selects and text fields are at least 44px; radios and checkboxes 22px.
- The dialog overlay follows the **visual** viewport (`--vvh`/`--vvt`, `src/ui/viewport.ts`): iOS Safari shrinks only the visual
  viewport when the keyboard opens, so a dialog sized to the screen would put the field behind the keyboard. Safe-area insets pad
  the overlay. A tap outside the dialog closes it (the draft is kept); nothing outside it can submit a belief.

## 7. Keyboard

The composer opens with the field focused; Enter reads; Escape closes and gives focus back to the button that opened it; Tab stays
inside the dialog. The roster's buttons are ordinary buttons in reading order. The game's existing shortcuts (1-9, T, U, L, Enter
to end the day) are unchanged and ignored while typing.

## 8. What is verified, and what is not

| Claim | Status | Evidence |
|---|---|---|
| Menu, draft (close, reopen, turn, stale), roster, glance and "Why?", Stop, outage, rate-limit wait, keyboard, retry in mode, four phone sizes | **VERIFIED in Chromium** (desktop 1366×768 and phone profile) | `tests/e2e/v2-ux.spec.ts` |
| No serious or critical axe violations on the menu, the mode screen, the roster, the villager glance and the focused log | **VERIFIED in Chromium** | the same spec (`audit`); axe found that the Tell buttons' spoken names did not contain their visible label (WCAG 2.5.3): fixed |
| A Generative Reality run (write, tell first, resolve a night, reload) in desktop WebKit, an iPhone 14 profile and Firefox | **VERIFIED in CI** (GitHub Actions run 40644114976 at `6ba4996`, job "Browser tests (Chromium)", step `npm run test:e2e:browsers`: 12 passed, the Generative smoke among them in webkit 22.6 s, iphone 11.4 s, firefox 4.3 s); not installed in this container | `tests/e2e/smoke.spec.ts` |
| The dialog stays above the iPhone software keyboard | **UNVERIFIED** (needs a real iPhone: no emulator shows a software keyboard) | `src/ui/viewport.ts` |
| Real iPhone Safari | **UNVERIFIED** (no hardware) | |
| Online reading against a real model | **LIVE UNVERIFIED** (no provider configured; the simulated server and routed failures only) | |
