> V1's `docs/3D_QUALITY_REPORT.md` as of `22b7b1c53ab5` (JaredVogler2/BeliefEngine `main`, its world-class visual pass), merged into V2 on
> 2026-10-28 and kept here for reference. V2's own document is [`../3D_QUALITY_REPORT.md`](../3D_QUALITY_REPORT.md); paths below are V1's.

# Belief Engine: 3D quality report (world-class visual pass)

This is the record of the visual pass that followed the 3D rebuild. It covers:

* what was changed;
* how each change was checked;
* the frames that were looked at;
* the scores;
* what could not be verified here.

The standard the frames are judged against is `docs/3D_VISUAL_STANDARD.md` (an inked storybook diorama). The work plan is
`docs/3D_IMPLEMENTATION_PLAN.md`. Earlier reviews are in `docs/3d-rebuild/` (`VISUAL_QA.md`, `FINAL_REVIEW.md`).

**Where this was run.** A Linux container with 4 CPU cores and no GPU. WebGL is SwiftShader, a software rasteriser, in headless Chromium.
Every frame below was rendered by the real game from an engine state played by a bot through the save format; none is a mock-up. Each frame
was opened and looked at by the developer (an AI agent) against the standard. That is a real inspection, but it is one reviewer's eye, not a
player's or an artist's.

## The iterations

### Iteration 0: where the pass started

At the start (commit `6aaa41d`), the same frames looked like this:

* the green was saturated, toy-like;
* there were no outlines;
* ambient light was flat, from a hemisphere light only;
* the houses had blank backs;
* there were no yards and no props;
* a few repeated tree shapes stood in open grass.

Before/after pairs from the same seed and camera:

* `docs/3d-rebuild/screenshots/wc/compare-A-overview.jpg`
* `docs/3d-rebuild/screenshots/wc/compare-B-closeup.jpg`
* `docs/3d-rebuild/screenshots/wc/compare-D-storm.jpg`
* `docs/3d-rebuild/screenshots/wc/compare-E-law.jpg`

### Iteration 1: the finishing chain switched on, and what the frames showed

This added the chain (`src/render3d/post.ts`) and sky light (`src/render3d/env.ts`):

* the scene renders into a half-float buffer with its depth;
* hollows are darkened by a depth-only ambient occlusion;
* a thin warm ink line is drawn on standing things;
* bloom is fed only by emitted light;
* ACES tone mapping and the sRGB encoding are applied once;
* FXAA follows;
* a pre-filtered procedural sky gives ambient light and soft reflections.

The first frames of the overview were **wrong**, and these were the defects found by looking at them:

1. **Washed-out sky, clouds and haze** (`wc/iter1-washed-out.jpg`). The sky, cloud sea and effects had been authored as screen colours and were
   never tone-mapped. One honest tone curve at the end now greyed them. Three.js also mixes fog in after its own tone mapping. The old look
   therefore depended on that order, and the fog came out brighter than before.
2. **Faction marks glowing like lamps.** Their white rims became very bright once compensated, and the bloom lit them.

Fixes:

* Colours authored for the screen go through an exact inverse of the tone curve while the chain draws, so they come out as authored. The
  inverse is computed from three.js's own ACES fit, and its round trip was checked numerically.
* The fog colour is converted the same way, to match three.js's ordering.
* The marks are held under white, so they never reach the glow threshold.
* The sky carries its own class code, so its compensated whites never trigger the brightness glow.

One gain was not aimed for: in the law-waking frame (`wc/compare-E-law.jpg`), the river under the ripples had been whited out, and now
it keeps its colour. The likely cause was not checked against the old build:

* Before, the additive ripples were drawn in screen colour and summed on the screen, where the sum clips to white.
* Now they are summed in the half-float buffer and tone-mapped once.

### Iteration 2: up close

The close-up (`wc/compare-B-closeup.jpg`) was right on the chain: roofs, trees, fences and people are inked; the grass and the ground's folds
are not. It also showed what the art pass had to fix:

* **A bug older than this pass.** Every window meant for a back wall had its wall distance negated, so it sat *inside the front wall*, and
  every house showed a blank back to a camera behind it. Fixed: back walls now have windows, and the window helper documents how back
  windows are given.
