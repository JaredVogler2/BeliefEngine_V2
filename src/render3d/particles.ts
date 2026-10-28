import * as THREE from 'three';
import { DISPLAY_GLSL, displayUniforms } from './post.ts';

/**
 * A pool of soft point sprites for smoke, flames, embers and sparks. One draw call per pool, a fixed number of slots (a burst of
 * events can never grow it), and every particle's size is in world units so it stays the right size as the camera moves. Purely
 * visual: nothing here is read by the simulation, and the random numbers are not the engine's.
 */
export const viewScale = { value: 800 };

const VERT = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  varying vec4 vColor;
  uniform float uScale;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(0.0, aSize * uScale / -mv.z);
  }
`;
const FRAG = /* glsl */ `
  ${DISPLAY_GLSL}
  varying vec4 vColor;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    float a = (1.0 - smoothstep(0.12, 0.5, d)) * vColor.a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(postDisplay(vColor.rgb), a);
    #include <colorspace_fragment>
  }
`;

export class Particles {
  readonly points: THREE.Points;
  private readonly n: number;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly size: Float32Array;
  private readonly col: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly s0: Float32Array;
  private readonly s1: Float32Array;
  private readonly c0: Float32Array;
  private readonly c1: Float32Array;
  private readonly a0: Float32Array;
  private readonly drag: Float32Array;
  private readonly rise: Float32Array;
  private head = 0;
  private live = 0;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly sizeAttr: THREE.BufferAttribute;
  private readonly colAttr: THREE.BufferAttribute;

  constructor(max: number, additive: boolean) {
    this.n = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.col = new Float32Array(max * 4);
    this.age = new Float32Array(max).fill(1);
    this.life = new Float32Array(max).fill(1);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.rise = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1);
    this.colAttr = new THREE.BufferAttribute(this.col, 4);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('aSize', this.sizeAttr);
    this.geo.setAttribute('aColor', this.colAttr);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: viewScale.value }, ...displayUniforms },
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
  }

  get count(): number {
    return this.live;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, c0: THREE.Color, c1: THREE.Color, a0: number, drag = 0.6, rise = 0): void {
    const i = this.head;
    this.head = (this.head + 1) % this.n;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.age[i] = 0;
    this.life[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.c0[i * 3] = c0.r;
    this.c0[i * 3 + 1] = c0.g;
    this.c0[i * 3 + 2] = c0.b;
    this.c1[i * 3] = c1.r;
    this.c1[i * 3 + 1] = c1.g;
    this.c1[i * 3 + 2] = c1.b;
    this.a0[i] = a0;
    this.drag[i] = drag;
    this.rise[i] = rise;
  }

  update(dt: number): void {
    this.mat.uniforms.uScale.value = viewScale.value;
    let live = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] >= 1) {
        if (this.size[i] !== 0) {
          this.size[i] = 0;
          this.col[i * 4 + 3] = 0;
        }
        continue;
      }
      live++;
      this.age[i] += dt / this.life[i];
      const t = Math.min(1, this.age[i]);
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k + this.rise[i] * dt;
      this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.col[i * 4] = this.c0[i * 3] + (this.c1[i * 3] - this.c0[i * 3]) * t;
      this.col[i * 4 + 1] = this.c0[i * 3 + 1] + (this.c1[i * 3 + 1] - this.c0[i * 3 + 1]) * t;
      this.col[i * 4 + 2] = this.c0[i * 3 + 2] + (this.c1[i * 3 + 2] - this.c0[i * 3 + 2]) * t;
      // fade in quickly, out slowly
      this.col[i * 4 + 3] = this.a0[i] * Math.min(1, t * 8) * (1 - t) * (1 - t);
    }
    this.live = live;
    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }

  clear(): void {
    this.age.fill(1);
    this.size.fill(0);
    this.col.fill(0);
    this.live = 0;
    this.sizeAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
