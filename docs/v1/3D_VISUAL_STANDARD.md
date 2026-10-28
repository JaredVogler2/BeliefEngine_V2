> V1's `docs/3D_VISUAL_STANDARD.md` as of `22b7b1c53ab5` (JaredVogler2/BeliefEngine `main`, its world-class visual pass), merged into V2 on
> 2026-10-28 and kept here for reference. V2's own document is [`../3D_VISUAL_STANDARD.md`](../3D_VISUAL_STANDARD.md); paths below are V1's.

# Belief Engine: 3D visual standard

This document is the art direction for the 3D village. Code in `src/render3d/**` should follow it, and a visual change should be judged
against it. It is a working standard, not a mood board. Every value below is one the renderer actually uses or is being moved to, and
the quality report (`docs/3D_QUALITY_REPORT.md`) scores real frames against it.

## The direction in one line

**An inked storybook diorama: a cozy, lived-in village painted in muted earth and meadow colours, drawn with thin warm ink lines,
floating in a sea of cloud, where belief is the only thing that glows.**

The reference the owner supplied (a cozy village-builder screenshot) shows what "cozy and premium" means here. It has dense mixed
forests with autumn accents, small houses with bright roofs and gridded windows, earth yards and paths, chunky chimney smoke, soft warm
light, a muted sage-olive ground and thin dark outlines. Belief Engine keeps its own identity on top of that. It is a tabletop diorama
on a floating island, with a river and bridge at its centre, and a magic language of rings and runes that only appears when the
engine says belief changed the world.

## Five pillars

1. **Painted, not plastic.** Natural, slightly desaturated colours. Saturated colour is kept for roofs, flowers, autumn trees and magic.
   The ground has brush texture, not flat fills. Light is warm and soft. Specular highlights are small.
2. **Inked silhouettes.** Every object that stands up from the ground (houses, trees, people, the bridge, the tower) has a thin, warm,
   dark outline that fades with distance. Grass and flat ground do not, so the lines describe things and not noise.
3. **Lived-in density.** A village is a place, not a row of icons. It has yards of trodden earth, woodpiles, sheds, carts, fences,
   washing, paths worn to doors and smoke from chimneys. Forests are dense and mixed: pines, round broadleaves, tall cypresses, birches
   and the odd turned tree.
4. **Belief is the only magic colour.** The world stays earthy so the law effects read at once: trust and protection are amber, rain is
   cyan, a rival belief is violet, danger is coral and safety is green. They are never used for set dressing.
5. **Weather is mood.** A calm warm afternoon turns to threat haze, then a slate storm with rain on the water, then an aftermath light.
   The mood always follows the engine's forecast. It never invents danger.

## Palette (linear values are derived from these sRGB hex colours)

| Role | Colours |
|---|---|
| Meadow | base `#7d9a52`, light `#a7b56a`, deep `#56733f`, dry gold `#b8a65a` |
| Forest | floor `#4f5b33`, conifer `#2f5a3f` / `#3f6e4a`, broadleaf `#5f8a3e` / `#8fb055`, cypress `#3d6340` |
| Autumn accents (scattered, never a block) | ochre `#d19a3a`, rust `#b5562c`, amber `#e0a84a` |
| Earth | yards `#8a6a45`, paths `#b99b6e`, worn `#a3835a`, furrows `#5a3c22` |
| Walls | cream `#efe3c8`, warm plaster `#e6d2ad`, stone `#b1a58e`, timber `#4b3220` |
| Roofs | terracotta `#b8532f`, brick red `#a63a2c`, teal `#3f8f8f`, slate `#5a6878`, thatch `#c4a24f`, umber `#7a4a2e` |
| Water | shallow `#6fc3c0`, deep `#2f7f8f`, foam `#eef6f2` |
| Ink | `#2b2018`, drawn at 55–80% |
| Sky and cloud | zenith `#8fb7dc`, horizon `#f1ead0`, cloud `#fffaf0` (a calm day) |
| Magic (reserved) | trust `#f2b84b`, resist `#8fa6c4`, rival `#b48cff`, rain `#57c7e3`, danger `#ff7a5c`, safe `#6fd39a` |
| Interface | glass `#14213a` at 92%, ink `#e8dfc4`, gold `#f2b84b` |

