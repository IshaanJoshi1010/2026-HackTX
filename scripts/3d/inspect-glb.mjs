import { stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';

export async function inspectGlb(filePath) {
  const absolutePath = resolve(filePath);
  if (extname(absolutePath).toLowerCase() !== '.glb') throw new Error('Expected a .glb file.');
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco.createDecoderModule(),
    'meshopt.decoder': MeshoptDecoder,
  });
  const document = await io.read(absolutePath);
  const root = document.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) throw new Error('Asset has no scene to inspect.');
  let triangles = 0;
  let meshInstances = 0;
  let primitiveInstances = 0;
  const warnings = [];
  scene.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    meshInstances++;
    if (node.getSkin()) warnings.push('Skinned mesh: bounds describe the rest geometry, not an animated pose.');
    if (node.getExtension('EXT_mesh_gpu_instancing')) throw new Error('GPU instancing requires manual instance-count review.');
    for (const primitive of mesh.listPrimitives()) {
      primitiveInstances++;
      const count = primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0;
      const mode = primitive.getMode();
      if (mode === 4) triangles += Math.floor(count / 3);
      else if (mode === 5 || mode === 6) triangles += Math.max(0, count - 2);
      else warnings.push('Non-triangle primitive excluded from triangle count.');
      if (primitive.listTargets().length) warnings.push('Morph targets present: bounds describe the base geometry.');
    }
  });
  const rawBounds = getBounds(scene);
  const boundingBox = [...rawBounds.min, ...rawBounds.max].every(Number.isFinite)
    ? { ...rawBounds, size: rawBounds.max.map((value, i) => value - rawBounds.min[i]) }
    : null;
  const materials = root.listMaterials().map((material, index) => ({
    index, name: material.getName() || '(unnamed)',
    baseColorTextured: Boolean(material.getBaseColorTexture()),
  }));
  const textures = root.listTextures().map((texture) => ({ name: texture.getName() || '(unnamed)', size: texture.getSize() }));
  const knownTextureSides = textures.flatMap((texture) => texture.size ?? []);
  const unknownTextureSizes = textures.filter((texture) => !texture.size).length;
  const fileSizeBytes = (await stat(absolutePath)).size;
  if (root.listScenes().length > 1) warnings.push('Triangle count and bounds cover the default scene (or first scene); material/texture lists cover the whole file.');
  return {
    file: absolutePath, fileSizeBytes, triangles, meshCount: root.listMeshes().length,
    meshInstances, primitiveInstances, materials, textureCount: textures.length, textures,
    maxTextureSide: knownTextureSides.length ? Math.max(...knownTextureSides) : null,
    unknownTextureSizes, boundingBox,
    bodyPaintCandidates: materials.filter((material) => /body|paint|carpaint|exterior/i.test(material.name)),
    checks: {
      trianglesAtMost200k: triangles <= 200000,
      fileAtMost10MB: fileSizeBytes <= 10000000,
      texturesAtMost2048: knownTextureSides.some((side) => side > 2048) ? false : unknownTextureSizes ? null : true,
    },
    warnings: [...new Set(warnings), 'Material names are guesses. Manually verify separate recolorable body, license, generation, trim, and front-end geometry.'],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] === '--help') {
    console.log('Usage: node scripts/3d/inspect-glb.mjs <model.glb>');
    process.exitCode = args[0] === '--help' ? 0 : 1;
  } else {
    try { console.log(JSON.stringify(await inspectGlb(args[0]), null, 2)); }
    catch (error) { console.error(`Inspection failed: ${error.message}`); process.exitCode = 1; }
  }
}
