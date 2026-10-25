import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial } from "three";
import type { CarStageProps } from "./types";

export const revealStages = ["converge", "pointcloud", "wireframe", "solid", "done"] as const;
const boundaries = [0, 2, 2.5, 3, 4];
export class RevealClock {
  elapsed = 0;
  private next = 0;
  constructor(private readonly callback: CarStageProps["onRevealStage"]) {}
  advance(delta: number) {
    this.elapsed = Math.min(4, this.elapsed + Math.max(0, delta));
    while (this.next < 5 && this.elapsed >= boundaries[this.next]) this.callback(revealStages[this.next++]);
  }
  skip() { this.advance(4); }
}

export function particleFragment(low: boolean) {
  return `uniform float uOpacity; uniform vec3 uColor;
    void main() { float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
    gl_FragColor = vec4(uColor, uOpacity * ${low ? "(1.0 - smoothstep(0.25, 0.5, r))" : "exp(-r*r*12.0) * (1.0 - smoothstep(0.4, 0.5, r))"}); }`;
}
export function createParticleReveal(target: Float32Array, low: boolean) {
  const start = new Float32Array(target.length), delay = new Float32Array(target.length / 3);
  let seed = 2026;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < delay.length; i++) {
    const y = random() * 2 - 1, angle = random() * Math.PI * 2, radius = 6 * Math.cbrt(random());
    const ring = Math.sqrt(1 - y * y) * radius;
    start.set([ring * Math.cos(angle), y * radius + 0.7, ring * Math.sin(angle)], i * 3);
    delay[i] = random() * 0.35;
  }
  const geometry = new BufferGeometry()
    .setAttribute("position", new Float32BufferAttribute(target.slice(), 3))
    .setAttribute("aTarget", new Float32BufferAttribute(target.slice(), 3))
    .setAttribute("aStart", new Float32BufferAttribute(start, 3))
    .setAttribute("aDelay", new Float32BufferAttribute(delay, 1));
  const material = new ShaderMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uProgress: { value: 0 }, uTime: { value: 0 }, uOpacity: { value: 1 }, uColor: { value: [0.153, 0.882, 1] }, uPixelRatio: { value: 1 } },
    vertexShader: `attribute vec3 aStart; attribute vec3 aTarget; attribute float aDelay;
      uniform float uProgress; uniform float uTime; uniform float uPixelRatio;
      void main() { float t = clamp((uProgress-aDelay)/(1.0-aDelay), 0.0, 1.0); t = t*t*t*(t*(t*6.0-15.0)+10.0);
      vec3 p = mix(aStart, aTarget, t);
      float arc = 16.0*t*t*(1.0-t)*(1.0-t);
      p += vec3(-aStart.z, 0.6, aStart.x)*0.12*arc;
      vec4 mv = modelViewMatrix * vec4(p,1.0); gl_Position = projectionMatrix * mv;
      gl_PointSize = 2.0*uPixelRatio*clamp(7.0/max(1.0,-mv.z),0.65,1.6); }`,
    fragmentShader: particleFragment(low),
  });
  const cloud = new Points(geometry, material);
  cloud.frustumCulled = false; cloud.userData.contactIgnore = true;
  return cloud;
}
