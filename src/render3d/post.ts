import * as THREE from 'three';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import type { Quality } from './context.ts';

/**
 * The finishing chain the 3D village is drawn through: the scene goes into a high-range buffer with its depth, and one pass then
 * darkens hollows (a depth-only ambient occlusion), draws the thin warm ink line round everything that stands up from the ground,
 * adds the glow of whatever emits light, and tone-maps (ACES, once, here and nowhere else) and encodes for the screen. A last pass
 * smooths jagged edges (FXAA). Nothing here reads or changes the simulation.
 *
 * How a pixel knows what it is: every opaque material writes a code into the alpha channel, which the screen never shows (the canvas
 * has no alpha). Standing things (houses, trees, people, the bridge) write `1 + glow`; the ground and what lies flat on it (terrain,
 * grass, flowers, crops, small stones) write `-(1 + glow)` and the sky `-0.5`, where glow comes from the material's own emissive light, so only
 * lit windows, lanterns, fire and belief magic ever bloom. Transparent things leave the code of what is behind them untouched. The
 * ink is drawn on standing things where their depth breaks away from what is behind them, and where they meet the ground; never on
 * grass or the ground's own folds.
 */

export interface PostProfile {
  /** depth-only ambient occlusion: pairs of samples (0 turns it off) */
  ao: number;
  /** glow on emissive light */
  bloom: boolean;
  /** smooth jagged edges after everything else */
  fxaa: boolean;
}

export const POST_PROFILES: Record<Quality, PostProfile> = {
  high: { ao: 4, bloom: true, fxaa: true },
  medium: { ao: 2, bloom: false, fxaa: true },
  low: { ao: 0, bloom: false, fxaa: false },
};

/** what the art direction sets (docs/3D_VISUAL_STANDARD.md): a warm brown ink, drawn at about 70% */
export interface PostLook {
  /** how dark the ink is drawn, 0..1 */
  ink: number;
  inkColor: number;
  aoStrength: number;
  bloomStrength: number;
}

export const DEFAULT_LOOK: PostLook = { ink: 0.72, inkColor: 0x2b2018, aoStrength: 0.55, bloomStrength: 0.3 };

/**
 * Colours authored for the screen (the sky, the cloud sea, effect trails, sparks, the overlays on people and routes) were never meant to
 * pass through a tone curve. While the chain draws, those shaders hand their colour to `postDisplay()`, which inverts the chain's ACES
 * (three.js's fit, with its exposure), so they come out exactly as authored after the one tone mapping. Lit materials are not touched.
 */
export const displayUniforms = { uDisplayComp: { value: 0 }, uPostExposure: { value: 1 } };

export const DISPLAY_GLSL = /* glsl */ `
  uniform float uDisplayComp;
  uniform float uPostExposure;
  vec3 postDisplay(vec3 d) {
    if (uDisplayComp < 0.5) return d;
    d = clamp(d, 0.0, 0.985);
    vec3 v = mat3(vec3(0.643038, 0.059269, 0.005962), vec3(0.311187, 0.931436, 0.063929), vec3(0.045775, 0.009295, 0.930118)) * d;
    vec3 A = v * 0.983729 - 1.0;
    vec3 B = v * 0.4329510 - 0.0245786;
    vec3 C = v * 0.238081 + 0.000090537;
    vec3 x = (-B - sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A);
    return max(mat3(vec3(1.764741, -0.147028, -0.036337), vec3(-0.675778, 1.160252, -0.162436), vec3(-0.088963, -0.013224, 1.198773)) * x, 0.0) * (0.6 / uPostExposure);
  }
`;

const INV_OUT = [0.643038, 0.311187, 0.045775, 0.059269, 0.931436, 0.009295, 0.005962, 0.063929, 0.930118];
const INV_IN = [1.764741, -0.675778, -0.088963, -0.147028, 1.160252, -0.013224, -0.036337, -0.162436, 1.198773];

/** the same inverse on the CPU, for colours set as uniforms that three.js mixes in after its own tone mapping (the fog) */
export function preCompensate(c: THREE.Color, exposure: number): THREE.Color {
  const d = [c.r, c.g, c.b].map((x) => Math.min(0.985, Math.max(0, x)));
  const v = [0, 1, 2].map((i) => INV_OUT[i * 3] * d[0] + INV_OUT[i * 3 + 1] * d[1] + INV_OUT[i * 3 + 2] * d[2]);
  const x = v.map((y) => {
    const A = y * 0.983729 - 1;
    const B = y * 0.432951 - 0.0245786;
    const C = y * 0.238081 + 0.000090537;
    return (-B - Math.sqrt(Math.max(B * B - 4 * A * C, 0))) / (2 * A);
  });
  const l = [0, 1, 2].map((i) => Math.max(0, INV_IN[i * 3] * x[0] + INV_IN[i * 3 + 1] * x[1] + INV_IN[i * 3 + 2] * x[2]) * (0.6 / exposure));
  return c.setRGB(l[0], l[1], l[2]);
}

