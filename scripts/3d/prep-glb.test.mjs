import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { prepGlb } from './prep-glb.mjs';
import { inspectGlb } from './inspect-glb.mjs';

test('Draco roundtrip preserves paint and normalizes transformed Z-axis geometry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fork-prep-'));
  try {
    const doc = new Document();
    const position = doc.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,0, 1,0,5, 0,2,5])).setBuffer(doc.createBuffer());
    const indices = doc.createAccessor().setType('SCALAR').setArray(new Uint16Array([0,1,2])).setBuffer(doc.getRoot().listBuffers()[0]);
    const mesh = doc.createMesh().addPrimitive(doc.createPrimitive().setIndices(indices).setAttribute('POSITION', position).setMaterial(doc.createMaterial('Paint_Color')));
    doc.createScene().addChild(doc.createNode().setMesh(mesh).setTranslation([3,4,9]).setScale([2,2,2]));
    const input = join(dir, 'source.glb'), output = join(dir, 'ready.glb');
    await new NodeIO().write(input, doc);
    await prepGlb(input, output);
    const bytes = await readFile(output);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    assert.ok(json.meshes[0].primitives[0].extensions.KHR_draco_mesh_compression);
    const report = await inspectGlb(output);
    assert.equal(report.triangles, 1);
    assert.ok(Math.abs(report.boundingBox.size[0] - 4.6) < 0.002);
    assert.ok(Math.abs(report.boundingBox.min[1]) < 0.002);
    for (const axis of [0,2]) assert.ok(Math.abs(report.boundingBox.min[axis] + report.boundingBox.max[axis]) < 0.002);
    assert.equal(report.bodyPaintCandidates[0].baseColorTextured, false);
    await assert.rejects(prepGlb(input, input), /Preserve the source/);
    await assert.rejects(prepGlb(input, output, 'y'), /axis/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
