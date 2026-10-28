# Generative Reality at scale, with stored model outputs (phase 16)

`npx tsx scripts/sim-v2.ts --seeds 20 --villages 40`, 2026-10-28. **MOCK ONLY**: every "model" output is the scripted stand-in's
(no model was called; `fetch` throws). What this measures: that model-shaped inputs pass the server's and the engine's checks at scale,
and that a run whose action log stores them replays exactly with no provider. It says nothing about a real model's judgement.
Win rates here are not comparable with the policy-only tournament (`docs/data/tournament-v2/`): the stand-in replaces the thinking villagers' own policy each morning with a fixed rule (believers spread, skeptics investigate or challenge, the rest ask or wait).

| Measure | Count |
|---|---|
| runs (3 chapters x 9 policies x 20 seeds, 20 Reality Lab, 20 Living Village, 40 generated villages) | 620 |
| simulated days (game states resolved) | 4942 |
| villager decisions proposed by the stand-in and accepted by the engine | 8356 |
| stand-in decisions the server refused | 0 |
| beliefs written with the stand-in's reading / kept as the offline reader's | 500 / 0 |
| ledger entries (inputs from outside the rules) | 3171 |
| runs replayed from options + actions to the same state and event hashes, ledger identical | **620 of 620** |
| victories / defeats | 185 / 435 |
| wall time | 636.2 s |

| Policy (chapters) | runs | wins | stand-in decisions | stand-in readings | replayed exactly |
|---|---|---|---|---|---|
| noop | 60 | 0 | 480 | 0 | 60 |
| spam-broad | 60 | 14 | 938 | 60 | 60 |
| evidence-first | 60 | 39 | 1078 | 60 | 60 |
| bridge-persuasion | 60 | 0 | 1095 | 60 | 60 |
| inventive-compound | 60 | 4 | 925 | 60 | 60 |
| careful-synergy | 60 | 29 | 1006 | 60 | 60 |
| backfire-probe | 60 | 3 | 982 | 60 | 60 |
| ward-greedy | 60 | 48 | 1037 | 60 | 60 |
| rival-antagonist | 60 | 48 | 0 | 60 | 60 |

No run failed to replay.
