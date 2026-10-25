import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Points, ShaderMaterial } from "three";
import { particleFragment } from "./ParticleReveal";

// Demo cut switch: use the 1-second scan-line crossfade if GPU morph misbehaves.
export const forceFallback = false;
const ordered = new WeakMap<Float32Array, Float32Array>();

export function mortonSort(points: Float32Array): Float32Array {
  const existing = ordered.get(points);
  if (existing) return existing;
  const spread = (value: number) => { let x = Math.max(0, Math.min(1023, value)); x = (x | x << 16) & 0x030000ff; x = (x | x << 8) & 0x0300f00f; x = (x | x << 4) & 0x030c30c3; x = (x | x << 2) & 0x09249249; return x; };
  // Shared world-space domain for both cars, so the pairing is stable.
  const count = points.length / 3;
  const codes = new Uint32Array(count);
  let order = new Uint32Array(count), scratch = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    order[i] = i;
    codes[i] =
    spread(Math.floor((points[i * 3] + 2.4) / 4.8 * 1023)) |
    spread(Math.floor(points[i * 3 + 1] / 2.5 * 1023)) << 1 |
    spread(Math.floor((points[i * 3 + 2] + 1.5) / 3 * 1023)) << 2;
  }
  // Stable radix passes avoid allocating a JS object per particle and comparator
  // sorting on the first morph. Equal codes retain source order deterministically.
  const buckets = new Uint32Array(256);
  for (let shift = 0; shift < 32; shift += 8) {
    buckets.fill(0);
    for (let i = 0; i < count; i++) buckets[(codes[order[i]] >>> shift) & 255]++;
    let offset = 0;
    for (let i = 0; i < 256; i++) { const size = buckets[i]; buckets[i] = offset; offset += size; }
    for (let i = 0; i < count; i++) scratch[buckets[(codes[order[i]] >>> shift) & 255]++] = order[i];
    [order, scratch] = [scratch, order];
  }
  const sorted = new Float32Array(points.length);
  for (let index = 0; index < count; index++) {
    const i = order[index] * 3;
    sorted[index * 3] = points[i]; sorted[index * 3 + 1] = points[i + 1]; sorted[index * 3 + 2] = points[i + 2];
  }
  ordered.set(points, sorted);
  return sorted;
}

export function createParticleMorph(from: Float32Array, to: Float32Array, low: boolean) {
  if (from.length !== to.length) throw new Error("Morph point counts must match.");
  const a = mortonSort(from), b = mortonSort(to);
  const fromAttribute = new Float32BufferAttribute(a, 3);
  const geometry = new BufferGeometry().setAttribute("position", fromAttribute)
    .setAttribute("aFrom", fromAttribute).setAttribute("aTo", new Float32BufferAttribute(b, 3));
  const material = new ShaderMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uMorph: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new Color("#27E1FF") }, uPixelRatio: { value: 1 } },
    vertexShader: `attribute vec3 aFrom; attribute vec3 aTo; uniform float uMorph; uniform float uPixelRatio;
      void main() {
      float delay = clamp((aFrom.x+2.3)/4.6,0.0,1.0)*0.22;
      float local = clamp((uMorph-delay)/0.78,0.0,1.0);
      float t = local*local*local*(local*(local*6.0-15.0)+10.0);
      vec3 p = mix(aFrom,aTo,t);
      float arc = 16.0*t*t*(1.0-t)*(1.0-t);
      // Coherent ribbons follow the car's flanks. Larger shape changes travel
      // on wider curves, while nearby surface matches stay close to the body.
      float distanceToTarget = min(length(aTo-aFrom),1.5);
      float side = aFrom.z / max(abs(aFrom.z),0.15);
      float ribbon = sin(aFrom.x*1.1+aFrom.y*0.8);
      p += vec3(0.08*ribbon,0.12+0.13*distanceToTarget,side*(0.12+0.16*distanceToTarget))*arc;
      vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
      gl_PointSize = (1.65+0.5*arc)*uPixelRatio*clamp(7.0/max(1.0,-mv.z),0.65,1.6); }`,
    fragmentShader: particleFragment(low),
  });
  const cloud = new Points(geometry, material); cloud.frustumCulled = false; cloud.userData.contactIgnore = true;
  return cloud;
}

export function createScanLine() {
  const geometry = new BufferGeometry().setAttribute("position", new Float32BufferAttribute([-3,0,0, 3,0,0, -3,2.5,0, 3,2.5,0],3)).setIndex([0,1,2,2,1,3]);
  const material = new ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false,
    uniforms: { uProgress: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=vec2((position.x+3.0)/6.0,position.y/2.5); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uProgress;
      void main(){ float line=1.0-smoothstep(0.0,0.012,abs(vUv.y-(1.0-uProgress))); gl_FragColor=vec4(0.153,0.882,1.0,line*sin(uProgress*3.14159265)*0.6); }`,
  });
  return { geometry, material };
}
