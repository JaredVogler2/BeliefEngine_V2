# Phase 11 — Quantify challenge, fun, fairness, and strategic diversity

A game cannot be called replayable merely because it offers random seeds. Build **measured balancing infrastructure** and use it to revise mechanics. Automated bot results are proxies for challenge and diversity, NOT proof that humans find a game fun. Add structured human playtest instructions where human testing is possible.

## Headless tournament harness

Create a CLI such as npm run test:sim -- --scenario redbank --seeds 1000 --report ... that:
- Runs thousands of deterministic games without DOM/render dependencies;
- Accepts scenario, seed range, difficulty, agent policy and action cap;
- Records win/failure, day of ending, score, resources over time, cause of loss, belief diffusion, law activations/durations, side effects, action-point efficiency, social network reach, rival responses and execution duration;
- Supports same-seed paired experiments with different strategies to control randomness;
- Writes JSON, CSV and a readable Markdown report including sample sizes, reproducible parameters and definitions;
- Enforces CPU/memory bounds; supplies quick CI smoke benchmark and larger offline analysis;
- Saves representative victorious and unsuccessful action traces as stable regression fixtures.

## Mandatory bot policies (all use the SAME public action API as players)

1. No-op control: end day.
2. Random-legal: sample available actions with remaining AP.
3. Greedy: maximize immediate pressure on one law.
4. Broadcaster: target charismatic hubs and convene gatherings.
5. Evidence-first: seek credible witnesses and skeptical agents.
6. Community bridge-builder: focus disconnected neighborhoods and cross-graph connectors.
7. Threat-aware planner: forecast cost/benefit of law activation, side effects and resources.
8. Exploit-seeker: spam low-cost actions, examine resource loops, exploit threshold hysteresis and planning/undo.
Optional bounded beam-search/MCTS-lite planner with explicit compute limits and no hidden privileged state (except a separate documented oracle for solvability proof).

## Primary metrics

- Win rate by strategy, seed cohort, difficulty and scenario.
- Strategic separation: different policies produce materially different actions, paths, world outcomes and victory likelihood.
- Meaningful decision density: number of genuinely contested choices versus empty/pass turns.
- Causal clarity: high fraction of impactful events explainable with explicit event IDs/reasons.
- Softlock/stalemate occurrence: ZERO for supported content.
- Progress arc: first belief spread, first law activation, threat escalation, reversals and conclusion.
- Failure fairness: how often the last few turns offered realistic mitigation opportunities.
- Procedural validation success rate and time, and rejected-seed breakdown.
- Performance, determinism and low-memory behavior.

Secondary: policy regret on identical seeds, law churn, resource overproduction, dominance by a single claim, scoring exploits, runs with no visible physical change, side effect distribution and run-to-run content signatures.

No external telemetry by default. Keep generated tournament data local; never invent retention or click-through statistics.

## Balance targets (initial hypotheses, amend after measurement)

Redbank:
- First meaningful action within 30 seconds in human trial; social effect visible after first resolved day.
- First real chance of activated law around days 2–4 (tunable).
- No-op ordinarily loses, random policies usually struggle, thoughtful policies demonstrably outperform them.
- Evidence-first, social-network leverage and environment-first strategies can each win SOME overlapping seeds.
- The canonical authored seed has at least two verified mechanically distinct winning traces.
- No route trivially wins 100% regardless of adversary/resources.
- Damage and reversals are explainable and preceded by readable warning.
- Failed runs can replay quickly.

Expeditions:
- Solvability assessed by a constructive validator and/or planner; filter known-unwinnable seeds.
- No seeds softlock via disconnected objective, exhaustion of all actions, bad save version or generator loop.
- Robust replay hash equality for fixed seed and action trace.
- 1,000+ seed tests per major balance revision (offline acceptable).
- Source of any "95% solved" statement must identify policy, seed cohort and version; do not generalize.

## Exploit probes

Build property/regression tests around:
- Influence can never be duplicated/refunded infinitely through undo, save/load, retry or invalid target.
- No resource becomes negative or overflows.
- Repeated rumors saturate, not farm belief infinitely.
- Evidence cannot be duplicated across remote listeners without exposure.
- Cooldowns actually apply.
- Conflicting laws cannot alternate infinitely in one turn.
- Score cannot be increased without advancing meaningful events.
- NPCs cannot create orphaned villagers, illegal moves or unreachable objectives.
- No infinite end-day loop in a completed game.
- An MCP agent cannot exceed browser action constraints (once phase 16 implemented).

## Empirical iteration cycle

1. Produce baseline tournament JSON/Markdown.
2. Identify most common failure, strongest exploit and most boring pattern.
3. Change ONE lever with rationale.
4. Re-run same seeds using paired comparisons.
5. Reject changes that make one strategy universally dominant or render player choices irrelevant.
6. Compare at least 3 playstyles, not merely a superhuman oracle.
7. Log outcomes and known qualitative uncertainties in docs/BALANCE_REPORT.md.
8. Update known win fixtures and docs/GAME_RULES.md.

## Human playtest protocol (when available)

Observe a few truly uncoached sessions without explaining rules. Ask:
- What were you trying to accomplish?
- Why did the law turn on/off?
- What caused the worst surprise?
- Did you have agency, or did events feel random?
- Would you replay, and what would you try differently?
Log confusion, rage-clicks, dead controls, misleading previews and interest in an immediate second run. Do NOT fabricate players or feedback.

## Exit

Run automated same-seed tournaments for 1,000+ seeds, provide report and used commands, demonstrate distinct approaches and at least one balance fix derived from data. Check no-op/random does not outperform all thoughtful policies. Commit scripts, results summary and regression fixtures; only claim human fun when actually observed.