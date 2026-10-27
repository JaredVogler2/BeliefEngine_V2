/**
 * The one place the 3D world's axes are defined.
 *
 *   x  east   = tile column
 *   z  south  = tile row (the engine's y; +z points at the viewer in the default camera, so north is "up the screen" as on the old map)
 *   y  up     = terrain height, in world units
 *
 * One tile is one world unit square. A tile (tx, ty) occupies x in [tx, tx+1) and z in [ty, ty+1); its centre is (tx+.5, ty+.5).
 * Heights come from the engine's integer elevation times HEIGHT_UNIT, so the relief a player sees is the relief the simulation has.
 */
export const TILE = 1;
export const HEIGHT_UNIT = 0.28;
/** visual depth of one engine flood-depth step */
export const WATER_UNIT = 0.22;
/** how far below its neighbours the river channel is cut */
export const CHANNEL_DEPTH = 0.5;

export interface Vec2 {
  x: number;
  z: number;
}

export function tileCenter(tx: number, ty: number): Vec2 {
  return { x: (tx + 0.5) * TILE, z: (ty + 0.5) * TILE };
}

/** world position of a (possibly fractional) engine position, where villagers stand at tile coordinates */
export function engineToWorld(x: number, y: number): Vec2 {
  return { x: (x + 0.5) * TILE, z: (y + 0.5) * TILE };
}

export function worldToTile(wx: number, wz: number): { x: number; y: number } {
  return { x: Math.floor(wx / TILE), y: Math.floor(wz / TILE) };
}

export function worldToEngine(wx: number, wz: number): { x: number; y: number } {
  return { x: wx / TILE - 0.5, y: wz / TILE - 0.5 };
}