/** mark a material as ground (or flat on it): no ink, and it never becomes a standing outline's background by mistake */
export function markGround<T extends THREE.Material>(m: T): T {
  m.userData.ground = true;
  return m;
}

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */ `
  #include <packing>
  #include <tonemapping_pars_fragment>
  varying vec2 vUv;
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform sampler2D tBloom;
  uniform vec2 uTexel;
  uniform float uNear;
  uniform float uFar;
  uniform vec3 uInk;
  uniform float uInkAmount;
  uniform float uInkWidth;
  uniform vec2 uInkFade;
  uniform float uAO;
  uniform float uAORadius;
  uniform float uProj;
  uniform float uBloom;

  float viewZ(vec2 uv) {
    return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar);
  }

  void main() {
    vec4 src = texture2D(tColor, vUv);
    vec3 c = src.rgb;
    float z = viewZ(vUv);
    bool ground = src.a < 0.0;

    #if AO_PAIRS > 0
      // pairs of opposite samples: where both sides come nearer than this pixel it sits in a hollow (the foot of a wall, under eaves,
      // between roots). A plane gives no occlusion at any angle, and a pair that reaches a far foreground object is ignored, so there is
      // no dark halo round silhouettes
      float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      float rad = clamp(uAORadius * uProj / z, 2.0, 48.0);
      float occ = 0.0;
      for (int i = 0; i < AO_PAIRS; i++) {
        float ang = (float(i) + ign) * 3.14159265 / float(AO_PAIRS);
        float s = mix(0.4, 1.0, fract(ign * 7.31 + float(i) * 0.618));
        vec2 d = vec2(cos(ang), sin(ang)) * rad * s * uTexel;
        float z1 = viewZ(vUv + d);
        float z2 = viewZ(vUv - d);
        float ok = step(z - z1, uAORadius * 3.0) * step(z - z2, uAORadius * 3.0);
        occ += ok * clamp((z - 0.5 * (z1 + z2)) / uAORadius, 0.0, 1.0);
      }
      c *= 1.0 - uAO * occ / float(AO_PAIRS);
    #endif

    // ink: the second difference of depth is about zero across any smooth surface and large where a nearer thing breaks away from what
    // is behind it, positive on the near side, so the line is one pixel wide and sits on the thing it describes
    vec2 ox = vec2(uTexel.x * uInkWidth, 0.0);
    vec2 oy = vec2(0.0, uTexel.y * uInkWidth);
    float zl = viewZ(vUv - ox);
    float zr = viewZ(vUv + ox);
    float zd = viewZ(vUv - oy);
    float zu = viewZ(vUv + oy);
    float rel = max(zl + zr, zd + zu) / z - 2.0;
    // the ground is only outlined where it ends against the sky (the rim of the island), never at its own folds or its grass
    float edge = ground ? smoothstep(0.3, 0.6, rel) : smoothstep(0.012, 0.035, rel);
    if (!ground) {
      // and a standing thing is outlined where it meets the ground (unless the ground is in front of it)
      float al = texture2D(tColor, vUv - ox).a;
      float ar = texture2D(tColor, vUv + ox).a;
      float ad = texture2D(tColor, vUv - oy).a;
      float au = texture2D(tColor, vUv + oy).a;
      float zMin = z * 0.985;
      float meets = max(max(step(al, 0.0) * step(zMin, zl), step(ar, 0.0) * step(zMin, zr)), max(step(ad, 0.0) * step(zMin, zd), step(au, 0.0) * step(zMin, zu)));
      edge = max(edge, meets);
    }
    float ink = edge * (1.0 - smoothstep(uInkFade.x, uInkFade.y, z)) * uInkAmount;
    c = mix(c, uInk, ink);

    #ifdef USE_BLOOM
      c += texture2D(tBloom, vUv).rgb * uBloom;
    #endif

    gl_FragColor = vec4(ACESFilmicToneMapping(c), 1.0);
    gl_FragColor = sRGBTransferOETF(gl_FragColor);
  }
`;

