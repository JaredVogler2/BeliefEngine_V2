# V1 → V2 migration record (phase 02)

What was brought over from BeliefEngine V1, how, what was left out, what changed on the way, and how to re-check all of it.
The results of running the migrated code are in [`BASELINE.md`](BASELINE.md); the source audit is [`V1_AUDIT.md`](V1_AUDIT.md).

## Source

| | |
|---|---|
| Repository | https://github.com/JaredVogler2/BeliefEngine |
| Pinned commit | `6a928620ad30eeaeaf3a0e4d670e3c958e673368` (`main`, 2026-10-27 08:58:05 −0400, "Merge pull request #1 from JaredVogler2/claude/gracious-gates-95kmda"); `origin/main` and the V1 working branch pointed at the same commit when it was imported |
| History | 67 commits, all ancestors of V2's import commit |
| Licence | MIT, "Copyright (c) 2026 Belief Engine contributors" ([`LICENSE`](../LICENSE), carried unchanged) |
| Not imported | V1's open pull request [JaredVogler2/BeliefEngine#2](https://github.com/JaredVogler2/BeliefEngine/pull/2) (3D part 2, unmerged and still receiving commits when V2 was cut; based on `6a92862`, so it merges later as ordinary history: [`V1_AUDIT.md`](V1_AUDIT.md) §16) |
| V1 left untouched | Nothing was committed, pushed or written to the V1 repository. Its checkout had no local changes before or after (`git status --porcelain` empty, `HEAD` still `6a92862`). The V1 baseline was run in a separate throw-away clone. |

## Method

An unrelated-history merge (`git merge --allow-unrelated-histories 6a92862`, V2 commit `a5c1c8a`), so the pinned V1 commit is a
parent of the V2 import and `git log --follow` / `git blame` work for every V1 file. Not a template copy, not a squash: the golden
fixtures, the CI workflow, the lockfile and the docs' evidence data came across exactly as committed.

## Placement

