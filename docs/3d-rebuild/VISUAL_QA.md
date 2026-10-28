# 3D world: visual QA (screenshots, scorecard, defects)

> **Superseded in part.** The frames under `screenshots/` have been recaptured with the world-class pass: the finishing chain, the art pass
> and the phone layouts. Its iterations, before/after pairs and scores are in `docs/3D_QUALITY_REPORT.md`. The frames this page describes are
> in the git history at commit `6aaa41d`. The descriptions and the scorecard below are kept as they were written for those frames.

Everything here is a **real frame of the real build**: `npm run build`, `vite preview`, headless Chromium with **software WebGL (SwiftShader)**,
the engine states below played by the repository's own bots (`src/engine/ai/bots/generic.ts`) and loaded through the same save format the game
uses (`window.__belief.load`, debug flag). Nothing is a mock-up, composite or generated image. The frames are produced by one command:

```
npm run build && npx vite preview --port 4173 &
npx tsx scripts/capture-matrix.ts --url http://127.0.0.1:4173         # all 16 frames below
npx tsx scripts/capture-3d.ts --day 6 --policy threat-aware --seed 2 --hud 1 --out /tmp/x.png   # one frame: any day, policy, seed, view, size, tier (see the header of the script)
```

The scorecard is **my own internal review** of these frames against the phase-09 list. It is not a user study and not an independent rating.
No human has played the game. The renderer is **procedural** (no art files; see `ASSET_LICENSES.md`), which is a strength (reproducible, nothing to
license) and a limit (the look is that of generated low-poly geometry, not of hand-modelled assets).

## Capture conditions

| Item | Value |
|---|---|
| Scenario / seeds | Redbank. Seed 1 for Day 1, the cottages, the bridge night (`bridge-builder` policy) and the aftermath frames; seed 2 (`threat-aware`) for the law and storm frames |
| Viewports | desktop 1440×900 (device scale 1); phone portrait 390×844 at device scale 2 |
| Quality tier | `high` for desktop frames; `medium` (I, L) and `low` (J) for phone frames |
| Camera | the game's own default camera unless the table gives a view (`az`/`el`/`dist`/`x`/`z`, degrees and world units) |
| Browser / hardware | Chromium (Playwright build), software WebGL on a 4-core Linux container: **no GPU**. On a real GPU colours and shadow edges can differ slightly; the geometry and layout do not |
| Expected variation | the sky clouds, birds, water glints and people move: two captures of the same moment differ by those. Frame counts and triangle totals are stable (±1%) |
| Build | the commit that contains this file (`git log -1 -- docs/3d-rebuild/VISUAL_QA.md`) |

## The matrix

All paths are under `docs/3d-rebuild/screenshots/`. "HUD off" frames hide the interface (`capture-3d.ts` without `--hud 1`) so the world is judged alone.

