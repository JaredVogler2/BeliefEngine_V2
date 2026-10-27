# State-hash check of the phase 11 balance change

Commands (run on this repository at the commit that introduced the Hearth rival, and at its parent):

```
npm run test:sim -- --scenario all --seeds 1000 --determinism 12 --name baseline        # parent commit
npm run test:sim -- --scenario redbank --seeds 1000 --determinism 12 --name after --compare tmp/tournament/baseline/runs.csv
npm run test:sim -- --scenario harvest,ashwood,expedition --seeds 100 --determinism 4 --name after-others --compare tmp/tournament/baseline/runs.csv
```

The published `runs.csv.gz` files leave out the `stateHash` column (32 000 random hex strings do not compress and would add 500 KB).
Comparing the full CSVs, which include it:

| Cohort | Runs compared (policy x seed) | Identical final state hash | Different |
| --- | ---: | ---: | ---: |
| harvest (seeds 1-100) | 800 | 800 | 0 |
| ashwood (seeds 1-100) | 800 | 800 | 0 |
| expedition (seeds 1-100) | 800 | 800 | 0 |
| redbank (seeds 1-1000) | 8 000 | 0 | 8 000 (expected: the scenario now carries one more claim and one more rival) |

So the change is confined to Flood at Redbank. Within Redbank the results of `greedy`, `threat-aware`, `broadcaster` and `noop` are
identical seed by seed (+0 / -0 in `after/COMPARISON.md`); only the routes that rely on the bridge law moved.
