import { BirdsLayer } from './birds.ts';
import type { Layer, WorldContext } from './context.ts';
import { EffectsLayer } from './effects.ts';
import { FoliageLayer } from './foliage.ts';
import { LandmarksLayer } from './landmarks.ts';
import { PeopleLayer } from './people.ts';
import { RealityLayer } from './reality.ts';

/** the scene layers, in draw order; each one owns its own meshes and disposes them */
export function createLayers(ctx: WorldContext): Layer[] {
  const people = new PeopleLayer(ctx);
  ctx.actors = { gesture: (id, kind, s) => people.gesture(id, kind, s), faceToward: (id, x, z, s) => people.faceToward(id, x, z, s), head: (id) => people.headPosition(id) };
  return [new FoliageLayer(ctx), new LandmarksLayer(ctx), new RealityLayer(ctx), people, new BirdsLayer(ctx), new EffectsLayer(ctx)];
}
