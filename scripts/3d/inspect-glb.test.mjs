import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { inspectGlb } from './inspect-glb.mjs';

test('counts mesh instances and reports transformed bounds and paint candidates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fork-glb-test-'));
  try {
    const doc = new Document();
    const buffer = doc.createBuffer();
    const position = doc.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,0, 2,0,0, 0,1,0])).setBuffer(buffer);
    const material = doc.createMaterial('BodyPaint');
    const mesh = doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute('POSITION', position).setMaterial(material));
    const scene = doc.createScene().addChild(doc.createNode().setMesh(mesh)).addChild(doc.createNode().setMesh(mesh).setTranslation([3,0,0]));
    doc.getRoot().setDefaultScene(scene);
    const file = join(dir, 'fixture.glb');
    await new NodeIO().write(file, doc);
    const report = await inspectGlb(file);
    assert.equal(report.meshCount, 1);
    assert.equal(report.meshInstances, 2);
    assert.equal(report.triangles, 2);
    assert.deepEqual(report.boundingBox.size, [5,1,0]);
    assert.equal(report.bodyPaintCandidates[0].name, 'BodyPaint');
    assert.equal(report.textureCount, 0);
    assert.equal(report.checks.fileAtMost10MB, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('rejects corrupt GLBs and wrong formats', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fork-glb-test-'));
  try {
    const file = join(dir, 'broken.glb');
    await writeFile(file, 'not a GLB');
    await assert.rejects(inspectGlb(file));
    await assert.rejects(inspectGlb(join(dir, 'model.obj')), /Expected a .glb/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