| ID | File | What it shows | Seed / policy / day | Interface | What I observe (honestly) |
|---|---|---|---|---|---|
| A | `A-day1-overview.jpg` | The default Day-1 view, nothing on top | 1 / none / 1 | off | A sculpted plate: river with a stone arch bridge, a bell tower and mill on the west bank, cottage clusters and market on the east, fenced fields, two forests, winding dirt roads, hills with long soft shadows, a layered earth edge. Birds circle. Reads at once as a fantasy village diorama, not a map. Weaknesses: the plate floats on a plain gradient with nothing beyond it; people are specks at this distance |
| A2 | `A2-day1-with-interface.jpg` | The same moment with the interface | 1 / none / 1 | on | Rail, bar, tools and the three opening story cards. The cards cover the lower fifth of the village while the player chooses, which is the one moment everyone sees first (issue 4) |
| B | `B-cottages-closeup.jpg` | Cottages, field, trees up close | 1 / none / 1, view `az=30 el=32 dist=7.5 x=20.2 z=12.8` | off | Timber-framed two-storey houses with tiled roofs, stone footings, chimneys, shutters; a stone cottage under slate with a bench; thatched house; wheat rows with ears; fences; apple trees with fruit; grass tufts and flowers; a farmer in the field; cast shadows. Weaknesses: plaster walls are plain, roof texture has a noisy purple-grey cast, gable tips read as dark thorns |
| C | `C-selected-social-lens.jpg` | A villager selected, social lens on, the card beside them | 1 / evidence-first / 3, `villager:ivo`, lens social | on | Gold arcs run only along Ivo's real trust ties; a halo marks him; the card anchors beside him with Tell / Scout and "More about Ivo". The village stays visible around it |
| D | `D-presurge-storm.jpg` | The evening before the surge | 2 / threat-aware / 7 | on | Storm light, rain streaks, grey sky, a river over its banks flooding the east side to the engine's depth, windows glowing, a lit beacon with its rune wheel. Dark but not black; the danger is unmistakable and the top bar says THE GREAT SURGE |
| E | `E-law-awakens-beacon.jpg` | River Fears Fire waking | 2 / threat-aware / 6 resolving, view `az=20 el=50 dist=13 x=15 z=12` | off | A ring leaves the beacon, ripples cross the river, rune sigils turn on the water, the engine's repulsion disc (a rune wheel) is drawn on the ground around the lit flame. Each element is started by a logged event (tested) |
| E2 | `E2-law-active-overview.jpg` | The same law the next morning | 2 / threat-aware / 7, view `az=24 el=46 dist=17 x=16 z=9` | off | The disc stays drawn and the surge stops at its edge: the homes inside stand on dry ground in a flooded bank. The physical consequence is visible and it matches the engine's tile depths |
| F | `F-bridge-watched.jpg` | Bridge Stands Watched, the night of the surge | 1 / bridge-builder / 6 resolving, view `az=18 el=36 dist=9 x=13.5 z=8.6` | off | The stone arch rides above the flood (it stands; the engine says so), a watcher stands on it, gold trim runs along both parapets, lantern posts are lit, rings pulse on the water, a cracked deck shows the damage it took |
| F2 | `F2-bridge-watched-ledger.jpg` | The same night with the interface | as F, view `az=18 el=40 dist=12` | on | The bar shows "Bridge stands watched ACTIVE"; the ledger says support 67%, awakening 100%, 10 firm believers named, what the law does, and a warning chip about crowds. The social justification sits beside the physical effect |
| G | `G-loss-aftermath.jpg` | After a loss | 1 / noop / 9 | on | The debrief opens on the real final world: the east bank under the surge, roofs awash, grey sky, the camera easing onto the damage. The three captions are the engine's last important events, each carrying its event id. Below: the verdict, who was lost and why |
| H | `H-victory-aftermath.jpg` | After a win | 1 / evidence-first / 9 | on | Same scene after a win: warm cleared sky, the camera settles on the homes that held (tower, market, fields, forest) with the flood beyond them. Captions name what was destroyed and what endured |
| I | `I-phone-selected.jpg` | Phone portrait, a villager selected | 1 / evidence-first / 3 | on | The plate is turned a quarter-turn so its long side runs up the screen; the village fills the space above the card; the card (Tell, Scout, More) sits above the tray; nothing is clipped. The left rail and right tools take about a quarter of the width |
| J | `J-phone-low-quality.jpg` | Lowest tier on a phone | 1 / evidence-first / 3 | on | Still 3D: sculpted terrain, shaped roofs, river, trees. No shadows, fewer tufts and trees, softer water, visible stair-stepping on edges at render scale. Legible and attractive, plainer than `high` |
| K | `K-desktop-laws-sheet.jpg` | The law ledger open in the side sheet | 2 / threat-aware / 6 | on | The village is re-framed in the space the sheet leaves; tonight's flood forecast is drawn on the ground as translucent stripes where water will stand; the ledger lists each law, its support, awakening, firm believers and effects |
| L | `L-phone-laws-sheet.jpg` | Phone portrait with the bottom sheet open | 2 / threat-aware / 6 | on | The whole village stays in view above the sheet (small, but whole) and is not swung round by the sheet opening. Tray and sheet do not overlap the controls |
| M | `M-flood-forecast-overlay.jpg` | Tonight's forecast on the ground, no sheet | 2 / threat-aware / 6 | on | See "Forecast overlay" below |