* **Bare yards.** There was nothing between the houses but grass. Now:
  * each home stands in trodden earth;
  * each has one or two of a woodpile, a hand cart, a washing line or a fenced kitchen garden, kept off doors, roads, water and fields;
  * windows are on the sides and backs;
  * tile roofs are terracotta, brick, glazed teal and umber;
  * the ground moved to the standard's sage and olive.

  These were checked from above in a top-down frame.

### Iteration 3: density, phones and people

* **Plain meadows** in the overview. Broken hedgerows now line the roadsides, a lone tree stands in open meadow now and then, and cypresses
  stand by doors and the chapel. Forests are denser and mixed: pine, cypress, oak in loose autumn drifts, birch.
* **Phones and screens**, measured at the brief's seven sizes in the 3D world:
  * The folded view-controls button, the story details button and, on 360 px phones, Undo and Open panel were **under 44 px**. They are now
    44×44.
  * **On a phone held sideways:**
    * the bottom bar wrapped into two rows;
    * the lens column was hidden, so lenses could not be switched at all;
    * the view controls ran under the story strip.

    Now it has one bar, four icon lenses and folded tools. The world's share at rest went from about 52% to about 67%
    (`wc/phone-844x390-landscape.jpg`).
* **People** were specks at the overview. They are now drawn at true size up close and up to about a third larger at the overview. Their
  tap volumes grow with them, and their faction marks ride at the new height.
* **Roofs** had a solid triangle at each end of the roof. It hung below the ridge as a dark fin on every house in the overview. The ends are
  now open under the overhang, with thin verges, and the gable wall beneath closes the house.
* **Chimney smoke was not showing at all.** Even after ten seconds of world time it did not appear in a close-up, enlarged. A probe of the
  live scene showed about a hundred smoke particles from the twelve lived-in homes.
  * **Cause:** a bug older than this pass. The chimney tops are given in a building's own units, and cottages are drawn 1.2 times larger,
    so every puff was born inside the roof. It had faded by the time it rose clear.
  * **Fix:** the emitter now applies the building's scale. The puffs are also larger, paler and longer-lived, with a larger pool for them,
    and are held under the brightness at which they would glow.

  Now a soft column rises from each lived-in chimney up close, and a faint wisp shows at the overview. Empty houses stay smokeless. The
  earlier review (`docs/3d-rebuild/VISUAL_QA.md`) counted "chimneys smoke" among the signs of life. It was judging from the code, and the
  smoke was not on screen.

### Iteration 4: the frames at the brief's sizes

New frames with the interface at four of the brief's sizes, all on Day 3 with the camera left at rest:

* `wc/phone-390x844.jpg`;
* `wc/phone-360x740.jpg`;
* `wc/phone-844x390-landscape.jpg`;
* `wc/desktop-1920x1080.jpg`.

The first capture of the two portrait phones showed a **framing defect**. The village sat well left of centre: its left corner ran off the
screen under the lens rail, while open sky was left on the right.

* **Cause.** The folded view-controls button at the top right was counted as a right-hand margin, as a desktop's full column of controls is.
  It shifted the whole view left, though on a phone it sits up beside the top bar, above the village.
* **Fix.** On a phone the view controls now float over the village's edge, as the lens rail always has, and no longer move it. A wide
  screen still frames the village clear of both.
  * A first version still counted the controls once they were unfolded, so opening them re-framed the village farther out.
  * The full 3D suite caught it: the camera test's reset came back 12 units away from home.
  * The rule is now the rail's.

  The plate is now centred:
  * A tall phone starts a little closer in, by design, so the plate's two side corners are cropped evenly.
  * A phone on its side centres the plate on the screen, well clear of the rail.

  The phone frames of the matrix (I, J, L) were recaptured with the fix. None of these seven frames shows the defect any more. They were
  taken with the first version of the fix, which frames a phone at rest exactly as the final rule does: a recapture of the 390×844 frame
  under the final rule differs from it by 0.004% (mean absolute error), which is the random smoke.

## Scores (1 to 5)

Each score names the frame or measurement it rests on. No area is scored on something that was not looked at.

These scores were given once, on the final frames. Each iteration above was driven by the defects that its round of frames showed.
Interim scores were not recorded at the time, so none are given here, although the plan asked for scores in every round.

