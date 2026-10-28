# Performance: targets, how they are measured, and what was measured

> The 3D world's own scene budgets, tiers, bundle split and frame times (measured on a software rasteriser, never on a GPU or phone) are in [`docs/3d-rebuild/PERFORMANCE.md`](3d-rebuild/PERFORMANCE.md). The figures below are for the engine and the classic map and are unchanged.

Every number here was produced by a command in this repository on the machine named below; none is a claim about a particular phone.
**Machine:** 4 vCPU Intel Xeon @ 2.1 GHz, 15.7 GB RAM, Linux container, Chromium 153.0.8010.12 headless on a software renderer
(no GPU), Node 22. A phone's CPU is slower than this per core and its GPU faster at compositing; treat these as a reproducible baseline and a
regression guard. No real phone has been profiled.

## Targets (from the brief) and results

| Target | Result | How |
| --- | --- | --- |
| Resolve a day in under 250 ms for the default village | **2.8 ms** median (14 villagers) | `tests/unit/perf.test.ts` (fails above 250 ms) |
| Same for a 100-agent village | **4.2 ms** median (98 villagers: the default village cloned 7x with ties) | same test |
| Interactive turn: list actions, forecast | 44 options in **7.6 ms**; forecast **1.3 ms** | same test |
| Save + load a late-game village | **2.6 ms**, 68 KB | same test |
| Whole simulated run | median 8-26 ms (no-op) to 70-360 ms (generic policies, previews every candidate action) | tournament reports (`docs/BALANCE_REPORT.md`) |
| 60 FPS on a moderate desktop | **60 fps** (min 58) during a night's resolution effects | `scripts/profile-ui.ts` (`npm run profile`), 5 cold runs |
| Stable 30+ FPS on an older phone | **not measured** (no device) | the low-quality profile caps effects at 36 and halves the frame rate when idle |
| Cold start | DOMContentLoaded **84 ms**, title screen visible **180 ms** | `npm run profile` |
| First interactive action | Begin to painted map **116 ms**; story, villager and action to Influence updated **285 ms** (includes opening the Village tab) | `npm run profile` |
| End-turn animation | Confirm End Day to the digest on screen **130 ms** | `npm run profile` |
| Memory | **11.3 MB** JS heap after loading a late-game village | `npm run profile` |
| Bundle | **197 KB gzip** JavaScript (691 KB raw), **6 KB gzip** CSS, 2 files; budget 260 KB / 12 KB | `npm run size` (also in CI) |

## What keeps it cheap

* The simulation is pure data in, data out: `cloneState` is a hand-written copy that shares the immutable map, scenario and event objects, so a
  preview (which clones) costs microseconds and a whole bot run costs milliseconds.
* The renderer draws terrain once into an offscreen canvas and redraws only when something changes or animates; idle frames drop to about 18 fps, and to
  none when motion is reduced. Effects are capped at 80 (36 on the low profile); gossip strokes at 26 per resolution.
* The UI re-renders when the run state changes (the store bumps a version number), not per animation frame; the canvas animates on its own timer outside React.
* The event log is the one unbounded structure: a full 7-day run holds a few thousand events (asserted below 20 000 in `perf.test.ts`); the log panel and the
  history tool paginate, and the digest shows only importance 2 and above.
* Tournaments and the village generator run in a CLI (child processes), never in the player's tab.

## Reproduce

```
npm run build && npm run size            # bundle budget
npm run preview &  npm run profile       # cold start, first action, end-turn, fps, heap (prints a Markdown table)
npx vitest run tests/unit/perf.test.ts --reporter=verbose --silent=false
```

`docs/data/ui-profile.json` is the latest profile output. Numbers vary by machine; the tests only assert the brief's own 250 ms ceiling, which is about
fifty times what this container needs, so a failure means a real regression.
