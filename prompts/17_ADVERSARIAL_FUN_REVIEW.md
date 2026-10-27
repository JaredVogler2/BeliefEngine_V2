# Phase 17 — Independent adversarial assessment and gameplay polish

Your role is skeptical strategy gamer, skeptical first-time player, technical artist, prompt-injection attacker, backend SRE, model evaluation scientist, iPhone tester and cost analyst. Review actual running code and evidence—not developer optimism.

## What could still be bad?

- 3D world looks like primitive boxes or old flat map, despite working game.
- LLM response is clever but law maps to a completely different unsupported spell.
- Some characters talk differently but never affect actual actions or social pressure.
- You can win by typing godlike universal magic; no meaningful strategic choice.
- Complex model responses stall play, network error silently consumes action points.
- A prompt injection persuades a tool to leak secrets, invoke arbitrary code or bypass economy.
- NPC invents details it did not observe, destroys notion of evidence and credibility.
- Budget race lets a public player burn unlimited inference through parallel Vercel instances.
- Old V1 runs no longer replay, Classic secretly calls model, or MCP has divergent rules.
- New seed or restored save leaks previous NPC memories.
- 320px phone is unusable due to large composer, keyboard or tiny 3D people.
- The player can't tell which effects are supported, partial or narrative-only.
- Users don't have a reason to play a second run; every claim is one-click win or all unsupported.

## Seven critical questions

1. Can a new player invent a physically grounded rule within 60sec without reading a manual?
2. Does playing one creative law create a distinct social strategy rather than simply activating a spell?
3. Can a skeptical citizen change mind after new evidence with an actual recorded model decision?
4. Can the player deliberately engineer a beneficial outcome and be surprised by a logically consistent downside?
5. Do distinct statements really produce DIFFERENT world physics, not mere recoloring?
6. Would an uncoached player understand why an unsupported request cannot happen and know what else to try?
7. Does V2 still support a classic offline story, legal win/loss, iPhone controls and replay?

## Testing protocol

Review at least ten real failure/edge cases with reproduction seed, model output ledger and code paths. Use headless simulations and existing model eval corpus; do not waste live model tokens on 1000 repeated bot games. If actual human playtest available observe uncoached sessions (prefer phone) and record what user does/feels; otherwise mark FUN as subjective/unverified. Conduct one fully real model-backed browser playthrough if credentials configured. Compare no-key mode and live mode. Capture real screenshots, AI usage and privacy/security evidence.

Rank issues P0/P1/P2, fix all P0 and top five P1, re-run impacted browser, sim, security and provider tests. No fabricated defects/participants/cost figures. If never live-tested, do not promote a mock server as fully operational.

## Final artifact

docs/FUN_REVIEW_V2.md: quantitative/qualitative rubric (art 3D, cause/effect clarity, social emergence, player agency, rule variety, replayability, speed/cost, security, mobile UX), evidence, failed tests, fixes, known limitations and next responsible action. docs/PROGRESS.md and README current. Commit verified fixes and exact SHA.

## Strict finish

"Complete" requires playable Classic + model-backed gameplay with a real provider call when configured, character cognition, supported composable reality, full win/loss and offline replay, attractive actual 3D world, mobile controls, secure low-risk model use and truthful deployment. If one isn't verified, identify it explicitly rather than claiming finished.
