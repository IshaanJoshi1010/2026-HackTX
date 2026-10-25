import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';
import { BufferGeometry, Float32BufferAttribute, Matrix4, Mesh, Vector3 } from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function seeded(seed = 2026) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export async function samplePoints(input, flip = false) {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco.createDecoderModule(), 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(input), vertices = [], v = new Vector3();
  const orientation = new Matrix4().makeRotationY(flip ? Math.PI : 0);
  doc.getRoot().listScenes()[0].traverse(node => {
    const world = new Matrix4().fromArray(node.getWorldMatrix()).premultiply(orientation);
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      if (primitive.getMode() !== 4) continue;
      const positions = primitive.getAttribute('POSITION');
      const indices = primitive.getIndices();
      for (let i = 0; i < (indices?.getCount() ?? positions.getCount()); i++) {
        const p = positions.getElement(indices ? indices.getScalar(i) : i, []);
        v.fromArray(p).applyMatrix4(world); vertices.push(v.x, v.y, v.z);
      }
    }
  });
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox, scale = 4.6 / (max.x - min.x);
  geometry.translate(-(min.x + max.x) / 2, -min.y, -(min.z + max.z) / 2); geometry.scale(scale, scale, scale);
  const mesh = new Mesh(geometry);
  const rng = seeded(), sampler = new MeshSurfaceSampler(mesh).setRandomGenerator(rng).build();
  const samples = Array.from({ length: 32768 }, () => { sampler.sample(v); return [v.x, v.y, v.z]; });
  // Spatial strata along X, then one sample per stratum in the low prefix.
  samples.sort((a, b) => a[0] - b[0]);
  const low = [], rest = [];
  for (let i = 0; i < samples.length; i += 4) {
    const pick = Math.floor(rng() * 4);
    for (let j = 0; j < 4; j++) (j === pick ? low : rest).push(samples[i + j]);
  }
  geometry.dispose(); mesh.material.dispose();
  return new Float32Array([...low, ...rest].flat());
}
export async function generate(root = process.cwd()) {
  const manifest = JSON.parse(await readFile(resolve(root, 'public/models/manifest.json'), 'utf8'));
  await mkdir(resolve(root, 'public/points'), { recursive: true });
  for (const entry of manifest) {
    const points = await samplePoints(resolve(root, `public${entry.glb}`), entry.glb.includes('camry-v80'));
    for (const [suffix, count] of [['', 32768], ['-low', 8192]]) {
      const bytes = Buffer.alloc(count * 12);
      for (let i = 0; i < count * 3; i++) bytes.writeFloatLE(points[i], i * 4);
      await writeFile(resolve(root, `public/points/${entry.vehicleId}${suffix}.bin`), bytes);
    }
    console.log(`${entry.vehicleId}: 32768 high / 8192 low`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await generate();