| Area | Score | Evidence | What holds it back |
|---|---:|---|---|
| Art direction and cohesion | **4** | One written direction applied everywhere: palette, ink on standing things only, glow only for light and magic, weather as mood (A, B, D, E) | The ink has one weight everywhere; no variation for silhouette against interior lines |
| Geometry and materials | **4** | Five cottage types with windows all round, open gables, footings, chimneys, shutters and doors; civic buildings; yard props; painted PBR materials with sky reflections (B, top-down frame) | People are still simple figures (score 3 on their own); walls are plain plaster up close |
| Lighting and depth | **4** | Warm sun with soft PCF shadows, sky light, AO in hollows, ink separating planes, fog by distance (A, B, D) | No bounced light; on the low tier the AO is off |
| Environmental richness | **4** | Dense mixed forests, hedgerows, yards with props, the cloud sea and islets, birds, smoke (A, B) | Open ground is still plainer than the reference's; no life on the water |
| Animation and life | **3** | Wind in every tree and grass, a flowing river, rain rings, walking and working people, birds, smoke, drifting islets. Measured frame to frame by region (Motion, below) | Not watched as video on a GPU; people's animation is simple |
| Interaction feedback | **4** | Hover and selection rings, the route to shelter, magic rings and runes that glow, cards anchored to what they describe (E, `world3d.spec.ts`) | — |
| Camera | **4** | Bounded orbit, zoom to the cursor, wheel and trackpad zoom by distance turned, keyboard, buttons, portrait framing, insets (`world3d.spec.ts` drives real input) | Two-finger pinch is wired but has no automated test |
| Mobile | **4** in emulation | Seven sizes pass the layout test; a phone on its side is fixed; the village is centred on a phone at rest; controls 44×44 (`wc/phone-*.jpg`) | **A real phone was never used.** This score is for emulated layouts only |
| Performance | **UNVERIFIED** | Tiers, an adaptive render scale, and the chain's cost measured on its own (Performance with the chain, below) | No GPU and no phone in this container: real frame rates are unknown |

## Performance with the chain

These were measured on the final build with `scripts/perf-3d.ts`. The method and the full table are in
`docs/3d-rebuild/PERFORMANCE.md`, and the raw data in `docs/3d-rebuild/data/perf-chain.json`. Everything ran on a CPU rasteriser
(SwiftShader) at 683×384 pixels. The frame times can compare tiers and catch regressions; they say nothing about a GPU or a phone.

| Tier | Chain | Triangles (calm / flood) | Draw calls | Median frame (calm / flood) | 1% low fps | Chain's own cost, three runs |
|---|---|---:|---:|---:|---:|---:|
| low | ink | 245,992 / 270,764 | 376 / 412 | 324 / 329 ms | 2.8 / 2.4 | within noise (−1.6 to +11.9 ms) |
| medium | AO (2 pairs), ink, FXAA | 465,680 / 498,306 | 735 / 765 | 454 / 483 ms | 1.9 / 1.4 | 19–37 ms |
| high | AO (4 pairs), ink, bloom, FXAA | 597,483 / 660,940 | 742 / 776 | 566 / 590 ms | 1.2 / 1.4 | 20–37 ms |

* **Startup**, from handing the page a run to its first frame, took 4.9–10.8 s here. The world's own build is 0.9–1.2 s of that, and
  the rest was not broken down (shader compiling on the CPU, the sky light, the first frame). The JS heap was 28–40 MB.
* **A measurement that was wrong at first.** The first run made the chain look cheaper than no chain. The canvas was multisampled even
  under the chain, so the comparison's direct path paid for multisampling the whole scene. The canvas now asks for multisampling only
  where the chain cannot run, and the figures above come after that change.
* **Adapting to a slow machine.** The tier monitor steps `high → medium → low` when frames are slow, then lowers the render scale (an
  adaptive pixel ratio) to 0.5, and raises it again when there is room. The chain sheds parts with each tier. A machine with only a
  software rasteriser gets the classic map unless `?renderer=3d` asks for the 3D world.
* **What carries over to real hardware:** the scene counts and the memory. **Real frame rates, on any GPU or phone, are UNVERIFIED.**

## Motion

**How it was measured.** `scripts/capture-motion.ts` runs the real renderer:

1. It loads a Day-1 village and frames its middle at 1000×640.
2. It stops the live loop, so that nothing else moves time.
3. It advances the real animation clock in steps of 2 s with `advance()`, the same simulate-then-draw step the live loop takes, and
   photographs the canvas after each step.
4. It measures the mean absolute difference between neighbouring frames in four regions, as a share of the full colour range.
5. With `--dt 0` no time passes between the shots, which measures the noise floor.

