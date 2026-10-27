# Phase 12 — Make complex generative gameplay intuitive on desktop and iPhone

## UX goal

Any player should immediately understand what to do. 3D village remains focal point, not a chat transcript. New user writes a sentence, receives a clearly bounded mechanic preview, chooses who to convince and sees social/physical changes without learning internal jargon. On phone no hover, tiny buttons or full-width dense cards.

## Primary flows

Main menu: Classic (offline) / Generative Reality (model-backed) / Living Village / Reality Lab / Continue. Show transparent model requirement/consent/cost explanation; if backend unconfigured allow Classic or local constrained composer. Never show working LLM label if test stub only.

Generative flow:
1. Tap/write a belief from a floating compact action tray. Active game planning pauses while typing/choosing, but social AP rules remain.
2. Short text composer, optional region/landmark selector. Voice-to-text may use browser built-in dictation when supported, not a required speech API.
3. "Understand belief" shows loading with realistic cancellation/timeout. No repeated infinite re-tries.
4. Preview displays side-by-side **Player said** / **Game can actually do**, supported clauses, omissions, strength rating, required evidence, affected targets, social consensus threshold and side effects, and optional short clarifier.
5. Choose one candidate, then choose first villager directly in 3D or accessible roster, confirm AP cost.
6. Turn advance shows gossip to trusted contacts and readable NPC reactions; tapped villager card shows opinions, memory references and current intentions.
7. Active law transforms real map; world-space selector highlights affected entity + text reason. Log/undo planning depending game rules.
8. Endgame debrief includes story of invented rule, NPC reactions, changed world, collateral harm, score and seed/replay.

## Desktop layout

At 1366x768 world occupies majority of view; slim clock/threat header, AP/resource chips, collapsible law journal and bottom contextual action tray. Click villagers/landmarks with raycast; smooth camera pan/zoom/orbit/focus/reset. Optional dialogue sidepanel max reasonable width; no constantly open huge model response. Keyboard Tab/Enter/Escape, shortcuts and semantic DOM actions mirror canvas picking.

## iPhone

Test 320x568, 375x667, 390x844, 430x932; viewport-fit=cover and safe-area insets, dynamic viewport for Safari address bar. One-finger world pan, tap citizen select, two-finger pinch, large +/- controls and focus button. Bottom sheet with at most 3–4 primary choices; keyboard input auto-pauses if scenario clock runs; buttons >=44px, confirmation easy to dismiss. On device orientation change preserve claim draft and run revision. No prompt text clipped behind software keyboard, no world gesture accidentally submitting claim. Accessible alternatives for all gameplay actions.

## NPC UI

Conversation list displays speaker with role, short text and optional belief/evidence link; distinguish subjective assertion vs observed simulation event. Avoid hundreds of unscannable lines. A villager card answers: what do they think, why, who told them, are they persuadable, what can I say, what is their next action. Show one "Why?" link to source event provenance. Replay original dialogue if recorded, no new model calls when viewing history.

## Model-outage UX

Clear "Online interpretation unavailable; use limited offline composer" with no surprise AP loss, model call charge uncertainty explained, retry under rate limit if allowed. When AI status offline, disable live dialogue controls and show availability rather than fake scripted quote labeled live. No browser key entry forms unless carefully designed backend BYOK exists.

## E2E acceptance

Real desktop Chrome and WebKit phone-like browser: start generative run, submit text, select candidate, seed NPC, advance, inspect social response, law and effect, save, reload, win/lose and retry. Screen reader/keyboard accessibility audit, reduced motion, error/status announcements, orientation/keyboard tests. If actual iPhone Safari unavailable, mark real hardware UNVERIFIED even if WebKit tests pass.
