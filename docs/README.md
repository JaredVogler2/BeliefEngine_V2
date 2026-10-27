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
| [`3D_VISUAL_STANDARD.md`](3D_VISUAL_STANDARD.md) | the art direction and the measurable visual bar for the 3D world |
| [`3D_IMPLEMENTATION_PLAN.md`](3D_IMPLEMENTATION_PLAN.md) | the staged plan to reach that bar on the existing Three.js renderer |
| [`3D_QUALITY_REPORT.md`](3D_QUALITY_REPORT.md) | what the 3D world looks like today, from real browser captures, scored honestly |
| [`screenshots/v2-baseline/`](screenshots/v2-baseline/) | those captures (real Three.js canvas and the 2D map, never mock-ups) |

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