The raw data is in `docs/3d-rebuild/data/motion.json` and `motion-floor.json`. The six frames are in `wc/motion-strip.jpg`.

| Region | Change per 2 s step (5 steps) | Noise floor (no time passing) |
|---|---:|---:|
| Far bank and sky (top fifth) | 1.53–1.63% | 0 |
| River and banks (centre) | 2.48–2.61% | 0 |
| Village (lower right) | 1.38–1.50% | 0 |
| Whole frame | 2.00–2.09% | 0 |

What this shows:

* **The renderer adds no change of its own.** The floor is exactly 0, so the picture changes only when the animation clock moves.
* **The motion is continuous, not a one-off.** Every region changes by a steady amount at every step, as continuous motion does: wind in
  trees and grass, the river's flow, people walking and working, smoke, drifting clouds.
* **The river moves most.**
* **Repeated runs match where nothing is random.** The village region gave exactly the same five numbers in two runs, one before the
  smoke fix and one after, so the animation there follows the clock alone. The regions where smoke rises differed slightly between the
  runs, because the puffs use random numbers.

What it cannot show is whether the motion looks smooth and pleasant at 60 frames a second on a GPU. That needs video on real hardware,
which was not available here.

## Mobile and screens

`world3d.spec.ts` › "at every screen size the brief names…" loads a Day-3 village in the 3D world at each of these sizes:

* 390×844;
* 393×852;
* 360×740;
* 844×390 (a phone on its side);
* 1920×1080;
* 1440×900;
* 1366×768.

At each it asserts:

* no sideways scroll;
* every top-bar, corner, lens, tool and bottom-bar control at least 44×44;
* End Day in view;
* the world at least 60% of a phone screen and 75% of a desktop.

It passes at all seven. The one-line tip's buttons keep a slim look, but their tap area is 44 px tall: an invisible box the layout check
cannot measure, so the test leaves them out.

The test measures the layout; it cannot judge the picture. For that, four of the sizes were captured with the interface on and looked at
(`wc/phone-390x844.jpg`, `wc/phone-360x740.jpg`, `wc/phone-844x390-landscape.jpg`, `wc/desktop-1920x1080.jpg`; phones at a device pixel
ratio of 2). That is how the off-centre village on phones (iteration 4) was found.

**Not verifiable here:**

* **Safe areas.** The layout uses `env(safe-area-inset-*)`, but desktop emulation has no notch, so the insets are 0 in every test.
* **Real devices.** Touch on a real phone, Safari on iOS, and how the game feels in the hand were not tried.

## Functional checks run on this pass

All runs used headless Chromium (and the other engines where named), software WebGL, and fonts made to match the CI runner. They were
made one at a time on the final build. The exact commands and counts are in `docs/TEST_RESULTS.md` ("3D visual pass").

* **Lint, types and unit tests:** `eslint`, `tsc` and 364 unit tests, all passing.
* **Browser tests:**
  * The full 3D suite on desktop and phone. Its first full run on the final code caught one real defect, the phone's view controls
    re-framing the village (iteration 4). With the fix:
    * desktop: 19 of 19 in that first full run. The fix changes nothing on a wide screen, and the camera test was re-run on both
      projects after it.
    * phone: 18 of 18 in a full re-run, with one desktop-only test skipped by design.
  * The full classic suite: 141 passed, 0 failed, and 53 skipped because they belong to the other project.
  * New tests in this pass cover the finishing chain, the seven screen sizes, and a closing panel taking a tap.
  * The cross-browser smoke (Chromium, Firefox, WebKit, iPhone profile) and the hosting check under the production Content-Security-Policy,
    which also loads the 3D world.
* **CI failures found and fixed today, each reproduced first:**
  * a 320 px title overflow under the runner's fonts;
  * a camera test timing out on 120 wheel events (zoom now follows the distance turned);
  * WebKit logging a console error when refused a WebGL context (now a quiet fallback);
  * a phone tap swallowed by the details panel sliding away (a closing panel now passes taps through; the new test failed 4 of 4 before and
    passed 4 of 4 after).

## Not verified, and not claimed

* **Real hardware.** No GPU, phone, iPhone or real Safari was used. Frame times here are a CPU rasteriser's.
* **Players.** No player has played this build; the scores are one reviewer's.
* **Video.** Motion was measured frame to frame, not watched as video on real hardware.
* **Deployment.** Nothing is deployed.