/** half-resolution bright pass: only what the materials marked as emitting light (or what is far brighter than any lit wall) */
const BRIGHT_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tColor;
  uniform vec2 uSrcSize;
  vec3 tap(vec2 px) {
    vec4 t = texture2D(tColor, px / uSrcSize);
    float m = max(t.r, max(t.g, t.b));
    // emissive materials say how much they glow; anything else glows only when far brighter than a lit wall, and never the sky (code -0.5),
    // whose screen-authored whites are bright in this buffer only because they were pre-compensated for the tone curve
    float w = max(abs(t.a) - 1.0, step(0.75, abs(t.a)) * smoothstep(1.6, 2.6, m));
    return min(t.rgb, vec3(4.0)) * clamp(w, 0.0, 2.0);
  }
  void main() {
    // the four source texels under this one, read at their centres so the alpha codes are never blended together
    vec2 base = floor(vUv * uSrcSize * 0.5) * 2.0;
    vec3 s = tap(base + vec2(0.5, 0.5)) + tap(base + vec2(1.5, 0.5)) + tap(base + vec2(0.5, 1.5)) + tap(base + vec2(1.5, 1.5));
    gl_FragColor = vec4(s * 0.25, 1.0);
  }
`;

const DOWN_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tSrc;
  uniform vec2 uHalf;
  void main() {
    vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
    s += texture2D(tSrc, vUv - uHalf).rgb;
    s += texture2D(tSrc, vUv + uHalf).rgb;
    s += texture2D(tSrc, vUv + vec2(uHalf.x, -uHalf.y)).rgb;
    s += texture2D(tSrc, vUv - vec2(uHalf.x, -uHalf.y)).rgb;
    gl_FragColor = vec4(s / 8.0, 1.0);
  }
`;

