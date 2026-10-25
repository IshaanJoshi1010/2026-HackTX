import { expect, it, vi } from "vitest";
import { BoxGeometry, BufferGeometry, DynamicDrawUsage, Float32BufferAttribute, Group, InterleavedBuffer, InterleavedBufferAttribute, Mesh, MeshStandardMaterial } from "three";
import { cloneImmutableGeometry, cloneOwnedObject, disposeObject } from "../dispose";

it("owns attribute and GPU lifetimes while retaining immutable decoded arrays", () => {
  const source = new Group(), geometry = new BoxGeometry();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.setDrawRange(3, 9);
  geometry.morphAttributes.position = [new Float32BufferAttribute(geometry.attributes.position.array.slice(), 3)];
  geometry.morphTargetsRelative = true;
  source.add(new Mesh(geometry, new MeshStandardMaterial()));
  const originalArray = geometry.attributes.position.array.slice();
  const sourceDispose = vi.spyOn(geometry, "dispose");
  const clone = cloneOwnedObject(source), owned = (clone.children[0] as Mesh).geometry;
  expect(owned).not.toBe(geometry);
  expect(owned.attributes.position).not.toBe(geometry.attributes.position);
  expect(owned.attributes.position.array).toBe(geometry.attributes.position.array);
  expect(owned.index).not.toBe(geometry.index);
  expect(owned.index!.array).toBe(geometry.index!.array);
  expect(owned.morphAttributes.position![0]).not.toBe(geometry.morphAttributes.position![0]);
  expect(owned.morphAttributes.position![0].array).toBe(geometry.morphAttributes.position![0].array);
  expect(owned.morphTargetsRelative).toBe(true);
  expect(owned.groups).toEqual(geometry.groups);
  expect(owned.groups).not.toBe(geometry.groups);
  expect(owned.drawRange).toEqual({ start: 3, count: 9 });
  expect(owned.boundingBox).toEqual(geometry.boundingBox);
  expect(owned.boundingBox).not.toBe(geometry.boundingBox);
  expect(owned.boundingSphere).not.toBe(geometry.boundingSphere);
  const originalVersion = (geometry.attributes.position as Float32BufferAttribute).version;
  owned.attributes.position.needsUpdate = true;
  expect((geometry.attributes.position as Float32BufferAttribute).version).toBe(originalVersion);
  disposeObject(clone);
  expect(sourceDispose).not.toHaveBeenCalled();
  expect(geometry.attributes.position.array).toEqual(originalArray);
  disposeObject(source);
});

it("deep clones interleaved and dynamic attributes instead of assuming immutability", () => {
  const interleaved = new BufferGeometry();
  const data = new InterleavedBuffer(new Float32Array([0, 0, 0, 1, 2, 3]), 3);
  interleaved.setAttribute("position", new InterleavedBufferAttribute(data, 3, 0));
  const clone = cloneImmutableGeometry(interleaved);
  expect((clone.attributes.position as InterleavedBufferAttribute).data).not.toBe(data);
  expect(clone.attributes.position.array).not.toBe(data.array);
  const dynamic = new BufferGeometry().setAttribute("position", new Float32BufferAttribute([0, 0, 0], 3).setUsage(DynamicDrawUsage));
  const clonedDynamic = cloneImmutableGeometry(dynamic);
  expect(clonedDynamic.attributes.position.array).not.toBe(dynamic.attributes.position.array);
  clone.dispose(); interleaved.dispose(); dynamic.dispose(); clonedDynamic.dispose();
});
