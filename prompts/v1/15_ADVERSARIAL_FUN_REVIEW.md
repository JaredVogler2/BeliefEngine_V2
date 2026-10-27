# Phase 15 — Red-team the game experience and improve it

Play the part of skeptical game journalist, exploit-hunting speedrunner, bored first-time player, strategic expert, interaction designer, mobile tester and skeptical software engineer. Do NOT treat the current product as good just because it runs.

## Review as seven personas

1. **Newcomer**: would a new user understand Claim→Rumor→Law→World? Are there early confusing terms? Is the first 60 seconds full of irrelevant menu/panels? Audit unguided tutorial path.
2. **Strategist**: are forecasts usable, is there enough agency, does graph centrality matter, can player foresee downside, do alternate strategies win via different mechanisms?
3. **Speedrunner**: which actions and claims trivialize difficulty? Can costs be avoided through undo, reload, save resets, chain activation or intentional NPC manipulation? Are day skips too easy?
4. **Bored player**: how many turns without a dramatic world change, hard choice or surprising reaction? Does normal gameplay devolve to repeating one rumor action?
5. **Story lover**: do named villagers and households matter emotionally? Does debrief recount actual story, or display generic stats?
6. **Mobile player**: can someone play in a few minutes, recover from interruption, find targets, understand labels and progress?
7. **QA**: any fake/misleading buttons, crashes, replay mismatch, softlocks, broken state migration, physics contradictions or untested content?

## Evidence-driven review

Actually inspect and play via available browser automation; use full AI policy tournament and specific failing seeds. Identify top 10 problems, rank by player harm and implementation cost. For each, record:
- observed evidence with reproduction steps + seed/trace/screenshot when feasible;
- root cause in system terms, not aesthetics only;
- proposed correction and expected tradeoff;
- tests or metrics that will catch regression.

Fix the **top five** critical issues before declaring success. Re-run relevant scenarios, E2E and policy tournaments. If ten issues aren't found, do not invent them; search more carefully and report genuine findings.

## "Would I voluntarily replay?" interrogation

Ask and operationalize:
- Does a win suggest a genuinely different next experiment?
- Does a loss teach a counterfactual intervention ("Had I converted bridgekeeper, evacuation could have worked")?
- Do two generated villages require different choices after 3 days?
- Is the most fun part the social/physical causality, or is that buried in menus?
- Is activating a law both delightful and mechanically consequential?
- Can I finish without reading documentation?
- Does taking an action feel better than watching NPCs talk?
- Are crisis loops tense but not punitive?
- Is the best strategy discovered through observation and experimentation?
- Are novelty systems mostly cosmetic or actually strategic?

If multiple answers are negative, make concrete design changes rather than writing a positive retrospective.

## Review natural-language/MCP phases

If phases 16 and 17 exist at review time:
- AI agents must have same AP and rule limitations as humans.
- MCP tool responses must convey the same causality and choices as browser; errors actionable.
- User-stated beliefs must not generate arbitrarily overpowered world effects.
- Offline deterministic game still works with API service disconnected.
- No prompt injection from user-entered claim text, unsafe code generation or leakage of provider credentials.
- Long-term remote-session storage, authorization and concurrency valid when MCP remote mode enabled.

## Report

Write docs/FUN_REVIEW.md with scored dimensions (mechanics clarity, tension, strategic diversity, approachability, art, narrative, replayability, technical stability), evidence, severe defects and actual fixes. Scores are subjective internal heuristics, not market validation; explain limitations. Update docs/PROGRESS.md and final release quality status. Commit fixes plus review. Do not close without rerunning regression suite and confirming the shipped browser game remains playable.