const UP_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tSrc;
  uniform sampler2D tAdd;
  uniform vec2 uHalf;
  void main() {
    vec2 h = uHalf;
    vec3 s = texture2D(tSrc, vUv + vec2(-h.x * 2.0, 0.0)).rgb;
    s += texture2D(tSrc, vUv + vec2(-h.x, h.y)).rgb * 2.0;
    s += texture2D(tSrc, vUv + vec2(0.0, h.y * 2.0)).rgb;
    s += texture2D(tSrc, vUv + vec2(h.x, h.y)).rgb * 2.0;
    s += texture2D(tSrc, vUv + vec2(h.x * 2.0, 0.0)).rgb;
    s += texture2D(tSrc, vUv + vec2(h.x, -h.y)).rgb * 2.0;
    s += texture2D(tSrc, vUv + vec2(0.0, -h.y * 2.0)).rgb;
    s += texture2D(tSrc, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
    gl_FragColor = vec4(s / 12.0 + texture2D(tAdd, vUv).rgb, 1.0);
  }
`;

const BLOOM_LEVELS = 4;

function target(w: number, h: number, type: THREE.TextureDataType, depth = false): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: depth,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  if (depth) {
    rt.depthTexture = new THREE.DepthTexture(Math.max(1, w), Math.max(1, h));
    rt.depthTexture.type = THREE.UnsignedIntType;
    rt.depthTexture.minFilter = THREE.NearestFilter;
    rt.depthTexture.magFilter = THREE.NearestFilter;
  }
  rt.texture.name = 'post';
  return rt;
}

export class PostChain {
  private readonly renderer: THREE.WebGLRenderer;
  private profile: PostProfile;
  look: PostLook = { ...DEFAULT_LOOK };
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quadGeo: THREE.BufferGeometry;
  private readonly quad: THREE.Mesh;
  private scene: THREE.WebGLRenderTarget;
  private ldr: THREE.WebGLRenderTarget | null = null;
  private down: THREE.WebGLRenderTarget[] = [];
  private up: THREE.WebGLRenderTarget[] = [];
  private composite: THREE.ShaderMaterial;
  private readonly bright: THREE.ShaderMaterial;
  private readonly downMat: THREE.ShaderMaterial;
  private readonly upMat: THREE.ShaderMaterial;
  private readonly fxaa: THREE.ShaderMaterial;
  private readonly type: THREE.TextureDataType;
  private w = 1;
  private h = 1;
  private readonly seen = new WeakSet<THREE.Material>();
  /** the materials patched so far (for the debug view) */
  patched = 0;

  /** a renderer that cannot draw into a high-range buffer gets no chain (the caller draws directly) */
  static supported(renderer: THREE.WebGLRenderer): boolean {
    return renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
  }

  constructor(renderer: THREE.WebGLRenderer, quality: Quality) {
    this.renderer = renderer;
    this.profile = POST_PROFILES[quality];
    this.type = THREE.HalfFloatType;
    this.quadGeo = new THREE.BufferGeometry();
    // one triangle that covers the screen
    this.quadGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quadGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.scene = target(1, 1, this.type, true);
    this.composite = this.makeComposite();
    const mat = (frag: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial =>
      new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
    this.bright = mat(BRIGHT_FRAG, { tColor: { value: null }, uSrcSize: { value: new THREE.Vector2() } });
    this.downMat = mat(DOWN_FRAG, { tSrc: { value: null }, uHalf: { value: new THREE.Vector2() } });
    this.upMat = mat(UP_FRAG, { tSrc: { value: null }, tAdd: { value: null }, uHalf: { value: new THREE.Vector2() } });
    this.fxaa = new THREE.ShaderMaterial({
      vertexShader: FXAAShader.vertexShader,
      fragmentShader: FXAAShader.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms),
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.quad = new THREE.Mesh(this.quadGeo, this.composite);
    this.quad.frustumCulled = false;
  }

  private makeComposite(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: COMPOSITE_FRAG,
      defines: { AO_PAIRS: this.profile.ao, ...(this.profile.bloom ? { USE_BLOOM: '' } : {}) },
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        tBloom: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uNear: { value: 0.5 },
        uFar: { value: 400 },
        uInk: { value: new THREE.Color() },
        uInkAmount: { value: 0.7 },
        uInkWidth: { value: 1 },
        uInkFade: { value: new THREE.Vector2(40, 90) },
        uAO: { value: 0.5 },
        uAORadius: { value: 0.35 },
        uProj: { value: 1 },
        uBloom: { value: 0.7 },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  }

  get settings(): PostProfile {
    return this.profile;
  }

  setQuality(q: Quality): void {
    this.setProfile(POST_PROFILES[q]);
  }

  /** change what the chain does (a quality tier, or a debug switch) */
  setProfile(p: PostProfile): void {
    const old = this.profile;
    this.profile = { ...p };
    if (old.ao !== p.ao || old.bloom !== p.bloom) {
      this.composite.dispose();
      this.composite = this.makeComposite();
    }
    this.allocate();
  }

  setSize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = Math.max(1, Math.round(w));
    this.h = Math.max(1, Math.round(h));
    this.allocate();
  }

  private allocate(): void {
    this.scene.setSize(this.w, this.h);
    if (this.profile.fxaa) {
      this.ldr ??= target(this.w, this.h, THREE.UnsignedByteType);
      this.ldr.setSize(this.w, this.h);
    } else {
      this.ldr?.dispose();
      this.ldr = null;
    }
    const want = this.profile.bloom ? BLOOM_LEVELS : 0;
    while (this.down.length > want) this.down.pop()?.dispose();
    while (this.up.length > Math.max(0, want - 1)) this.up.pop()?.dispose();
    for (let i = 0; i < want; i++) {
      const s = 2 ** (i + 1);
      const w = Math.max(1, Math.round(this.w / s));
      const h = Math.max(1, Math.round(this.h / s));
      this.down[i] ??= target(w, h, this.type);
      this.down[i].setSize(w, h);
      if (i < want - 1) {
        this.up[i] ??= target(w, h, this.type);
        this.up[i].setSize(w, h);
      }
    }
  }

  /**
   * Give every material in the scene its alpha code before it is first drawn: opaque ones write it from the shader, transparent ones
   * keep the code already in the buffer. Cheap after the first pass (a set lookup per material), so it runs every frame and catches
   * whatever the effects create mid-run.
   */
  prepare(root: THREE.Object3D): void {
    root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      if (Array.isArray(m)) for (const x of m) this.patch(x);
      else this.patch(m);
    });
  }

  private patch(m: THREE.Material): void {
    if (m.transparent) {
      // also re-applied if code elsewhere switched the blending since: the colour blend is unchanged, the alpha is left as it was
      if (m.blending !== THREE.CustomBlending) {
        const additive = m.blending === THREE.AdditiveBlending;
        m.blending = THREE.CustomBlending;
        m.blendEquation = THREE.AddEquation;
        m.blendSrc = m.premultipliedAlpha ? THREE.OneFactor : THREE.SrcAlphaFactor;
        m.blendDst = additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor;
        m.blendEquationAlpha = THREE.AddEquation;
        m.blendSrcAlpha = THREE.ZeroFactor;
        m.blendDstAlpha = THREE.OneFactor;
      }
      return;
    }
    if (this.seen.has(m)) return;
    this.seen.add(m);
    const lit = (m as THREE.MeshStandardMaterial).isMeshStandardMaterial || (m as THREE.MeshLambertMaterial).isMeshLambertMaterial || (m as THREE.MeshPhongMaterial).isMeshPhongMaterial;
    if (!lit && !(m as THREE.MeshBasicMaterial).isMeshBasicMaterial) return;
    const ground = !!m.userData.ground;
    const glow = lit ? 'clamp((max(totalEmissiveRadiance.r, max(totalEmissiveRadiance.g, totalEmissiveRadiance.b)) - 0.6) * 1.25, 0.0, 2.0)' : '0.0';
    const key = `${m.customProgramCacheKey()}|post:${ground ? 'g' : 'o'}${lit ? 'l' : 'b'}`;
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (shader, r) => {
      prev.call(m, shader, r);
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>\n  gl_FragColor.a = ${ground ? '-' : ''}(1.0 + ${glow});`);
    };
    m.customProgramCacheKey = () => key;
    m.needsUpdate = true;
    this.patched++;
  }

  /** draw `scene` through the chain to the screen */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, opts: { inkFadeStart: number; inkFadeEnd: number; dprScale: number }): void {
    const r = this.renderer;
    this.prepare(scene);
    r.setRenderTarget(this.scene);
    r.render(scene, camera);

    let bloomTex: THREE.Texture | null = null;
    if (this.profile.bloom && this.down.length === BLOOM_LEVELS) {
      this.bright.uniforms.tColor.value = this.scene.texture;
      (this.bright.uniforms.uSrcSize.value as THREE.Vector2).set(this.w, this.h);
      this.pass(this.bright, this.down[0]);
      for (let i = 1; i < BLOOM_LEVELS; i++) {
        this.downMat.uniforms.tSrc.value = this.down[i - 1].texture;
        (this.downMat.uniforms.uHalf.value as THREE.Vector2).set(0.5 / this.down[i - 1].width, 0.5 / this.down[i - 1].height);
        this.pass(this.downMat, this.down[i]);
      }
      let src = this.down[BLOOM_LEVELS - 1];
      for (let i = BLOOM_LEVELS - 2; i >= 0; i--) {
        this.upMat.uniforms.tSrc.value = src.texture;
        this.upMat.uniforms.tAdd.value = this.down[i].texture;
        (this.upMat.uniforms.uHalf.value as THREE.Vector2).set(0.5 / src.width, 0.5 / src.height);
        this.pass(this.upMat, this.up[i]);
        src = this.up[i];
      }
      bloomTex = src.texture;
    }

    const u = this.composite.uniforms;
    u.tColor.value = this.scene.texture;
    u.tDepth.value = this.scene.depthTexture;
    u.tBloom.value = bloomTex;
    (u.uTexel.value as THREE.Vector2).set(1 / this.w, 1 / this.h);
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    (u.uInk.value as THREE.Color).setHex(this.look.inkColor);
    u.uInkAmount.value = this.look.ink;
    // about one CSS pixel wide whatever the screen density, in whole texels so the codes are read unblended
    u.uInkWidth.value = Math.max(1, Math.round(opts.dprScale * 0.85));
    (u.uInkFade.value as THREE.Vector2).set(opts.inkFadeStart, opts.inkFadeEnd);
    u.uAO.value = this.look.aoStrength;
    u.uProj.value = this.h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    u.uBloom.value = this.look.bloomStrength;
    this.pass(this.composite, this.ldr);
    if (this.ldr) {
      this.fxaa.uniforms.tDiffuse.value = this.ldr.texture;
      (this.fxaa.uniforms.resolution.value as THREE.Vector2).set(1 / this.w, 1 / this.h);
      this.pass(this.fxaa, null);
    }
  }

  private pass(mat: THREE.Material, to: THREE.WebGLRenderTarget | null): void {
    this.quad.material = mat;
    this.renderer.setRenderTarget(to);
    this.renderer.render(this.quad, this.quadCam);
  }

  dispose(): void {
    this.scene.dispose();
    this.scene.depthTexture?.dispose();
    this.ldr?.dispose();
    for (const t of [...this.down, ...this.up]) t.dispose();
    this.down = [];
    this.up = [];
    this.composite.dispose();
    this.bright.dispose();
    this.downMat.dispose();
    this.upMat.dispose();
    this.fxaa.dispose();
    this.quadGeo.dispose();
  }
}
