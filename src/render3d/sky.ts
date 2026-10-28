import * as THREE from 'three';
import { DISPLAY_GLSL, displayUniforms } from './post.ts';

/**
 * The backdrop: a soft gradient from a cool sky at the top of the frame to warm mist at the bottom, with a gentle vignette, drawn in
 * screen space behind everything so the diorama floats in light instead of in a void. Its colours come from the current mood.
 */
export function makeSky(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: { uTop: { value: new THREE.Color(0xa9cbe6) }, uHorizon: { value: new THREE.Color(0xf1ead0) }, uBottom: { value: new THREE.Color(0xc9d6bc) }, uTime: { value: 0 }, uCloud: { value: 0.3 }, uCloudCol: { value: new THREE.Color(0xffffff) }, ...displayUniforms },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.9999, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uBottom;
      uniform float uTime;
      uniform float uCloud;
      uniform vec3 uCloudCol;
      ${DISPLAY_GLSL}
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float a = 0.5;
        float s = 0.0;
        for (int i = 0; i < 4; i++) {
          s += a * vn(p);
          p = p * 2.03 + 11.7;
          a *= 0.5;
        }
        return s;
      }
      void main() {
        float y = vUv.y;
        vec3 c = mix(uBottom, uHorizon, smoothstep(0.0, 0.45, y));
        c = mix(c, uTop, smoothstep(0.45, 1.0, y));
        // soft drifting cloud: thin and bright when the day is calm, a heavy dark ceiling in a storm
        float band = smoothstep(0.42, 0.9, y);
        vec2 q = vec2(vUv.x * 3.2 + uTime * 0.006, y * 1.8 - uTime * 0.002);
        float n = fbm(q + fbm(q * 0.7) * 0.6);
        float thr = 0.78 - 0.55 * uCloud;
        float cover = smoothstep(thr, thr + 0.22, n) * band;
        float shade = mix(1.0, 0.72, smoothstep(0.35, 0.8, n));
        c = mix(c, uCloudCol * shade, clamp(cover * (0.55 + 0.45 * uCloud), 0.0, 0.95));
        vec2 d = vUv - 0.5;
        float vig = 1.0 - dot(d, d) * 0.55;
        // alpha -0.5: the sky is background for the finishing chain (no ink, no glow); the screen never shows this alpha
        gl_FragColor = vec4(postDisplay(c * vig), -0.5);
        #include <colorspace_fragment>
      }
    `,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  quad.renderOrder = -10;
  quad.name = 'sky';
  return quad;
}
