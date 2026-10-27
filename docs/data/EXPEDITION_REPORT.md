### Procedural villages: generation and solvability (generator v1, rules 1.0.0)

Seeds 1–1000 (1000 villages) were generated, checked and played by scripted planners on this machine in 155 s of wall time (0.15 s per village on 4 workers, each village played up to four times). Raw data: `docs/data/expeditions.json`.

| Check | Result |
| --- | --- |
| Hard crashes | 0 |
| Villages that passed every structural invariant | 1000 of 1000 |
| Needed a derived seed (first draw rejected) | 213 of 1000 (21.3%) |
| Still failed after 24 derived seeds | 0 (reported, not hidden) |
| "Do nothing" wins the village | 0 |
| Won by at least one planner (verified) | 853 (85.3%) |
| Won by two or more different planners | 518 (51.8%) |
| Median generation time (incl. do-nothing check) | 9 ms |

| Biome | Villages | Verified | Rate | Two+ planners win |
| --- | --- | --- | --- | --- |
| river | 334 | 273 | 81.7% | 116 |
| drought | 334 | 328 | 98.2% | 269 |
| wolves | 332 | 252 | 75.9% | 133 |

| Planner | Villages won |
| --- | --- |
| caravans | 322 |
| moonlight | 275 |
| witness-bridge | 223 |
| smoke-ring | 208 |
| decoy | 177 |
| bell-ringer | 94 |
| fire-wall | 89 |

| Run modifier | Villages | Verified | Rate |
| --- | --- | --- | --- |
| busy_harvest | 126 | 120 | 95.2% |
| clear_night_skies | 72 | 72 | 100.0% |
| cross_bank_mistrust | 162 | 112 | 69.1% |
| divided_council | 184 | 151 | 82.1% |
| doubting_scholars | 182 | 170 | 93.4% |
| early_frost | 70 | 69 | 98.6% |
| low_fuel | 170 | 141 | 82.9% |
| overcrowded_refuge | 47 | 44 | 93.6% |
| restless_wolves | 89 | 62 | 69.7% |
| river_of_reeds | 56 | 39 | 69.6% |
| silent_bells | 123 | 112 | 91.1% |
| soot_season | 47 | 36 | 76.6% |
| stubborn_elders | 195 | 156 | 80.0% |
| travelling_circus | 224 | 198 | 88.4% |

**Variety.** 640 distinct gameplay signatures in 1000 villages (signature = biome, size class, choke topology, headline crisis number, starting stories, run modifiers). In every aligned window of 12 successive seeds there were at least 11 distinct signatures. The biome shuffle bag guarantees each biome appears twice in every aligned run of six seeds.

**Known false negatives.** 147 villages (14.7%) were not won by any of the scripted planners (three per biome, deliberately simple). That is not proof that they cannot be won: a human who reads the omens and the social graph plays better than a greedy planner. These seeds are excluded from the verified catalog (daily villages and "another village" never choose them) and are labelled "Unverified seed" if a player types one in. Guaranteed solvability is **not** claimed.

