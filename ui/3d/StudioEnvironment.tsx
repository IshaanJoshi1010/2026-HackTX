"use client";

import { useEffect } from "react";
import { applyProps, useThree } from "@react-three/fiber";
import { Color, Mesh, MeshBasicMaterial, PlaneGeometry, PMREMGenerator, Scene } from "three";
import { disposeObject } from "./dispose";

/** Own the PMREM target directly so it is not retained in a renderer cubemap cache. */
export function StudioEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const room = new Scene(); room.background = new Color("#292b30");
    for (const [x, y, z, width, height, power] of [[0, 5, 1, 8, 3, 5], [-4, 3, 4, 7, 3, 3], [2, 3, -4, 7, 2, 4]]) {
      const panel = new Mesh(new PlaneGeometry(width, height), new MeshBasicMaterial({ color: new Color(power, power, power) }));
      panel.position.set(x, y, z); panel.lookAt(0, 0.6, 0); room.add(panel);
    }
    const generator = new PMREMGenerator(gl);
    const environment = generator.fromScene(room, 0.06);
    generator.dispose(); disposeObject(room);
    const previous = scene.environment;
    applyProps(scene, { environment: environment.texture });
    return () => { applyProps(scene, { environment: previous }); environment.texture.dispose(); environment.dispose(); };
  }, [gl, scene]);
  return null;
}
