# Phase 06 — Make belief physically magical, vivid and understandable in 3D

## Product promise

The visual climax is not a popup saying "River Fears Fire: Active"; it is **watching an actual modeled river respond to a socially activated law** while villagers witness it. The belief system's causal chain must be readable spatially, emotionally and mechanically, without overwrought particles.

## Physical event synchronization

Translate engine events into time-stamped render instructions:
- Claim seeded: selected villager talks, a small hovering rune/mote appears, ring pulse and visible change of conviction.
- Exposures/trust edges: luminous particles arc along actual social relationships and paths, with subtle hue/pattern for trust, resistance and counterargument.
- Conviction shift: targeted citizens turn, facial/pose changes, badge progress indicated selectively; hover reveals explanatory text and reason codes.
- Law approach: localized ground/world motifs appear only near relevant eligible area as support rises, not broad diagonal hatched HUD rectangles.
- Law activation: short (<=2s, skip/reduced-motion safe) environmental cinematic + local effect, with actual modified physics/mesh.
- Law decay/counter: effects soften, materials/force field contract, world state reverts according to irreversible-state rules; destroyed assets remain damaged, no visual reset that fabricates revival.
- Hazard impact: area-level flood height, water splash and wetness, fracture/damage to bridge, glowing beacons, crop damage and smoke update strictly from engine events.
- Debrief: camera smoothly reveals preserved homes/shelter or ruined riverbank with small story captions tied to actual event IDs.

## Specific law implementations in 3D

**RIVER_FEARS_FIRE**: beacon catches fire, particle flame + amber area light, thermal shimmering air and wispy smoke; luminous protective arcs can indicate range subtly. When local belief threshold active, water mesh flows away from beacon and hydrology-derived local flood mesh recedes/redirects; side-effect water visible somewhere else. When not active, a burning beacon is only fire and does NOT repel real water.

**BRIDGE_STANDS_WHEN_WATCHED**: real watcher avatars congregate near bridge railings, translucent gold motif in masonry edges and gentle reinforced material shimmer; bridge segments resist damage according to true state. If watchers leave, motif fades, bridge damage can appear (cracks, shifted deck pieces, dropped stones). Do not falsely show collapse until engine says it occurred.

**RAIN_HEEDS_BELLS**: belltower bell swings with a grounded audio ping; short cloud/wind vortex carries rainfall toward real target region; rain particles concentrate where hydrology says rain occurred. If it floods another district, visually show that downside and make cause clear.

**FIRE_ANGERS_THE_RIVER**: rival belief countereffect uses different visual vocabulary, e.g. cold violet wave pressure, but only active if its own rule is truly executable. Opposing claims should visually contest same region, not just update bars.

Later rules: moonlight crops visibly advance growth stage, smoke-wolf warding causes packs to choose alternate paths, lightened stone shifts boulders when legal. Keep every effect meaningfully distinct.

## Visual language

Use cohesive fantasy effects: softly illuminated ribbon trails, hand-drawn-looking runes as decals or instanced planes, motion curves, select bloom and impact sparkles. Colors should reinforce player cognition: amber trust/protective, indigo opposing beliefs, cyan rainfall, coral danger, soft green safety. Accessibility requires accompanying text/icon, and colorblind-friendly patterns. Avoid permanently draping whole world in spaghetti lines or spectacle that hides tactical state.

Use shader-based masks and mesh parameters only when needed; quality tier controls particles and post-processing; effects stop/dispose on reset. No screen-wide flashes or camera shakes without reduced-motion alternatives. A single impactful effect should feel stronger than 400 cheap glow particles.

## Mechanics parity verification

Construct fixed-seed engine fixtures:
1. Seed rumor, lower-than-threshold: social VFX only, no river diversion.
2. Threshold achieved but no lit beacon: law status may active yet physical repulsion unavailable; visual cue explains missing catalyst.
3. Threshold + fuel + lit beacon: flood trajectory difference visible and engine-asserted.
4. Counter-belief suppresses activation: warm effect fades; flood response matches actual resolver.
5. Physical irreversible harm remains visually after law ends.
6. Social edge not present: NO rumor trail for that edge.

For each capture actual browser still/animation if possible and assert matching state. Failed visual/physics parity blocks merge.

## Gate

An uninformed observer can see a believable chain from conversation to environmental change; player can inspect Why to see event causal explanation. Three central laws have clearly distinct BEAUTIFUL volumetric effects with real state parity. No 2D weather overlays replacing 3D world effects.