## Materials

- Physically based (`MeshStandardMaterial`) with high roughness (0.75–1) for nearly everything. The textures are painted at load from a
  seed (plaster, tiles, slate, thatch, planks, stone, bark), with a matching bump. There are no image files.
- Image-based ambient light from a procedural sky environment (PMREM). It lights the shadow side cool and the sun side warm, and gives
  water and glass a soft reflection.
- Emissive is only for flames, lit windows at dusk, lanterns and magic. Only those may bloom.

## Lighting and atmosphere

- Key light: a warm sun (`#ffd9a0`) at about 35° elevation from the camera's left, with soft shadows (2048 px on high, 1024 on medium).
  The low tier has no shadow map. Its contact shadows are painted into the ground around buildings, so it never looks flat.
- Fill light: a cool hemisphere and sky environment, kept low enough that shadows keep their shape.
- Tone mapping: ACES filmic, exposure about 1.0, applied once at the end of the chain.
- Haze: exponential fog towards the horizon colour, scaled to the camera distance so a far camera is not washed out.
- Setting: the plate is a floating island with a tapering rock root, above a slow two-layer cloud sea with a few small islets. The plate
  casts a soft shadow onto the cloud.

## Composition and camera

- Desktop: strategic three-quarter view, azimuth 28° and elevation 44°. The plate fills about 70% of the width. The focal point is the
  bridge, and both banks are in frame. Orbit is bounded (±75° azimuth, 24–66° elevation), so the camera can never look under the world.
- Phone portrait: the plate is turned a quarter-turn so its long side runs up the screen. It is framed in the space the interface leaves
  free. It is composed for the narrow frame, not a crop of the desktop view.
- Phone landscape: the desktop framing, with the interface folded small.
- Every panel moves the camera's framing (insets), so the selected thing is never under a card.

## Motion language

- Ambient motion is slow and continuous: wind in the foliage at 0.2–0.5 Hz, the river flowing, smoke rising and leaning with the wind,
  birds circling high up on fine days, people walking with a bob, working and resting. Rain falls and rings the water in storms.
- Events are short, eased pulses of 0.6–1.2 s (rings, ripples, ribbons, runes). The camera eases. Nothing snaps.
- Reduced motion stops ambient drift and particles but keeps every fact as text.

## Interface language

- Warm dark glass panels with gold accents and serif headings. Small cards are anchored to what they describe. The world keeps at least
  75% of a desktop screen and 60% of a phone's at rest.
- Touch targets are 44×44 CSS px wherever space allows. On phones, secondary controls fold into one button and the tutorial tip is a
  single line until tapped.

## Quality bar (what "done" looks like in a frame)

- A Day-1 screenshot with no interface reads instantly as a cozy fantasy village. It has volume, material, ink lines, density and light.
- A close-up of a house shows roof shape, chimney, windows on more than one side, a door, a footing, a yard and props.
- Forests are dense and varied, not one model repeated in a grid.
- Water moves, foams at the banks and rings in the rain. A flood covers exactly the tiles the engine floods.
- A law taking effect is visible as a physical change on the ground (rings, a reach disc, the water stopping), not only a meter.

## Anti-patterns (reject on sight)

- Saturated "toy" green everywhere, or flat uniform lighting.
- Big uniform blocks of one tree species or one autumn colour.
- Outlines on grass and ground noise, or outlines thick enough to look like a cartoon filter.
- Bloom on the whole frame. Only magic, fire and lit windows may glow.
- An empty plate edge, or a void around the world.
- Interface panels that hide the village or the selected thing.
