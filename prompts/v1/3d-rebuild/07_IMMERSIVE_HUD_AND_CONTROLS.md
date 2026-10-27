# Phase 07 — Completely rethink interface around beautiful 3D world

## Diagnosis from screenshot

Current HUD consumes much of top, bottom and right side:
- full-width status bar with tiny text;
- 4 large opaque claim cards blocking southern buildings;
- broad law ledger panel blocking eastern map;
- dense repeated progress bars, tiny villagers, no world focus;
- game occupies a cramped rectangle, visually flatter due to graph/grid region hatching.

This is a serious design failure even if 3D scene is improved. A premium world demands **screen-space restraint, context and deliberate information hierarchy**. Do not merely restyle original HUD in glassmorphism and call it fixed.

## New layout design

Desktop game view target: roughly **75–85% immediately visible screen real estate occupied by 3D scene** in typical 1440px view, with overlays small/contextual (not a hard rule at small windows). Default:
- Top left: understated logo + Day + Crisis counter/forecast (small single slim translucent rail).
- Top center: one current goal line when useful (e.g. "The Great Surge reaches Redbank in 2 days").
- Top right: expandable settings, camera, social-lens and laws icons, no sprawling permanent inspector.
- Bottom center: compact 2–4 action buttons and visible Influence count; claim hand hidden in compact expandable drawer/cards that reveal on demand; optional radial action wheel for selected citizens.
- Selection: clicking villager reveals a small anchored identity popover with 1–3 high-value actions; expandable side sheet for trust details, claim composition or historical event reasons.
- Left edge: icon stack for 3 overlay modes "World", "Social", "Laws". Expand only when relevant; transitions do not halt world rendering.
- Right: optional 320px panel when opened, fades/backdrop or pushes camera target to keep selected landmark visible, collapses with one tap.
- End Day: clear primary button visible at all times, with preview of what advances and remaining planned actions, accessible confirmation as needed.
- Mobile: floating small top crisis HUD, bottom collapsible sheet, one action at a time with >=44px click/tap targets and camera focus; world remains touch-pan friendly.
- Desktop large view: map is the hero. Default panel does not obscure bridge, lit beacons, key homes or dramatic law effect.

## Progressive disclosure and player cognitive model

First glance: **what danger is coming? what can I do? what changed?** Avoid rendering 4 detailed law cards simultaneously; show small icons with concise status and open on click. Summarize system in 3–5 visible facts:
1. Day and deadline.
2. Influence/AP.
3. Village safety/critical resource.
4. One currently active/wavering Law.
5. Selected NPC or actionable target.

A Law panel must still show exact rules, evidence, support, costs and risks. Keep nuanced strategy accessible via drill-down, not permanently crowding the board. Tooltips work with focus/tap, not hover only. Selected person card answers Why they believe and whom they trust. Social lens shows graph edges sparingly around focus.

## Aesthetic

Original high-quality fantasy UI design: translucent smoked sapphire/ink panels with warm parchment paper inlays, gold foil highlight, hand-drawn fine line iconography, tasteful weathered ornamental trim, oversized evocative number/heading hierarchy where useful, gentle animated ink reveal. Avoid generic SaaS rectangles, bland Bootstrap tables, large nested borders, neon dashboard over a fantasy village. Readability paramount—do not compromise contrast on busy scenery. Use compact labels and tabs rather than walls of explanation.

Fonts: choose available web-safe/system or properly licensed heading+body families with cohesive letter spacing. Avoid external CDN dependency when avoidable. HUD motion 150–250ms, law activation emphasis longer but skippable.

## Interactions that actually affect game

- Raycast a villager -> avatar halo, position-aware selection card, chosen action enters real plan.
- Pick a house -> show residents, flood danger and evacuation routes.
- Pick bridge -> integrity, current watchers, distance/traffic, relevant law.
- Pick river -> flood forecast and contours overlay (world-space transparent ribbon/contour, not checkerboard).
- Pick beacon -> fuel, lighting, protected region, fire hazard.
- Toggle Social lens -> bounded nearby relational filaments and mini relationship list; not entire tangled graph.
- Select Claim -> highlight valid agents/regions in world, cost preview, confirm.
- End Day -> camera focus to most important 1–3 events, skip available.
- Save/reload -> preserve selected scene/camera where practical; game state remains canonical.

No dead buttons, tooltip-only controls, unreadable 8px text, clipped mobile panels, invisible focus or action stealing from canvas.

## Usability gates

At desktop 1366x768: user can see village river and bridge while HUD default, end day visible without scrolling, action accessible in <=2 context clicks after selecting target. At 390x844 phone: one-finger select/move, pan/zoom, action, end day; no UI blocks all critical controls. At 320px controls still usable; keyboard navigation via DOM equivalent. Preserve screen-reader accessibility independent of canvas.

Capture UI open/closed and law view states at desktop + mobile. Log actual pointer actions in Playwright. Record contrast, touch size, layout overflow and controller failures. The user screenshot's large permanent bottom cards + right law panel must be gone by default.