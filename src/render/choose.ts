import type { WorldRenderer } from './types.ts';

export type RendererChoice = '2d' | '3d';

const KEY = 'belief.renderer';

/** WebGL2 is the baseline for the 3D world; without it the classic map is used and the player is told */
export function webgl2Available(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

let softwareCached: boolean | null = null;

/**
 * True when WebGL is only a software rasteriser (SwiftShader, llvmpipe: a machine with no graphics acceleration, or a headless test
 * browser). The 3D world would run at a frame or two a second there, so the classic map is the better default; the player can still ask
 * for 3D on the map tools or in the address (?renderer=3d).
 */
export function softwareGL(): boolean {
  if (softwareCached !== null) return softwareCached;
  let soft = false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    soft = false;
  }
  softwareCached = soft;
  return soft;
}

/** ?renderer=2d|3d wins, then the player's saved choice, then 3D wherever it can run */
export function chooseRenderer(): { choice: RendererChoice; reason: string } {
  let asked: string | null = null;
  try {
    asked = new URLSearchParams(window.location.search).get('renderer');
  } catch {
    /* ignore */
  }
  if (asked !== '2d' && asked !== '3d') {
    try {
      asked = window.localStorage.getItem(KEY);
    } catch {
      asked = null;
    }
  }
  if (asked === '2d') return { choice: '2d', reason: 'classic map chosen' };
  if (!webgl2Available()) return { choice: '2d', reason: 'this browser cannot draw the 3D world (WebGL2 is not available), so the classic map is used' };
  // nothing was chosen: do not hand someone without graphics acceleration a slideshow
  if (asked !== '3d' && softwareGL()) return { choice: '2d', reason: 'no graphics acceleration was found, so the classic map is used (switch to 3D with the 3D button on the map)' };
  return { choice: '3d', reason: '' };
}

export function rememberRenderer(c: RendererChoice): void {
  try {
    window.localStorage.setItem(KEY, c);
  } catch {
    /* private window: the choice lasts for this page only */
  }
}

/** the 3D renderer is a separate chunk: the classic map and the menus do not pay for it */
export async function loadWorld3D(): Promise<new (canvas: HTMLCanvasElement) => WorldRenderer> {
  const m = await import('../render3d/World3D.ts');
  return m.World3D as unknown as new (canvas: HTMLCanvasElement) => WorldRenderer;
}
