# Accessibility and platform support: what is tested, what is not

## Browsers (Playwright builds on Linux, executed in this repository)

| Browser | Version | What ran | Result |
| --- | --- | --- | --- |
| Chromium | 153.0.8010.12 | the whole E2E suite (desktop 1366x768 and a Pixel-7 touch profile) | 89 passed, 47 project-specific skips |
| Firefox | 155.0 | `tests/e2e/smoke.spec.ts` (first day played, saved, resumed; debrief with scene) | passed |
| WebKit | 26.6 (Playwright's Linux build, an approximation of Safari) | the same smoke spec | passed (the first paint of the map takes longer; the test waits for it) |
| iPhone 14 profile (WebKit, emulated touch) | 26.6 | the same smoke spec | passed |

`npm run test:e2e:browsers` runs the four smoke projects (needs `npx playwright install firefox webkit`, and on Linux `npx playwright install-deps webkit`).
**Not tested:** real Safari, any real iOS or Android device, Edge, older browser versions. Nothing here claims iPhone support beyond the emulation above.

## Screen sizes

`tests/e2e/visual.spec.ts` loads real engine states (calm, a live law, the surge night, the end-of-run scene) at **320x568, 390x844, 768x1024, 1366x768
and 1920x1080** and asserts: no sideways page scroll, the day and Influence are on screen, End Day is inside the viewport and at least 40 px tall, and the map
canvas is painted. `tests/e2e/resilience.spec.ts` adds 320 px wide with large text (no clipped primary text, End Day reachable) and turning a tablet back
and forth (the run, the selection and End Day survive). Screenshots of the same states are in `docs/screens/`.

## Automated audit (axe-core, WCAG 2.0/2.1/2.2 A and AA)

No critical or serious violations on: title, how it works, settings, scenario list, briefing, play (with and without a selected villager), laws, forecast,
and, **at large text with high contrast on**, every Atlas tab, play with a live law, the log, the End Day dialog, the morning digest and the debrief with its scene;
and on title, scenarios, briefing and play at 320 px (`tests/e2e/a11y.spec.ts`). Automated audits find perhaps a third of real problems; the manual checks below matter more.
The audit found one real defect in new code (an interactive button inside an image-role figure) and it was fixed.

## Built in

* **Keyboard:** every control is a real button, link, input or select; a whole turn (choose a story, select a villager, act, end the day) is tested without a pointer; `T` tells the selected villager the chosen story; the tutorial coach is an in-flow `role=note` banner and never covers a control;
  dialogs trap focus, close on Escape and return focus; arrows/WASD pan, +/- zoom, 0 fits, 1-9 choose stories, U undoes, L toggles the social lens, Enter asks to end the day. The legend is in "How it works".
* **Canvas alternative:** everything on the map is also a list: villagers and places in the Village tab (with trust, beliefs, needs, duties), laws in the Laws tab, tonight's forecast
  in words, the full log; the End Day dialog summarises what is at risk. A test with the canvas disabled plays a whole day from the lists.
* **Colour is never the only signal:** law status, omen quality, risk markers (numbers on the triangle), bars with numeric labels, and gossip direction (dotted vs jagged stroke) all have text.
* **Motion:** `prefers-reduced-motion` is honoured by default and can be set in Settings; effects shorten or vanish, the world swell and weather stop, the end-of-run scene is still. A test checks the digest still tells the facts.
* **Text size** (compact / default / large) and **high contrast**; layouts are tested at 320 px with large text.
* **Sound:** effects and music are separate, volumes remembered, a mute button is always on the play bar, and nothing is conveyed by sound alone.
* **Announcements:** end-of-day results go to an `aria-live` region once per day; routine actions announce one short line.
* **Failure paths:** blocked or full storage (announced once, with Download this game), corrupt or foreign saves (refused with a reason), a render crash (recovery screen, save kept), no canvas (explained, playable from lists).

## Manual checks still owed (not claimed)

* A pass with a real screen reader (NVDA, VoiceOver, TalkBack): focus order on the Village tab, the digest announcement, and the Forecast tab reading order.
* One-handed use on a real phone: reach of End Day and the zoom buttons, safe-area padding around a notch and home indicator.
* Zoom to 200% on desktop browsers other than Chromium; Windows high-contrast mode.
* Colour-vision simulation of the map overlays.
