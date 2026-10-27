# MCP demo transcript: redbank, seed 1

Played by `mcp/agent-demo.ts` through the real server over stdio (official SDK client). Not a language model: heuristics over the server's exact previews. Result: **victory** (The village endures — 14 of 14 saved), score 836, 15 accepted actions, 51 tool calls.

Browser-engine replay of the exported action log: state `1872b400e4e13b`, events `093601714aa854` -> **identical to the server**.

| # | tool | arguments | result |
| ---: | --- | --- | --- |
| 1 | `create_game` | `{"scenarioId":"redbank","seed":1}` | Started Flood at Redbank (seed 1, normal). Day 1 of 7; 3 Influence. Choose an opening story first. |
| 2 | `take_action` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","action":{"type":"PICK_STARTER","claim":"bridge_stands_watched"}` | You choose to tell: “A bridge never breaks while it is watched.” |
| 3 | `get_game_state` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8"}` | Flood at Redbank, day 1/7. Influence 3/5. 14/14 alive, 14/14 homes, food 20. Calm brown water. |
| 4 | `get_game_state` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8"}` | Flood at Redbank, day 1/7. Influence 3/5. 14/14 alive, 14/14 homes, food 20. Calm brown water. |
| 5 | `compare_possible_actions` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","top":12}` | Compared 27 actions with exact previews; best first by conviction gained per Influence. |
| 6 | `take_action` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","action":{"type":"RITUAL","ritual":"keep_vigil","landmark":"br",` | Watch — Redbank Bridge. Good omen: a calm night. The bridge will stand, and be seen to stand. 5 watch: Mara Wells 0→25, Osric Pell 0→24, Hester Grane 0→24, Dr. Elspeth Voss 0→31, Cass Marlow 0→26. The |
| 7 | `get_game_state` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8"}` | Flood at Redbank, day 1/7. Influence 1/5. 14/14 alive, 14/14 homes, food 20. Calm brown water. |
| 8 | `compare_possible_actions` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","top":12}` | Compared 19 actions with exact previews; best first by conviction gained per Influence. |
| 9 | `take_action` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","action":{"type":"SEED","claim":"bridge_stands_watched","target"` | You tell Tilly Wells: “Bridge stands watched”. Conviction 0 → 23. |
| 10 | `get_game_state` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8"}` | Flood at Redbank, day 1/7. Influence 0/5. 14/14 alive, 14/14 homes, food 20. Calm brown water. |
| 11 | `end_day` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","expectedRevision":3,"idempotencyKey":"demo-4"}` | Your story is spreading. |
| 12 | `get_game_state` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8"}` | Flood at Redbank, day 2/7. Influence 3/5. 14/14 alive, 14/14 homes, food 19. Debris on the current. |
| 13 | `get_game_state` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8"}` | Flood at Redbank, day 2/7. Influence 3/5. 14/14 alive, 14/14 homes, food 19. Debris on the current. |
| 14 | `compare_possible_actions` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","top":12}` | Compared 40 actions with exact previews; best first by conviction gained per Influence. |
| 15 | `take_action` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","action":{"type":"RITUAL","ritual":"keep_vigil","landmark":"br",` | Watch — Redbank Bridge. Good omen: a calm night. The bridge will stand, and be seen to stand. 5 watch: Mara Wells 29→43, Osric Pell 33→46, Hester Grane 39→51, Dr. Elspeth Voss 41→56, Cass Marlow 31→46 |
| 16 | `get_game_state` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8"}` | Flood at Redbank, day 2/7. Influence 1/5. 14/14 alive, 14/14 homes, food 19. Debris on the current. |
| 17 | `compare_possible_actions` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","top":12}` | Compared 40 actions with exact previews; best first by conviction gained per Influence. |
| 18 | `take_action` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","action":{"type":"MESSENGER","claim":"bridge_stands_watched","fr` | Hester Grane carries “Bridge stands watched” to Brother Aldous (trust 50). Conviction 7 → 41. |
| 19 | `get_game_state` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8"}` | Flood at Redbank, day 2/7. Influence 0/5. 14/14 alive, 14/14 homes, food 19. Debris on the current. |
| 20 | `end_day` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","expectedRevision":6,"idempotencyKey":"demo-7"}` | 3 new believers, the rival struck |
| 21 | `get_game_state` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8"}` | Flood at Redbank, day 3/7. Influence 3/5. 14/14 alive, 14/14 homes, food 18. The water drops back a hand. |
| 22 | `get_game_state` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8"}` | Flood at Redbank, day 3/7. Influence 3/5. 14/14 alive, 14/14 homes, food 18. The water drops back a hand. |
| 23 | `compare_possible_actions` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","top":12}` | Compared 40 actions with exact previews; best first by conviction gained per Influence. |
| 24 | `end_day` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","expectedRevision":7,"idempotencyKey":"demo-8"}` | 3 new believers |
| 25 | `get_game_state` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8"}` | Flood at Redbank, day 4/7. Influence 5/5. 14/14 alive, 14/14 homes, food 17. Rain upriver. |
| 26 | `get_game_state` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8"}` | Flood at Redbank, day 4/7. Influence 5/5. 14/14 alive, 14/14 homes, food 17. Rain upriver. |
| 27 | `compare_possible_actions` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","top":12}` | Compared 40 actions with exact previews; best first by conviction gained per Influence. |
| 28 | `take_action` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","action":{"type":"MESSENGER","claim":"bridge_stands_watched","fr` | Mara Wells carries “Bridge stands watched” to Dunn Reed (trust 45). Conviction 10 → 36. |
| 29 | `get_game_state` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8"}` | Flood at Redbank, day 4/7. Influence 4/5. 14/14 alive, 14/14 homes, food 17. Rain upriver. |
| 30 | `compare_possible_actions` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","top":12}` | Compared 40 actions with exact previews; best first by conviction gained per Influence. |
| 31 | `end_day` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","expectedRevision":9,"idempotencyKey":"demo-10"}` | 3 new believers |
| 32 | `get_game_state` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8"}` | Flood at Redbank, day 5/7. Influence 5/5. 14/14 alive, 14/14 homes, food 16. A deceptive lull. |
| 33 | `get_game_state` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8"}` | Flood at Redbank, day 5/7. Influence 5/5. 14/14 alive, 14/14 homes, food 16. A deceptive lull. |
| 34 | `compare_possible_actions` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","top":12}` | Compared 40 actions with exact previews; best first by conviction gained per Influence. |
| 35 | `end_day` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","expectedRevision":10,"idempotencyKey":"demo-11"}` | 1 new believer, the rival struck |
| 36 | `get_game_state` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8"}` | Flood at Redbank, day 6/7. Influence 5/5. 14/14 alive, 14/14 homes, food 13. The bridge groans. |
| 37 | `get_game_state` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8"}` | Flood at Redbank, day 6/7. Influence 5/5. 14/14 alive, 14/14 homes, food 13. The bridge groans. |
| 38 | `compare_possible_actions` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","top":12}` | Compared 40 actions with exact previews; best first by conviction gained per Influence. |
| 39 | `take_action` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","action":{"type":"MESSENGER","claim":"bridge_stands_watched","fr` | Ivo Thatcher carries “Bridge stands watched” to Dunn Reed (trust 72). Conviction 50 → 69. |
| 40 | `get_game_state` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8"}` | Flood at Redbank, day 6/7. Influence 4/5. 14/14 alive, 14/14 homes, food 13. The bridge groans. |
| 41 | `compare_possible_actions` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","top":12}` | Compared 40 actions with exact previews; best first by conviction gained per Influence. |
| 42 | `end_day` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","expectedRevision":12,"idempotencyKey":"demo-13"}` | 2 new believers, 1 law activated |
| 43 | `get_game_state` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8"}` | Flood at Redbank, day 7/7. Influence 5/5. 14/14 alive, 14/14 homes, food 10. THE GREAT SURGE. |
| 44 | `get_game_state` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8"}` | Flood at Redbank, day 7/7. Influence 5/5. 14/14 alive, 14/14 homes, food 10. THE GREAT SURGE. |
| 45 | `compare_possible_actions` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","top":12}` | Compared 40 actions with exact previews; best first by conviction gained per Influence. |
| 46 | `take_action` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","action":{"type":"MESSENGER","claim":"bridge_stands_watched","fr` | Mara Wells carries “Bridge stands watched” to Old Harl (trust 70). Conviction 53 → 71. |
| 47 | `get_game_state` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8"}` | Flood at Redbank, day 7/7. Influence 4/5. 14/14 alive, 14/14 homes, food 10. THE GREAT SURGE. |
| 48 | `compare_possible_actions` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","top":12}` | Compared 40 actions with exact previews; best first by conviction gained per Influence. |
| 49 | `end_day` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","expectedRevision":14,"idempotencyKey":"demo-15"}` | 8 homes lost |
| 50 | `get_results` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8","whatIf":true}` | Victory: The village endures — 14 of 14 saved |
| 51 | `export_replay` | `{"runId":"r_03bffc36c0f71eb95cc82a33095211c8"}` | Replay of 15 accepted actions. Feed it to the browser engine or replayRun to reproduce the run exactly. |
