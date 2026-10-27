import * as THREE from 'three';

/**
 * The backdrop: a soft gradient from a cool sky at the top of the frame to warm mist at the bottom, with a gentle vignette, drawn in
 * screen space behind everything so the diorama floats in light instead of in a void. Its colours come from the current mood.
 */
export function makeSky(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: { uTop: { value: new THREE.Color(0xa9cbe6) }, uHorizon: { value: new THREE.Color(0xf1ead0) }, uBottom: { value: new THREE.Color(0xc9d6bc) } },
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
      void main() {
        float y = vUv.y;
        vec3 c = mix(uBottom, uHorizon, smoothstep(0.0, 0.45, y));
        c = mix(c, uTop, smoothstep(0.45, 1.0, y));
        vec2 d = vUv - 0.5;
        float vig = 1.0 - dot(d, d) * 0.55;
        gl_FragColor = vec4(c * vig, 1.0);
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