| V1 path | V2 path | Why |
|---|---|---|
| `src/`, `mcp/`, `server/`, `scripts/`, `tests/` (incl. `tests/fixtures/*-traces.json`), `public/`, `index.html`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `playwright.config.ts`, `eslint.config.js`, `vercel.json`, `.github/workflows/ci.yml`, `.gitignore`, `LICENSE` | same | the game, its tests and its tooling, byte for byte at import |
| `docs/**` except the rows below | same | V1's reference docs and evidence; see [`docs/README.md`](README.md) for which is which |
| `README.md` | `docs/v1/README.md` | V2's `README.md` keeps the root; the V1 copy's links were re-pointed to where the files now live and a provenance note added (its text is otherwise V1's) |
| `docs/PROGRESS.md` | `docs/v1/PROGRESS.md` | `docs/PROGRESS.md` is the V2 progress log required by `prompts/AGENT_RUNBOOK.md` |
| `prompts/*.md`, `prompts/3d-rebuild/*.md` | `prompts/v1/`, `prompts/v1/3d-rebuild/` | V2's own numbered phase prompts own `prompts/`; V1's two conflicting files (`prompts/README.md`, `prompts/00_MASTER_GOAL.md`) were the only merge conflicts |

## Excluded

| Path (at `6a92862`) | Size | Why | How to get it back |
|---|---|---|---|
| `docs/data/tournament/{baseline,deep,after,after-others}/runs.csv.gz` | 444 KB | Raw per-run tournament output. No test, script default or CI step reads them (the comparison flow reads `tmp/tournament/<name>/runs.csv`, which `npm run test:sim` regenerates); `prompts/V1_CODE_AUDIT_SUMMARY.md` asks not to carry generated tournament artifacts without need. The summaries and reports beside them were kept. | `git show 6a928620ad30:docs/data/tournament/<name>/runs.csv.gz > runs.csv.gz` |
| `node_modules/`, `dist/`, `test-results/`, `playwright-report/`, `tmp/`, `.env*` | — | never tracked in V1 (its `.gitignore`); no `.env` file, key-shaped string or credential exists in V1's tracked files (checked with `git ls-files` and a `git grep` for `sk-ant-`, `sk-…`, `AKIA…`, `ghp_…`, `xox?-`, private-key headers: no hits) | — |

## Changes made after the import

All in commits after `a5c1c8a`; `git diff 6a92862 HEAD -- src/engine mcp server` shows none of them touching the engine, the MCP
server or the interpreter proxy.

| Change | Files | Why |
|---|---|---|
| App identity: package `belief-engine-v2` `2.0.0-alpha.0` (lockfile header regenerated with `npm install --package-lock-only`), page title and description, a "V2" mark on the title screen, the "browser too old" notice | `package.json`, `package-lock.json`, `index.html`, `src/ui/screens.tsx`, `src/styles.css`, `src/main.tsx` | phase 02: "adjust package name/app identity" |
| **Kept on purpose:** save format `belief-engine-save`, archive format `belief-engine-progress`, catalog format, the MCP server name `belief-engine` and its `belief-engine://` resources, MCP run-file format, `localStorage` keys (`be:save:v1`, `belief.renderer`, …) | — | these are compatibility contracts: V1 saves, archives, run files and MCP client configurations keep working in V2 |
| three.js credited: it ships in the 3D chunk but V1's production licence inventory, `docs/ASSETS.md` and the Credits screen named only React (a V1 attribution gap) | `docs/THIRD_PARTY_LICENSES_PROD.md`, `docs/THIRD_PARTY_LICENSES.md` (regenerated by `scripts/licenses.ts`), `docs/ASSETS.md`, `src/ui/screens.tsx` | carry licences and attributions |
| V2 capability switches, all `false` | `src/v2/features.ts` | phase 02: "new V2 feature flags default to OFF"; compile-time constants, so nothing a visitor types can enable a paid capability |
| Migration tripwire | `tests/unit/v2-migration.test.ts` | pins the 12 authored route hashes, the 25 tournament traces, six opening-state fingerprints (three chapters, three generated villages) and the expedition catalog to the values V1 printed |
| First browser tests that draw the Three.js world | `tests/e2e/v2-world3d.spec.ts` | V1's browser suite never forces `?renderer=3d`, and a browser without a GPU (headless Chromium here, GitHub's standard runners) is a software rasteriser, where the game defaults to the 2D map: the 3D world had no browser coverage at all (see [`V1_AUDIT.md`](V1_AUDIT.md)) |
| V2 documentation | `docs/{README,PROGRESS,CONTINUE_HERE,V1_AUDIT,ARCHITECTURE,MIGRATION,BASELINE,3D_VISUAL_STANDARD,3D_IMPLEMENTATION_PLAN,3D_QUALITY_REPORT}.md`, `docs/screenshots/v2-baseline/` | phase 01/02 records and the visual standard |

## Proving it is the same game

The same values were printed by one script in the V1 clone and in V2, and the two printouts were byte-identical:

| What | Value |
|---|---|
| versions | rules `1.0.0`, save schema `1`, generator `1`, belief language `1` |
| Redbank seed 1, Fire Wall / Witness Bridge | state `11ec6d73416e26` / `1fd91495f0ef6e`, events `1786c582e48ec0` / `0067ab92df806f` |
| all 12 authored traces (3 chapters × fire/bridge-style wins, do-nothing, failed attempt) | listed in `tests/unit/v2-migration.test.ts`, each replayed with zero rejected actions |
| 25 tournament regression traces | digest `00c1b1ef584bd5` |
| opening states | Redbank 1 `0c38d1b48858c2`, Harvest 1 `1554fb5933d95b`, Ashwood 6 `1de08b16a96461`, generated `x1.1` *Flood at Lowcross* `056596ed9a6616`, `x1.3` *Drought at Fenneldale* `0403fabf7f5dca`, `x1.5` *Wolves of Embercombe* `0c6034a601672c` |
| verified expedition catalog (`src/engine/gen/catalog.json`) | digest `17e472b720f7b7` |

`tests/unit/v2-migration.test.ts` now asserts all of them on every `npm test`. It was mutation-checked: changing one expected
state hash and one opening fingerprint made exactly those two tests fail.

## Re-checking

```bash
git diff 6a92862 HEAD --stat -- src/engine mcp server tests/fixtures   # empty: engine, MCP, proxy and goldens untouched
git diff -M 6a92862 a5c1c8a --name-status | grep -v '^R100'            # what the import itself changed
npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run size
npm run replay:example && npm run replay:example -- witnessBridge
npm run test:sim:smoke
npm run test:e2e                                                        # includes tests/e2e/v2-world3d.spec.ts
```
