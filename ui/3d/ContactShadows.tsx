"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { BufferGeometry, Color, DoubleSide, Material, Mesh, MeshBasicMaterial, Object3D, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, UniformsUtils, WebGLRenderer, WebGLRenderTarget } from "three";
import { HorizontalBlurShader } from "three/addons/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/addons/shaders/VerticalBlurShader.js";

type CasterSnapshot = {
  seen: number; geometry: BufferGeometry; castShadow: boolean; matrix: Float64Array;
  materials: Material[]; flags: Uint8Array;
};

/** Compare stable numeric snapshots without allocating signatures on each frame. */
export function createShadowTracker() {
  const snapshots = new Map<Mesh, CasterSnapshot>();
  let frame = 0, dirty = false, initialized = false;
  const visit = (object: Object3D) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || mesh.userData.contactIgnore) return;
    const count = Array.isArray(mesh.material) ? mesh.material.length : 1;
    let snapshot = snapshots.get(mesh);
    if (!snapshot || snapshot.materials.length !== count) {
      snapshot = { seen: frame, geometry: mesh.geometry, castShadow: mesh.castShadow,
        matrix: new Float64Array(16), materials: new Array<Material>(count), flags: new Uint8Array(count) };
      snapshots.set(mesh, snapshot); dirty = true;
    }
    snapshot.seen = frame;
    if (snapshot.geometry !== mesh.geometry || snapshot.castShadow !== mesh.castShadow) dirty = true;
    snapshot.geometry = mesh.geometry; snapshot.castShadow = mesh.castShadow;
    const matrix = mesh.matrixWorld.elements;
    for (let i = 0; i < 16; i++) {
      if (snapshot.matrix[i] !== matrix[i]) { snapshot.matrix[i] = matrix[i]; dirty = true; }
    }
    for (let i = 0; i < count; i++) {
      const material = Array.isArray(mesh.material) ? mesh.material[i] : mesh.material;
      const flags = (material.visible ? 1 : 0) | ("wireframe" in material && material.wireframe ? 2 : 0);
      if (snapshot.materials[i] !== material || snapshot.flags[i] !== flags) dirty = true;
      snapshot.materials[i] = material; snapshot.flags[i] = flags;
    }
  };
  const prune = (snapshot: CasterSnapshot, mesh: Mesh) => {
    if (snapshot.seen !== frame) { snapshots.delete(mesh); dirty = true; }
  };
  return {
    changed(scene: Object3D) {
      frame++; dirty = !initialized; initialized = true;
      // Ancestor visibility is respected. Removed/hidden casters are released.
      scene.traverseVisible(visit); snapshots.forEach(prune);
      return dirty;
    },
    clear() { snapshots.clear(); initialized = false; },
    get size() { return snapshots.size; },
  };
}

function cacheDirectionalShadows(renderer: WebGLRenderer) {
  const original = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false;
  return () => {
    renderer.shadowMap.autoUpdate = original;
    renderer.shadowMap.needsUpdate = true;
  };
}

/** Locally owned contact-shadow targets and blur materials, with explicit cleanup. */
export function ContactShadows({ low }: { low: boolean }) {
  const { gl, scene } = useThree();
  const capture = useRef<(() => void) | null>(null);
  useEffect(() => {
    // The cars and studio lights stay fixed while the camera orbits. Reuse both
    // shadow maps until the visible caster set or its world transform changes.
    const restoreShadowUpdates = cacheDirectionalShadows(gl);
    const size = low ? 256 : 512;
    const target = new WebGLRenderTarget(size, size);
    const scratch = new WebGLRenderTarget(size, size);
    const camera = new OrthographicCamera(-3.4, 3.4, 2.1, -2.1, 0.01, 3);
    camera.position.set(0, -0.02, 0); camera.up.set(0, 0, 1); camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
    const depth = new ShaderMaterial({ side: DoubleSide, uniforms: {},
      vertexShader: "varying float height; void main(){vec4 p=modelMatrix*vec4(position,1.0);height=p.y;gl_Position=projectionMatrix*viewMatrix*p;}",
      fragmentShader: "varying float height;void main(){gl_FragColor=vec4(0.,0.,0.,clamp(1.-height/2.2,0.,1.)*.65);}",
    });
    const horizontal = new ShaderMaterial({ ...HorizontalBlurShader, uniforms: UniformsUtils.clone(HorizontalBlurShader.uniforms), depthTest: false, depthWrite: false });
    const vertical = new ShaderMaterial({ ...VerticalBlurShader, uniforms: UniformsUtils.clone(VerticalBlurShader.uniforms), depthTest: false, depthWrite: false });
    const quadGeometry = new PlaneGeometry(2, 2);
    const quad = new Mesh(quadGeometry, horizontal);
    const blurScene = new Scene(); blurScene.add(quad);
    const blurCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const surfaceGeometry = new PlaneGeometry(6.8, 4.2);
    const surfaceMaterial = new MeshBasicMaterial({ map: target.texture, transparent: true, depthWrite: false, toneMapped: false });
    const surface = new Mesh(surfaceGeometry, surfaceMaterial);
    surface.rotation.x = -Math.PI / 2; surface.position.y = -0.003; surface.userData.contactIgnore = true;
    scene.add(surface);
    const shadowTracker = createShadowTracker();
    capture.current = () => {
      scene.updateMatrixWorld();
      if (!shadowTracker.changed(scene)) return;
      const hidden: Mesh[] = [];
      scene.traverse((object) => { if (object.userData.contactIgnore && object.visible) { object.visible = false; hidden.push(object as Mesh); } });
      const previousTarget = gl.getRenderTarget();
      const background = scene.background, override = scene.overrideMaterial;
      const clearColor = gl.getClearColor(new Color()), clearAlpha = gl.getClearAlpha();
      try {
        // Keep the temporary override depth shader out of the directional map.
        gl.shadowMap.needsUpdate = false;
        scene.background = null; scene.overrideMaterial = depth;
        gl.setClearColor(0, 0); gl.setRenderTarget(target); gl.clear(); gl.render(scene, camera);
        horizontal.uniforms.tDiffuse.value = target.texture; horizontal.uniforms.h.value = 1.6 / size;
        quad.material = horizontal; gl.setRenderTarget(scratch); gl.clear(); gl.render(blurScene, blurCamera);
        vertical.uniforms.tDiffuse.value = scratch.texture; vertical.uniforms.v.value = 1.6 / size;
        quad.material = vertical; gl.setRenderTarget(target); gl.clear(); gl.render(blurScene, blurCamera);
      } finally {
        scene.background = background; scene.overrideMaterial = override;
        hidden.forEach((object) => { object.visible = true; });
        gl.setClearColor(clearColor, clearAlpha); gl.setRenderTarget(previousTarget);
        gl.shadowMap.needsUpdate = true;
      }
    };
    return () => {
      capture.current = null; surface.removeFromParent();
      shadowTracker.clear();
      restoreShadowUpdates();
      target.dispose(); scratch.dispose(); depth.dispose(); horizontal.dispose(); vertical.dispose();
      quadGeometry.dispose(); surfaceGeometry.dispose(); surfaceMaterial.dispose();
    };
  }, [gl, scene, low]);
  useFrame(() => capture.current?.(), -0.5);
  return null;
}