## Forecast overlay (frame M) and a bug this review found

The first capture of M showed **no overlay at all**. The cause was real: the 3D world arrives a moment after the page's first render, and the
page only handed it its options (tonight's predicted water, the lens, the selection, the hints) when something next changed. A player would have
seen the forecast only after their first click. The fix (`MapView.tsx`: the options effect now also runs when the renderer becomes ready) is covered by
`world3d.spec.ts` "the flood forecast and the other view options reach the world on its first frame, with no click needed", which fails without it.
Frame M was recaptured after the fix. The same fix also means the sky and light follow the forecast on the first frame (before it, a surge night opened under a calm sky until the first click).

## Scorecard (1 to 5; the phase asks for 4 or more in every area before calling anything premium)

| Area | Score | Evidence and the flaw that holds it back |
|---|---:|---|
| Three-dimensional depth | **4** | Terrain rolls and has banks and a layered edge (A); roofs are real gables and hips, the bridge is an arch with parapets, trees overlap and foreshorten (B). The camera really pans, zooms and orbits within limits (driven by real mouse input in `world3d.spec.ts`). Held to 4: everything is smooth-shaded primitives; nothing is sculpted at the detail of hand-made models |
| Art coherence | **4** | One procedural palette and material set, one wind, one light. Held to 4: the same few tree and cottage variants repeat, and the tile texture's colour noise looks muddy up close |
| Environmental life | **3** | Water flows, foliage sways, chimneys smoke, wheels turn, rain falls, clouds drift, birds circle, windows glow at dusk, people walk, work and rest. **Judged from code and stills only; I did not review motion as video**, and I cannot claim it reads as alive without that. Scored 3 on that basis |
| Lighting and material | **4** | A warm low key light with soft cast shadows, a cool sky fill, tone mapping, haze that eases with distance (A, B, D). Held to 4: surfaces are matte procedural textures; plaster is flat; no ambient occlusion beyond the shadow map |
| River | **4** | Flow, glints and foam; depth and flood extent are the engine's own numbers (`render3d-scene.test.ts`, tile for tile); the surge covers exactly the tiles the engine floods (D, E2). Held to 4: no real refraction or reflection |
| Architecture | **4** | Five cottage types, a bell tower, a mill with a turning wheel, market stalls, a hall, chapel, shelter, wells, pens, beacons, an arched bridge; footings, chimneys, shutters, doors, flower boxes (B, A). Held to 4: plain plaster walls, dark gable tips |
| Citizens | **3** | 14 hand-built people whose hats, held props and colours follow role and faction, animated, pickable, standing on the engine's tiles (B, C). Held to 3: small and blocky; at the overview they are specks, and on a phone's opening view two people near the bridge can be hard to tell apart by tap |
| Magical causality | **4** | Rings, reach discs, ripples, ribbons and runes start from logged events and the engine's own law geometry; six parity fixtures prove each kind of effect has an event behind it and none appears without one (E, E2, F, F2, M; `render3d-plan.test.ts`). Held to 4: effects are readable but not yet "beautiful" in the way hand-authored VFX would be |
| UI discipline | **4** | The world keeps at least 75% of a desktop screen and 60% of a phone's with the interface at rest (asserted in `world3d.spec.ts`); controls are compact and anchored to what they act on (A2, C, K). Held to 4: the opening story cards cover the lower fifth of the village at the first moment |
| Phone usability | **3** | The plate turns to fill a portrait screen, taps pick, the card and sheet fit without clipping (I, J, L; tests on a 390×844 touch project). Held to 3: this is software WebGL in an emulated Pixel 7, **never a real phone**; the rail and tools take a quarter of the width; people are tiny at the opening view |
| No faux completion | **4** | Every frame above is a real render; gaps are listed under "Open issues" and in `FINAL_REVIEW.md`. Held to 4 because performance on real hardware is unmeasured |

**Verdict on the rubric:** seven areas reach 4 and three (environmental life, citizens, phone usability) sit at 3. By the phase's own rule that is
**not premium**. It is a real, playable, richly rendered 3D village that is a large step beyond the flat map (see the comparison below), with named flaws.

## Defects found in this review, ranked, and what was done

| # | Priority | Defect (seen in a frame) | Fix | Check |
|---|---|---|---|---|
| 1 | **P0** | Forecast overlay absent until the first click (M) | options pushed once the world is ready | new e2e test; M recaptured |
| 2 | P1 | Timber houses, market stalls, well cranks and rubble had stray black struts sticking out and away from the wall (B): the timber helper built every beam backwards from its start point | beam runs start to end, centred (`kit.ts`) | B recaptured; no stray struts |
| 3 | P1 | The hero bridge drowned in the surge: its east half sat under the flood (F, H) | a standing bridge's deck rides above the surge; the people on it stand on the same height; purely visual, the engine's bridge state is unchanged | F recaptured; 3D e2e 26/26 |
| 4 | P1 | Phone default framing cropped the village, was hazy at its long distance, and a sheet opening left a stale zoom (J, L) | portrait home view turns the plate a quarter-turn; "at home" is tracked so a resize or panel re-frames; haze scales with camera distance; sheet inset limit raised | J, L, I recaptured |
| 5 | P1 | The debrief world was a small strip and, after a win, looked at the damage (G, H) | stage 54% of viewport height; after a win the camera settles on the homes that held | G, H recaptured |
| 6 | P1 | Day-1 lighting was flat: a high white sun over strong ambient (A) | lower, warmer sun; less sky fill; long soft shadows | A, B recaptured |
| 7 | P2 | The side sheet could not take focus in the first frame of opening (a hidden-to-visible transition), so a keyboard-only flow occasionally closed it again | sheet is visible from the first frame and hides only after sliding out; test waits for it | keyboard test 6 of 6 under load |
| 8 | P2 | An axe contrast measurement could land mid-fade on a card | audits wait for finite animations | a11y spec green on both projects |
| 9 | P2 | Nothing high above the roofs moved | a few birds on fine days | A |
| 10 | P2 | Laid over a flood that was already there, the forecast stripes whitened the water (E2) | the overlay is a third as strong where water stands and 0.4x on the water surface | D, E2, F2, K, M recaptured |

## Open issues, in order of how much they matter (the "5 biggest")

1. **No real GPU, phone or iPhone was ever tried.** Counts are ordinary for a stylised 3D game and the JS cost is small, but frame rate and heat on real hardware are **UNVERIFIED** (`PERFORMANCE.md`). On a machine with only a software rasteriser the game opens on the classic map unless `?renderer=3d` is given.
2. **Citizens are small and blocky.** Roles are readable by hat and prop up close, not at the overview; a tap in a crowd picks the person nearest the tap, which can be the neighbour on a phone's opening view.
3. **Surfaces are plain up close.** Flat plaster, noisy roof texture, dark gable tips, repeated tree and cottage variants.
4. **The village floats on a plain gradient.** Nothing beyond the plate (no horizon hills, no ground), and the opening story cards cover the lower fifth of it at the first moment.
5. **Motion was reviewed in code, not as video**, so "alive" is claimed only as far as the animation systems and tests go. Picking uses box volumes, not the visible geometry, so a beacon half behind a home can select the home.

## Functional regression (the phase's list) and where it is proven

| Requirement | Result | Evidence |
|---|---|---|
| Fresh game → starter story → select citizen → Influence spent → end day → belief spreads → law wakes → flood changes → people leave → win/lose → retry on a new seed | PASS (software GL) | `world3d.spec.ts` (tap, plan, winning line, losing line + retry); `acceptance.spec.ts` journeys on the classic map |
| Same seed and actions give the same engine hashes across old/new renderer and across quality tiers | PASS | recorded winning and losing traces replayed through the 3D world reach identical `stateHash`/`eventHash`; medium and high tiers replay the no-op loss to the same hashes; classic-map specs replay the same fixtures |
| Two or more distinct Redbank winning strategies with verified traces | PASS | `tests/fixtures/redbank-traces.json` (fire wall, witness bridge), replayed by `redbank.spec.ts` |
| Save and resume with a law active and mid-storm, no duplicated effects | PASS | "a mid-day save resumes…", "a save made in the middle of the flood night resumes into the same storm" |
| MCP tools keep parity; written beliefs use validated rules, never graphics | PASS | engine, `mcp/**` and the composer are untouched by this work; `npm test` 364 of 364 |
| Crowded villager, bridge and beacons picked by mouse and by touch | PASS | "beacons, the bridge and a villager in a crowd are each picked by their own tap" on desktop and phone projects (from a fixed angle; see issue 5) |
| Restart, focus, quality toggle: no leaked GPU objects or stacked canvases | PASS | "restarting and loading other villages does not leak geometry or textures"; the 2D/3D toggle test |
| Offline core game with no optional service | PASS | `acceptance.spec.ts` "with the network cut, the game and the composer still work" |
| No blank screen, pink textures, floating houses, feet through ground, uniform cube forests, blocky water, wrong flood stage, modal over the main character, hidden call to action | PASS by inspection of the 16 frames, plus tests for the flood stage (`render3d-scene.test.ts`) and for the end-day button staying in view | |
| Lighting consistent after orbit; touch targets correct | PARTIAL | orbit and its limits are tested; one light rig is shared by every view, but consistency after orbit was judged from code and stills only. Touch taps are tested; two-finger pinch is not |
| Frame-time p50/p95 with a representative camera and storm | **UNVERIFIED on real hardware**; measured on software GL only | `PERFORMANCE.md` |

## Before and after (anti-target vs now), by feature

The anti-target is the flat map in `screenshots/baseline-2d/` (for example `calm-1440x900.jpg`): tiles, sprite icons, a permanent right panel and bottom cards.

| Feature | Flat map (before) | 3D world (now) |
|---|---|---|
| Volume | none: every object is a flat sprite on a grid | gabled and hipped roofs, an arched bridge, a tower, chimneys, trees with canopies, foreground and background overlapping |
| Terrain contour | uniform green squares | rolling hills, a cut river channel with banks, levelled building plots, a layered earth edge (heights are the engine's elevation, asserted in a unit test) |
| Bridge | a brown rectangle across blue | an arched stone bridge with parapets, gold trim when watched, cracks when damaged, rubble when fallen; rides above a surge |
| Canopy and vegetation | triangle icons | instanced oaks, pines, birches, willows, apples and shrubs with swaying wind; wheat that ripens; grass, flowers, reeds, fences |
| Sunlight | none | warm directional sun with soft shadows, haze, weather moods (calm, threat, storm, heat, dusk, sunbreak, aftermath) |
| Water | a static blue rectangle | flowing shader, glints, foam; depth per tile from the engine; floods the same tiles the engine floods |
| People | 14 small icons | 14 hand-built figures with role costumes and props, walking, working, resting, evacuating |
| Interface share of the screen | the map was about 62% of the window (a 390 px panel and bars) with cards over it | the world keeps at least 75% on desktop and 60% on a phone at rest (asserted) |
| Free camera | none | pan, zoom to cursor, bounded orbit, pinch, keyboard, buttons, focus on a person or place |
