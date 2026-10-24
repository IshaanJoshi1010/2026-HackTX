"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Color, DoubleSide, Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, UniformsUtils, WebGLRenderTarget } from "three";
import { HorizontalBlurShader } from "three/addons/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/addons/shaders/VerticalBlurShader.js";

/** Locally owned contact-shadow targets and blur materials, with explicit cleanup. */
export function ContactShadows({ low }: { low: boolean }) {
  const { gl, scene } = useThree();
  const capture = useRef<(() => void) | null>(null);
  useEffect(() => {
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
    let lastSignature = "";
    capture.current = () => {
      let signature = "";
      scene.traverse((object) => {
        const mesh = object as Mesh;
        if (mesh.isMesh && !mesh.userData.contactIgnore) {
          const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
          signature += mesh.uuid + material.opacity.toFixed(2);
        }
      });
      if (signature === lastSignature) return;
      lastSignature = signature;
      const hidden: Mesh[] = [];
      scene.traverse((object) => { if (object.userData.contactIgnore && object.visible) { object.visible = false; hidden.push(object as Mesh); } });
      const previousTarget = gl.getRenderTarget();
      const background = scene.background, override = scene.overrideMaterial;
      const clearColor = gl.getClearColor(new Color()), clearAlpha = gl.getClearAlpha();
      const shadows = gl.shadowMap.autoUpdate;
      try {
        gl.shadowMap.autoUpdate = false;
        scene.background = null; scene.overrideMaterial = depth;
        gl.setClearColor(0, 0); gl.setRenderTarget(target); gl.clear(); gl.render(scene, camera);
        horizontal.uniforms.tDiffuse.value = target.texture; horizontal.uniforms.h.value = 1.6 / size;
        quad.material = horizontal; gl.setRenderTarget(scratch); gl.clear(); gl.render(blurScene, blurCamera);
        vertical.uniforms.tDiffuse.value = scratch.texture; vertical.uniforms.v.value = 1.6 / size;
        quad.material = vertical; gl.setRenderTarget(target); gl.clear(); gl.render(blurScene, blurCamera);
      } finally {
        scene.background = background; scene.overrideMaterial = override;
        hidden.forEach((object) => { object.visible = true; });
        gl.setClearColor(clearColor, clearAlpha); gl.setRenderTarget(previousTarget); gl.shadowMap.autoUpdate = shadows;
      }
    };
    return () => {
      capture.current = null; surface.removeFromParent();
      target.dispose(); scratch.dispose(); depth.dispose(); horizontal.dispose(); vertical.dispose();
      quadGeometry.dispose(); surfaceGeometry.dispose(); surfaceMaterial.dispose();
    };
  }, [gl, scene, low]);
  useFrame(() => capture.current?.(), -0.5);
  return null;
}
