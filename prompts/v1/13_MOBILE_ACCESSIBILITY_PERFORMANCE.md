> **3D MOBILE OVERRIDE:** Apply this phase's accessibility and input objectives to the actual Three.js / React Three Fiber world, with adaptive WebGL2 quality levels, dimensional fallback models, raycast selection and smooth orbit/pan/zoom; see [3d-rebuild/08_ASSET_PIPELINE_AND_OPTIMIZATION.md](3d-rebuild/08_ASSET_PIPELINE_AND_OPTIMIZATION.md). Do not fall back to the old flat map by default.

# Phase 13 — Make the game work on phones, keyboards and modest hardware

The browser game must be truly usable with one hand on a phone, not merely render a desktop layout shrunk to 390 pixels. Treat accessibility and resilience as product quality.

## Supported environments

Test at representative viewport/device sizes:
- 320×568 small phone;
- 390×844 modern phone;
- 768×1024 tablet;
- 1366×768 laptop;
- 1920×1080 desktop;
- Safari/WebKit iOS family via Playwright WebKit as approximation, plus actual device if available;
- Chromium and Firefox at least smoke-tested.

Never assert actual iPhone testing without an actual device run. Document tested browser versions and known platform limitations.

## Controls and camera

Phone:
- Single tap entity to inspect.
- Drag on empty terrain to pan; pinch zoom if reliably implemented; always show +/- zoom buttons.
- Bottom sheet with expandable action list, readable AP and legality.
- Big primary CTA, safe-area padding, no controls behind home indicator/notch.
- Confirm deliberate End Day with meaningful pending choice summary; easy cancel.
- Explicit ability to focus to selected villager/threat and re-center map.
- No hover dependence.
- On-screen social graph overlay can simplify to list+selected relations when graph is too small.

Desktop:
- Mouse and keyboard fully playable where feasible; Tab/Enter/Escape/arrows and shortcut legend.
- Accessible buttons/inputs, logical focus order, keyboard modal operations.
- Zoom and pan not trapping page scrolling unexpectedly outside canvas.

## Accessibility

- WCAG 2.2 AA guidelines where applicable for standard controls; test automated accessibility auditing and manually inspect critical scenes.
- Numeric and textual descriptions of all color-coded signals.
- Reduced motion honored in animated overlays, particle effects and map transitions.
- Adjustable UI text scale (at least compact/default/large) without clipping critical information.
- Mute/music/SFX independent settings.
- All important information in semantic DOM or accessible alternative to Phaser canvas, including state of villagers, laws, action choices and crisis.
- Screen reader region announcer for end-day results; avoid nonstop intrusive chatter.
- Focus indicators, text alternatives, accessible form labels, no misleading disabled buttons without an explanation.

## Performance

Target 60 FPS on moderate desktop, stable 30+ on representative older phone; declare hardware/measurement methodology. Long-run simulation target <250ms per day with default population on modest desktop, and keep generator bounded. Avoid full graph re-renders on every idle frame. Reuse visuals; memoize selectors; limit particles/animated citizens based on quality profile. Lazy-load campaign assets and audio; manage texture memory and event listeners. UI remains responsive during large sim tournaments (run them in test CLI or workers, not on main player tab).

Monitor production bundle size and render performance; set budgets appropriate to actual bundle. Profile cold start, first interactive action, map render, end-turn animation, peak events and save/load. If expensive, simplify rather than add more performance libraries.

## Reliability and storage

- Save after committed planning changes/day completion and on explicit pause where appropriate.
- Handle browser refresh, tab switching, storage quota/disabled storage, corrupted or old save with recovery UI.
- Auto-recover gracefully if unsupported WebGL (Canvas fallback or explicit understandable message).
- No network required for default single-player after assets load and cache policy permitting; consider PWA/offline cache only after basic reliability is strong.
- Don't freeze if thousands of rumor events occur; cap event memory and screen effects, compact historical summaries.

## Tests

Automate:
- Portrait phone first action, End Day, open social lens, save/resume and victory.
- Keyboard complete a legal turn without pointer.
- Media prefers-reduced-motion disables nonessential effects.
- Accessibility audit no critical violations; document manual canvas alternative check.
- Resize/orientation changes retain state and keep selected controls visible.
- Low storage/error boundary shows recovery, no infinite spinners.
- Performance benchmark for 100-agent engine stress with controlled machine specs.

## Gate

All primary game screens and controls usable at 320px; no clipped important text or inaccessible core actions. Run WebKit/Chromium E2E; build/test pass. Record actual device/browser evidence and limitations. Commit.