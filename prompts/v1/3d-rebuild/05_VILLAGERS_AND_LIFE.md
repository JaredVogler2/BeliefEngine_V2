# Phase 05 — Individual expressive 3D villagers and living settlement

## Objective

Players must care about and recognize the people whose belief they are manipulating. Replace tiny 2D pins/sprites with distinct animated 3D miniature people that inhabit the geometry. All movement driven by valid game behavior, with animation interpolated for visual continuity.

## Modeling and rigging

- Build 10–16 original/appropriately licensed low-to-mid-poly stylized humanoid avatars for Redbank, with recognizable silhouettes/outfits/props, not interchangeable colored cylinders. Proportions slightly exaggerated for camera legibility: expressive head/hat/hair, layered torso outfit, hands/legs/feet, purposeful accessories.
- Character roles visually distinct: bridge keeper (utility belt/lantern), miller (apron/sack), farmer (straw hat), storyteller (cape), skeptic/scholar (notebook), merchant (satchel), guard (spear/hood), parent, carpenter, bell keeper. Avoid caricatures tied to protected characteristics.
- Animations: idle breathing/weight shift, walking, waving/gossip, pointing/arguing, tending farm, lighting beacon, observing bridge, fleeing hazard and celebrating. Favor skinned GLTF rigs with AnimationMixer or authored procedural limb movement if enough naturalness and variation; avoid T-pose, robotic bouncing, skating feet.
- Different walk speeds/stride, head-turn to interaction partner, small staging delays and purposeful stopping. Citizen face details can be stylized/minimal at overhead zoom; expressive poses and readable icon portraits matter more.
- Each villager retains same visible identity, costume colors, role and name across save/load. Renderer uses engine ID and role, no RNG reroll on refresh.

## Actual pathing and spatial logic

- Convert engine tile paths into walkable 3D paths with smooth waypoints; y samples ground elevation; avoid cutting through houses, water, bridge railings or fences.
- Bridge crossing only when engine says connected; when destroyed or blocked, agents don't visibly walk across it.
- Day actions animate as timed sequences but do NOT determine game actions. Authoritative position/destination is from simulation. Cosmetic easing may interpolate between known legal points; if arrival event happens, snap gracefully.
- Citizens flee storm to real shelter, gather at market, work farm, ring bell, watch bridge and ignite torches according to current NPC state. Grouping at bridge affects actual bridge law if watchers need to be present.
- Idle animations and tiny wander radius while planning allowed so long as no illusion of illegal activity. No cosmetic wander crossing disconnected districts.
- Avoid all 14 agents overlapping into one unreadable dot: collision visualization spacing, social gather arc or contextual spread.

## Identification, picking and social graph

- Tap/click 3D villager (generous invisible interaction volume) highlights character and shows name/role and small compact card; camera focuses smoothly; double-tap can follow. Group overlap resolved by ordered pick menu near crowded targets.
- Optional hold/hover shows current belief symbols and influencer rank; preserve accessible DOM roster for keyboard/screen reader. Nameplate or halo scales appropriately with camera distance and is not always shown for everyone.
- Social links connect real world positions; edge tubes/particles route above landscape without obscuring roofs; source and target characters pulse when actual gossip event occurs. Never show 100 tangled permanent lines at once.
- Facial/pose gestures for delighted, skeptical, alarmed, convinced or angry; state-driven not random generic happy.

## Character life moments

Examples that must be implemented, not scripted random unrelated cutscenes:
1. A villager who hears a rumor turns toward trusted friend; a short gold arc travels and their belief icon changes after real engine event.
2. A bridge watcher arrives physically, watches structure, and bridge preservation aura/intensity updates.
3. A parent reacts to flood hazard, leaves daily work, walks toward home/refuge.
4. A skeptic reacts to evidence and changes posture, faction badge and conviction in card.
5. When flood washes over a farm, worker stops tending crops and evacuation begins if possible.

## Quality/performance

- Support material instancing and shared animation assets; skinning costs bounded, LOD distant citizens switch to cheaper rig/billboard only where visually unobtrusive.
- Avoid real-time physics ragdolls; no CPU per-frame social utility.
- Small character readable at base camera and attractive close-up; avoid giant character scale mismatching cottages.
- Reduce motion option still shows state/status via DOM.

## Gate

At least 14 individually recognizable Redbank villagers inhabit correct locations; inspect/select them, animate real movement and interactions, and respond to actual seeded events. Capture close and wide actual screenshots/video if tools available. Check no clipping/water-walking and that pause/resume and changing seeds reset animations correctly. A static colored cylinder representing villager FAILS.