import * as THREE from 'three';

/**
 * Image-based ambient light: a soft sky (cool overhead, warm at the horizon, olive bounce from the ground below, a warm glow where the
 * sun is) rendered once into a pre-filtered environment map. Every physically based material takes its ambient light and its soft
 * reflections from it, so the shadow side of a house is lit cool by the sky and warm by the ground, and glass and wet stone catch a
 * little of the sky. Made once per renderer (and again after a lost graphics context); the weather scales its strength.
 */
export function makeEnvironment(renderer: THREE.WebGLRenderer, sunDir: THREE.Vector3): THREE.WebGLRenderTarget {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x8fb7dc) },
      uHorizon: { value: new THREE.Color(0xf1ead0) },
      uGround: { value: new THREE.Color(0x6b6a45) },
      uSun: { value: sunDir.clone().normalize() },
      uSunCol: { value: new THREE.Color(0xffe1ad) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uGround;
      uniform vec3 uSun;
      uniform vec3 uSunCol;
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = d.y > 0.0 ? mix(uHorizon, uTop, pow(d.y, 0.55)) : mix(uHorizon * 0.8, uGround, pow(-d.y, 0.35));
        float s = max(0.0, dot(d, uSun));
        c += uSunCol * (pow(s, 48.0) * 5.0 + pow(s, 5.0) * 0.3);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  scene.add(new THREE.Mesh(geo, mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  geo.dispose();
  mat.dispose();
  return rt;
}
