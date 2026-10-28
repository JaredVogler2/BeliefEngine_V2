# Documentation map

V2 started by importing BeliefEngine V1 whole ([`MIGRATION.md`](MIGRATION.md)), so this folder holds three kinds of document. Read
the date and provenance before trusting a number: **only the V2 records were produced by running this repository**.

## V2 records (written for V2, from runs of this repository)

| Document | What it is |
|---|---|
| [`PROGRESS.md`](PROGRESS.md) | phase-by-phase log: what was built, the commands run and their exact results |
| [`CONTINUE_HERE.md`](CONTINUE_HERE.md) | where to pick up: last good commit, blockers, the next exact task |
| [`V1_AUDIT.md`](V1_AUDIT.md) | phase 01: the audited code map of V1 as imported, limitations, gap matrix, design decisions |
| [`MIGRATION.md`](MIGRATION.md) | phase 02: what was imported, placed, excluded and changed, and how to re-check it |
| [`BASELINE.md`](BASELINE.md) | phase 02: V1 and V2 test, build, replay, MCP and browser results side by side |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | how the migrated game is put together and where V2 work plugs in |
| [`AI_SETUP.md`](AI_SETUP.md) | phase 03: the online-reading service, its security and cost controls, setup steps (names only), the LIVE smoke test, what is and is not verified |
| [`COST_AND_QUOTAS.md`](COST_AND_QUOTAS.md) | phases 03 and 15 (formerly `AI_COSTS.md`): chosen models and catalog prices, per-call estimates (not measurements), every limit layer by layer, the operator monitor (`npm run ai:monitor`), configuration and evidence |
| [`SECURITY.md`](SECURITY.md) | phase 15: threat model, attacks with their controls and tests, physics and compute limits, the reliability chaos suite, the secret scan in CI, configuration, known limitations |
| [`PRIVACY.md`](PRIVACY.md) | phase 15: what leaves the device and why, who receives it and the gateway privacy routing (no training always; zero retention by setting), what the server keeps, device controls |
| [`REALITY_LANGUAGE.md`](REALITY_LANGUAGE.md) | phases 04 and 06: the AST v2 belief language, its world vocabulary and operators, price, grounding, the night executor, the new entities and the V1 bridge |
| [`MINDS.md`](MINDS.md) | phase 07: villager minds (personality, goals, memories with provenance), who thinks and what they can do, the model's `npc v2` contract, and conversations |
| [`REPLAY_V2.md`](REPLAY_V2.md) | phase 14: the external-decision ledger, how saves and MCP run files carry and check it, the debrief's offline replay check, privacy controls, and the evaluation corpus with its results ([`data/evals/REPORT.md`](data/evals/REPORT.md)) |
| [`MCP_V2.md`](MCP_V2.md) | phase 13: the V2 tools on the local MCP server (variants, propose/confirm a written belief, conversations, staged proof, places, the trust graph, rule explanations), versioned error kinds, optional online reading, and the stdio proof on the browser's hash |
| [`UX_V2.md`](UX_V2.md) | phase 12: the main menu's modes, the composer's draft, Stop and outage fallback, who tells it first, the villager glance and "Why?", phone sizes and keyboard, and what is verified where (real iPhone UNVERIFIED) |
| [`GAMEPLAY_V2.md`](GAMEPLAY_V2.md) | phase 11: the V2 modes and their separate records, what a written belief costs (rules 2), demonstrations, the strategic events, the balance tournament (rules 1 vs 2), the exploit fixed and the gate |
| [`data/tournament-v2/`](data/tournament-v2/) | phase 11: the Generative Reality tournament's reports (seven policies and two probes, three chapters, 30 seeds, both rule sets) |
| [`BELIEF_TO_REALITY.md`](BELIEF_TO_REALITY.md) | phase 09: the whole chain from a typed sentence to a changed world (preview, confirmation, persuasion, threshold, catalyst, consequences, provenance), the three proof claims and what the measurements found |
| [`3D_EFFECTS.md`](3D_EFFECTS.md) | phase 10: what written laws look like in 3D (the effect registry keyed by logged events, hens rising to the engine's height, the screenshot matrix, measured draw calls) and what is not met |
| [`3D_VISUAL_STANDARD.md`](3D_VISUAL_STANDARD.md) | the art direction and the measurable visual bar for the 3D world |
| [`3D_IMPLEMENTATION_PLAN.md`](3D_IMPLEMENTATION_PLAN.md) | the staged plan to reach that bar on the existing Three.js renderer |
| [`3D_QUALITY_REPORT.md`](3D_QUALITY_REPORT.md) | what the 3D world looks like today, from real browser captures, scored honestly |
| [`screenshots/v2-baseline/`](screenshots/v2-baseline/) | those captures (real Three.js canvas and the 2D map, never mock-ups) |
| [`screenshots/v2-phase03/`](screenshots/v2-phase03/) | the composer's consent notice and a simulated online reading, from the running production build |
| `screenshots/v2-phase05/` … [`screenshots/v2-phase10/`](screenshots/v2-phase10/) | each later phase's frames from the production build (composer, minds, social layer, the belief-to-reality chain, the 3D effect matrix) |

## Inherited V1 reference (describes the game as migrated; still true unless a V2 record says otherwise)

[`GAME_RULES.md`](GAME_RULES.md) (authoritative rules), [`CONTENT_SCHEMA.md`](CONTENT_SCHEMA.md), [`MCP.md`](MCP.md),
[`NL_BELIEFS.md`](NL_BELIEFS.md), [`EXPEDITIONS.md`](EXPEDITIONS.md), [`ACCESSIBILITY.md`](ACCESSIBILITY.md),
[`ART_AND_AUDIO.md`](ART_AND_AUDIO.md), [`ASSETS.md`](ASSETS.md), [`DECISIONS.md`](DECISIONS.md), [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md),
[`PERFORMANCE.md`](PERFORMANCE.md), [`PLAYTEST_PROTOCOL.md`](PLAYTEST_PROTOCOL.md), [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md),
[`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md) and [`THIRD_PARTY_LICENSES_PROD.md`](THIRD_PARTY_LICENSES_PROD.md) (both regenerated in V2).

## Inherited V1 evidence (records of runs made in V1's environment before the import)

[`FINAL_ACCEPTANCE.md`](FINAL_ACCEPTANCE.md), [`TEST_RESULTS.md`](TEST_RESULTS.md), [`FUN_REVIEW.md`](FUN_REVIEW.md),
[`BALANCE_REPORT.md`](BALANCE_REPORT.md), [`PLAYTHROUGH_NOTES.md`](PLAYTHROUGH_NOTES.md), [`data/`](data/), [`screens/`](screens/) (the 2D
map), [`3d-rebuild/STATUS.md`](3d-rebuild/STATUS.md), [`v1/PROGRESS.md`](v1/PROGRESS.md) and [`v1/README.md`](v1/README.md). They are
kept for traceability. A result in them counts as V2 evidence only where [`BASELINE.md`](BASELINE.md) shows it was re-run here.
