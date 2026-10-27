# V2 baseline verification (phase 02)

The V1 game was run twice on 2026-10-27, in the same container: once from a throw-away clone of V1 at `6a92862` (the "V1" column) and
once from this repository after the import (the "V2" column). Same machine, same toolchain, same browser. Every number below was
produced by these runs; nothing is copied from V1's own records.

**Environment:** Linux container, 4 CPUs, 15 GB RAM; Node 22.22.0, npm 10.9.4; Playwright 1.63.0 with Chromium build 1243 headless;
WebGL through **ANGLE on SwiftShader** (a CPU rasteriser, no GPU). No network calls to any model; no key present.

## Commands and results

| Command | V1 (`6a92862`) | V2 (this repository) |
|---|---|---|
| `npm ci` | 280 packages, 8 s | 280 packages, 7 s |
| `npm run typecheck` | pass (13 s) | pass (10 s) |
| `npm run lint` | pass (13 s) | pass (11 s) |
| `npm test` | **28 files, 356 tests passed** (64 s) | **29 files, 364 tests passed** (65 s): V1's 356 + 8 in `v2-migration.test.ts` |
| `npm run build` | pass; entry 803.45 kB / 3D chunk 738.29 kB / CSS 23.12 kB (minified) | pass; 803.52 kB / 738.29 kB / 23.22 kB (the identity strings and the logo mark) |
| `npm run size` | entry 228 KB gz (budget 260), 3D 193 KB (270), CSS 6.2 KB (12) | same |
| `npm run test:sim:smoke` | 256/256 runs, `SMOKE OK` | 256/256 runs, `SMOKE OK`; **output identical to V1's** apart from timings |
| `npm run replay:example` | `11ec6d73416e26` / `1786c582e48ec0`, identical to the record | identical |
| `npm run replay:example -- witnessBridge` | `1fd91495f0ef6e` / `0067ab92df806f`, identical | identical |
| `npm run mcp:demo` (scripted agent over real stdio, seed 7) | defeat, score 526, 24 actions; replay state `0ca9a1bd3d54bf`, events `13018e62cefaee`, IDENTICAL to the server | identical output except the random run id |
| `npm run acceptance:mcp` (Journey B, official SDK client) | 28/28 checks | 28/28 checks; the same hashes (`1fd91495f0ef6e`, `0067ab92df806f`, opening `0c38d1b48858c2`) |
| `npx tsx scripts/nl-demo.ts --village redbank` | every written belief replays with no model, IDENTICAL | identical output |
| `npx playwright test` (desktop 1366×768 + Pixel 7 390×844) | **140 passed, 52 skipped, 0 failed** (7.5 min) | **145 passed, 55 skipped, 0 failed** (8.7 min): V1's 140 + 5 in `v2-world3d.spec.ts`; skips are V1's 52 + 3 by design |

The 52 skips are V1's own project-specific skips (desktop-only or phone-only tests), identical in both runs.

The simulation smoke prints three balance warnings in both V1 and V2 (pre-existing, not introduced by the import): Redbank
*evidence-first wins 95 % or more of seeds*; Ashwood *only one thoughtful policy wins at least 10 % of seeds* and *no two policies
share and differ in winning seeds*. They are design signals for the balance phases, not failures.

## What the browser suite does and does not cover

V1's browser specs never ask for the 3D world, and a GPU-less browser gets the 2D map by design (`src/render/choose.ts`), so every one of
those tests runs on the 2D map. `tests/e2e/v2-world3d.spec.ts` forces `?renderer=3d`:

| Test | Desktop | Phone (Pixel 7, touch) |
|---|---|---|
| boots on WebGL2, paints the village, reports a real scene (draw calls > 10, triangles > 10 k) | pass (21 s) | pass (15 s) |
| a click on a person in the 3D scene selects them; telling a story shows an effect; the night resolves with the engine's own state **and** event hash for `PICK_STARTER → SEED → END_DAY` | pass (1.3 min) | pass (49 s) |
| a tap on a person in the 3D scene selects them; no sideways scroll | skipped (touch only) | pass (18 s) |
| the first two days of the recorded Fire Wall route (8 actions, 2 nights) clicked while the 3D world draws reach the engine's state and event hash | **pass**: 5.5 min on its own while the spec was being written, and again on the final code with `BE_SLOW_3D=1` (7.7 min for the whole desktop project while screenshot captures shared the CPU); skipped by default | skipped (desktop only) |

The slow test is opt-in because V1's own CI ran its 2D suite in 14.0 min against 7.5 min here, so it would take about 11 minutes on a
CI runner; its passing run above is the evidence for this baseline.

## The 3D world in numbers (this container)

Forced 3D, Redbank seed 1, day 1, after the scene settled:

| Viewport | Tier chosen | Render scale | Frames per second | Draw calls | Triangles | Console errors |
|---|---|---|---|---|---|---|
| 1366×768 | low (automation + software GL) | 0.69 | 2.9 | 566 | 222,733 | 0 |
| 390×844 | low | 0.60 | 4.4 | 527 | 219,739 | 0 |

At the high tier, pinned for screenshots, the same scene is 1,101 draw calls and 494,842 triangles (Ashwood: 900 and 1,497,252);
per-frame figures are in [`3D_QUALITY_REPORT.md`](3D_QUALITY_REPORT.md). The renderer string was `ANGLE (Google, Vulkan 1.3.0
(SwiftShader Device (Subzero)), SwiftShader driver)`. These frame rates describe a
CPU rasteriser and say nothing about a GPU, which has not been measured.

## Golden values

Printed by the same script in both trees and byte-identical (see [`MIGRATION.md`](MIGRATION.md)); now asserted on every `npm test` by
`tests/unit/v2-migration.test.ts`: all 12 authored route hashes, the 25 tournament traces (digest `00c1b1ef584bd5`), six opening-state
fingerprints and the verified expedition catalog (digest `17e472b720f7b7`).

## Captures

Real frames of the running production build (the Three.js canvas and, for comparison, the 2D map) are in
[`screenshots/v2-baseline/`](screenshots/v2-baseline/) and scored in [`3D_QUALITY_REPORT.md`](3D_QUALITY_REPORT.md).

## Not covered here

WebKit and Firefox ran only V1's cross-browser smoke (on CI), never the 3D spec; no real GPU, phone, Safari or human; no deployment; no
live model.
