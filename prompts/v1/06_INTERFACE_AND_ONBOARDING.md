> **PREMIUM 3D/UI OVERRIDE:** Implement the current [3D rebuild visual and immersive-HUD requirements](3d-rebuild/07_IMMERSIVE_HUD_AND_CONTROLS.md) instead of permanent large 2D claim cards, tile maps or a giant law ledger. Keep HUD accessible, contextual and subordinate to the 3D village. Gameplay/tutorial requirements below remain valid.

# Phase 06 — Make the game beautiful, readable and immediately enjoyable

Replace prototype presentation with a polished, tactile game interface while preserving verified gameplay. The experience should resemble a premium original indie game, not a corporate dashboard or spreadsheet with villagers.

## Visual identity

Art direction: **storybook occult-naturalist diorama**: cozy river village, warm parchment maps, emerald forest and water, midnight-indigo panels, amber lamplight, luminous rumor trails and ink-like transformed terrain. Use cohesive colors, clean typography, gentle dynamic lighting, distinctive villager silhouettes, UI iconography with accessible labeling. Original procedurally drawn vector/pixel assets are acceptable; never assume external paid art.

Organize visual hierarchy:
1. What is threatening the village?
2. What can the player change right now?
3. What do villagers believe, and why?
4. Which law might awaken/decay?
5. What happened after the last decision?

Map should remain primary; social overlays should be summoned contextually, not permanently dominate. Prefer large landmark silhouettes, selective animations, bounded particles, weather layers and subtle parallax. Side panels must never cover all critical action targets, especially on phone.

## Primary screens

- **Title:** logo, animated miniature village, impactful short tagline, immediate Play, Continue when save exists, Scenario Select, Settings, How It Works.
- **Campaign/map select:** missions with icon, crisis, duration, difficulty, known constraints, optional alternate starting claim; completed status.
- **In-game HUD:** persistent day, AP, villagers safe/at risk, food/buildings, approaching hazard, fast help, pause/mute.
- **Context panel:** when selecting villager/landmark, show portrait/avatar, beliefs, trusted contacts, claims, actionable options, costs and risks.
- **Claim card carousel:** statements have punchy text, range, positive physical effect, negative consequence, supporter progress and visual metaphor. Card actions need clear enabled/disabled rationale.
- **Social lens:** neighborhood influence network with nodes anchored to village geography; edges indicate trust/distrust with patterns or labels; highlight the next likely supporters.
- **Law ledger:** "awakening / active / wavering / suppressed" and why, confidence, evidence, contradiction, effective scope.
- **End-day events:** short animated digest with map focus for major outcomes, speed-up/skip, deep-dive log on request.
- **Debrief:** survivors, villages preserved, scenario medal, **chain of causality** (e.g. "Mara believed because Ivo demonstrated → east bank followed → River Fears Fire awakened → 4 homes spared, 1 field burned"), score breakdown, new strategy tip and instant retry.

## Tutorial and information

Teach with **controlled interactive discovery** (tutorial actions attached to real mechanics). Keep mandatory intro ≤90 seconds ideally, target first action ≤30 seconds, default concise explanation, optional full manual. Avoid jargon until necessary: Claim → Spread → Belief → Law → Consequence. Use short impactful copy, only one new idea per tutorial beat, allow skipping.

For any action card, show:
- COST: Influence and opportunity cost.
- TARGET: accessible villagers and landmark(s).
- PROBABLE CONSEQUENCE: predicted range with uncertainty, not false certainty.
- RISK: counteraction/need tradeoffs.
- FEEDBACK: what changed and why.

Accessibility: never rely on color alone; badges/icons/percent or descriptive text accompany visuals. Visible keyboard focus and button semantics; no tiny controls.

## Interaction patterns

Desktop: click/tap village, hover hints, keyboard arrows/WASD for camera, +/- zoom, Escape/back, Enter confirm, number keys for cards when appropriate, tooltip on focus.
Mobile: large finger targets, bottom sheet, drag-to-pan, explicit zoom buttons or pinch, no hover-only essential information, never accidental End Day without confirm/undo option.
Both: action planner shows AP forecast; plan/undo during planning; end-turn is a satisfying decisive control. Saved/paused state obvious. Animations skippable and reduced-motion friendly.

Responsive breakpoints should support 320px phone width through desktop ultrawide; where entire simulation viewport cannot fit, allow camera movement and focus shortcuts, not microscopic scaling.

## Animation & feedback

Produce a consistent event vocabulary:
- rumor seeded: soft glow from speaker;
- gossip traveled: bounded flowing pulse along an actual contact;
- trust lost: broken ink line with reason;
- nearing law: translucent effect preview in region;
- law activated: localized transformation and readable banner;
- hazard strikes: screen-space hazard with damage indicators;
- victory/loss: cinematic but short, readable summary.

Use stable animation IDs from event log; avoid RNG-generated effect differences on deterministic replays unless visual-only and seeded separately.

## Acceptance testing

Conduct at least one actual scripted guided path with Playwright screenshots on desktop and mobile. Ensure action/tooltip/modal elements usable by keyboard and touch. Assert that an inexperienced player can identify current objective and at least one valid action from the default screen. Fix information overload and frustrating drag/select conflicts. Check contrast and reduced-motion. Build/test must pass. Commit source and honest evidence, not screenshots alone.