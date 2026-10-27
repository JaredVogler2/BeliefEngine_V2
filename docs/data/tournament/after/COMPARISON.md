# Paired comparison

Before: `tmp/tournament/baseline/runs.csv`. After: this run. Same scenario, policy and seed in both; "gained" = lost before, won now; "lost" = won before, lost now; p = exact two-sided sign test on those.

| Scenario | Policy | Seeds | Win % before | Win % after | Δ pts | Gained | Lost | p | Δ mean score |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| redbank | bridge-builder | 1000 | 99.5 | 81.5 | -18 | 5 | 185 | 0 | -50.5 |
| redbank | broadcaster | 1000 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| redbank | evidence-first | 1000 | 100 | 99.8 | -0.2 | 0 | 2 | 0.5 | -3.5 |
| redbank | exploit-seeker | 1000 | 41.3 | 19.9 | -21.4 | 22 | 236 | 0 | -34.3 |
| redbank | greedy | 1000 | 65.1 | 65.1 | 0 | 0 | 0 | 1 | 0 |
| redbank | noop | 1000 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| redbank | random | 1000 | 8 | 6.1 | -1.9 | 4 | 23 | 0 | -8 |
| redbank | threat-aware | 1000 | 81.9 | 81.9 | 0 | 0 | 0 | 1 | 0 |
